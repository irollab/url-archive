const whyEl = document.getElementById('why') as HTMLTextAreaElement;
const btn = document.getElementById('clip') as HTMLButtonElement;
const importBtn = document.getElementById('importBookmarks') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const statsEl = document.getElementById('stats') as HTMLParagraphElement;
const revisitEl = document.getElementById('revisit') as HTMLElement;
const revisitMetaEl = document.getElementById('revisitMeta') as HTMLSpanElement;
const revisitOpenEl = document.getElementById('revisitOpen') as HTMLButtonElement;
const revisitTitleEl = document.getElementById('revisitTitle') as HTMLSpanElement;
const revisitSummaryEl = document.getElementById('revisitSummary') as HTMLElement;
const searchEl = document.getElementById('search') as HTMLInputElement;
const searchResultsEl = document.getElementById('searchResults') as HTMLDivElement;
const categoryNavEl = document.getElementById('categoryNav') as HTMLElement;
const categoryBackEl = document.getElementById('categoryBack') as HTMLButtonElement;
const categoryCrumbEl = document.getElementById('categoryCrumb') as HTMLSpanElement;
const categoryGridEl = document.getElementById('categoryGrid') as HTMLDivElement;
const editPanelEl = document.getElementById('editPanel') as HTMLElement;
const editCloseEl = document.getElementById('editClose') as HTMLButtonElement;
const editTitleEl = document.getElementById('editTitle') as HTMLInputElement;
const editFolderEl = document.getElementById('editFolder') as HTMLInputElement;
const editTagsEl = document.getElementById('editTags') as HTMLInputElement;
const editWhyEl = document.getElementById('editWhy') as HTMLTextAreaElement;
const editSaveEl = document.getElementById('editSave') as HTMLButtonElement;
const editCancelEl = document.getElementById('editCancel') as HTMLButtonElement;
const filterEls = [...document.querySelectorAll<HTMLButtonElement>('.filter')];

type ClipFilter = 'all' | 'clip' | 'bookmark' | 'queued' | 'unvisited' | 'visited';

type SavedClip = {
  url: string;
  canonicalUrl?: string;
  title: string;
  domain: string;
  folder?: string;
  faviconUrl?: string;
  source?: 'clip' | 'bookmark';
  summary: string;
  tags: string[];
  why: string;
  revived: number;
  queued: boolean;
  lastVisited: string;
};

type SavedClipStats = {
  total: number;
  clips: number;
  bookmarks: number;
  queued: number;
  unvisited: number;
  visited: number;
};

type BookmarkFolderOption = {
  path: string;
  count: number;
};

let currentFilter: ClipFilter = 'all';
let currentFolder = '';
let bookmarkFolders: BookmarkFolderOption[] = [];
let editingClip: SavedClip | null = null;

searchEl.focus();

async function loadRevisitSuggestion() {
  const res = await chrome.runtime.sendMessage({ type: 'SUGGEST_REVISIT' });
  if (!res?.ok || !res.clip) return;

  const clip = res.clip as SavedClip;
  revisitEl.hidden = false;
  revisitMetaEl.textContent = `${clip.domain}${clip.revived ? ` · 已回访 ${clip.revived} 次` : ''}`;
  revisitTitleEl.textContent = clip.title || clip.url;
  revisitSummaryEl.textContent = clip.summary || (clip.queued ? '已暂存，等待写入 Obsidian' : '暂无摘要');
  revisitOpenEl.onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'OPEN_REVISIT', url: clip.url });
    window.close();
  };
}

function renderSearchResults(clips: SavedClip[]) {
  searchResultsEl.replaceChildren();
  if (!clips.length) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = searchEl.value.trim() ? '没有匹配的收藏' : '暂无收藏索引';
    searchResultsEl.append(empty);
    return;
  }

  for (const clip of clips) {
    const item = document.createElement('article');
    item.className = 'search-result';
    if (clip.queued) item.classList.add('queued');

    const favicon = document.createElement('img');
    favicon.className = 'result-favicon';
    favicon.alt = '';
    favicon.src = clip.faviconUrl || faviconForClip(clip);
    favicon.addEventListener('error', () => {
      favicon.replaceWith(domainFallback(clip.domain));
    }, { once: true });

    const body = document.createElement('button');
    body.type = 'button';
    body.className = 'result-body';

    const head = document.createElement('span');
    head.className = 'result-head';

    const title = document.createElement('span');
    title.className = 'result-title';
    title.textContent = clip.title || clip.url;

    const badge = document.createElement('span');
    badge.className = clip.source === 'bookmark' ? 'badge bookmark' : 'badge clip';
    badge.textContent = clip.source === 'bookmark' ? '书签' : (clip.queued ? '暂存' : '剪藏');
    head.append(title, badge);

    const meta = document.createElement('small');
    const tags = clip.tags.length ? ` · ${clip.tags.slice(0, 3).join(' / ')}` : '';
    const folder = clip.folder ? ` · ${clip.folder}` : '';
    meta.textContent = `${clip.domain}${folder}${tags}`;

    const summary = document.createElement('span');
    summary.className = 'result-summary';
    summary.textContent = clip.summary || (clip.lastVisited ? '已回访' : '尚未回访');

    body.append(head, meta, summary);
    body.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'OPEN_REVISIT', url: clip.url });
      window.close();
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-button';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => openEditPanel(clip));

    item.append(favicon, body, editBtn);
    searchResultsEl.append(item);
  }
}

function faviconForClip(clip: SavedClip): string {
  try {
    return `${new URL(clip.url).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

function domainFallback(domain: string): HTMLElement {
  const fallback = document.createElement('span');
  fallback.className = 'result-favicon fallback';
  fallback.textContent = (domain || '?').slice(0, 1).toUpperCase();
  return fallback;
}

async function searchClips() {
  const res = await chrome.runtime.sendMessage({
    type: 'SEARCH_CLIPS',
    query: searchEl.value,
    filter: currentFilter,
    folder: currentFilter === 'bookmark' ? currentFolder : '',
  });
  if (res?.ok) renderSearchResults(res.clips as SavedClip[]);
}

async function refreshBookmarkFolders() {
  const res = await chrome.runtime.sendMessage({ type: 'BOOKMARK_FOLDERS' });
  if (!res?.ok) return;

  bookmarkFolders = res.folders as BookmarkFolderOption[];
  if (currentFolder && !bookmarkFolders.some((folder) => folder.path === currentFolder)) {
    currentFolder = '';
  }
  renderCategoryNav();
}

function renderCategoryNav() {
  categoryNavEl.hidden = bookmarkFolders.length === 0;
  categoryCrumbEl.textContent = currentFolder || '全部书签分类';
  categoryBackEl.hidden = !currentFolder;
  categoryGridEl.replaceChildren();

  const children = getChildFolders(currentFolder);
  if (!children.length) {
    const empty = document.createElement('span');
    empty.className = 'category-empty';
    empty.textContent = currentFolder ? '当前分类没有子分类' : '暂无书签分类';
    categoryGridEl.append(empty);
    return;
  }

  for (const folder of children) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-item';
    btn.title = folder.path;

    const name = document.createElement('span');
    name.textContent = getFolderName(folder.path);
    const count = document.createElement('small');
    count.textContent = `${folder.count}`;
    btn.append(name, count);

    btn.addEventListener('click', () => {
      currentFolder = folder.path;
      currentFilter = 'bookmark';
      syncFilterButtons();
      renderCategoryNav();
      searchClips();
    });
    categoryGridEl.append(btn);
  }
}

function getChildFolders(parent: string): BookmarkFolderOption[] {
  const prefix = parent ? `${parent} / ` : '';
  const depth = parent ? parent.split(' / ').length + 1 : 1;
  return bookmarkFolders
    .filter((folder) => folder.path.startsWith(prefix) && folder.path.split(' / ').length === depth)
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path, 'zh-CN'));
}

function getFolderName(path: string): string {
  const parts = path.split(' / ');
  return parts[parts.length - 1] ?? path;
}

function parentFolder(path: string): string {
  const parts = path.split(' / ').filter(Boolean);
  return parts.slice(0, -1).join(' / ');
}

function openEditPanel(clip: SavedClip) {
  editingClip = clip;
  editTitleEl.value = clip.title || '';
  editFolderEl.value = clip.folder || '';
  editTagsEl.value = clip.tags.join(', ');
  editWhyEl.value = clip.why || '';
  editPanelEl.hidden = false;
  editTitleEl.focus();
}

function closeEditPanel() {
  editingClip = null;
  editPanelEl.hidden = true;
}

async function saveEdit() {
  if (!editingClip) return;
  editSaveEl.disabled = true;
  const res = await chrome.runtime.sendMessage({
    type: 'UPDATE_SAVED_CLIP',
    update: {
      url: editingClip.url,
      canonicalUrl: editingClip.canonicalUrl,
      title: editTitleEl.value,
      folder: editFolderEl.value,
      tags: editTagsEl.value.split(/[,，]/),
      why: editWhyEl.value,
      summary: editWhyEl.value || editingClip.summary,
    },
  });

  if (res?.ok) {
    statusEl.textContent = '✓ 已保存收藏信息';
    closeEditPanel();
    await refreshBookmarkFolders();
    await Promise.all([refreshStats(), searchClips()]);
  } else {
    statusEl.textContent = `✗ 保存失败：${res?.error ?? '未知错误'}`;
  }
  editSaveEl.disabled = false;
}

async function refreshStats() {
  const res = await chrome.runtime.sendMessage({ type: 'SAVED_CLIP_STATS' });
  if (!res?.ok) {
    statsEl.textContent = '无法读取收藏统计';
    return;
  }

  const stats = res.stats as SavedClipStats;
  statsEl.textContent = `${stats.total} 条收藏 · ${stats.clips} 条剪藏 · ${stats.bookmarks} 个浏览器书签`;
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.textContent = '剪藏中…';
  const res = await chrome.runtime.sendMessage({ type: 'CAPTURE', why: whyEl.value });
  if (res?.ok && res.written) {
    statusEl.textContent = '✓ 已剪藏到 Obsidian';
    setTimeout(() => window.close(), 800);
  } else if (res?.ok && !res.written) {
    statusEl.textContent = `✓ 已暂存（${res.queuedReason ?? 'Obsidian 不可用'}，恢复后自动写入）`;
    await Promise.all([refreshStats(), searchClips()]);
  } else {
    statusEl.textContent = `✗ 失败：${res?.error ?? '未知错误'}`;
    btn.disabled = false;
  }
});

importBtn.addEventListener('click', async () => {
  importBtn.disabled = true;
  statusEl.textContent = '正在导入浏览器书签…';
  const res = await chrome.runtime.sendMessage({ type: 'IMPORT_BROWSER_BOOKMARKS' });
  if (res?.ok) {
    statusEl.textContent = `✓ 已导入 ${res.imported ?? 0} 个浏览器书签`;
    currentFilter = 'bookmark';
    currentFolder = '';
    syncFilterButtons();
    await refreshBookmarkFolders();
    await Promise.all([refreshStats(), searchClips()]);
  } else {
    statusEl.textContent = `✗ 导入失败：${res?.error ?? '未知错误'}`;
  }
  importBtn.disabled = false;
});

for (const filterEl of filterEls) {
  filterEl.addEventListener('click', () => {
    currentFilter = (filterEl.dataset.filter ?? 'all') as ClipFilter;
    if (currentFilter !== 'bookmark') currentFolder = '';
    syncFilterButtons();
    renderCategoryNav();
    searchClips();
  });
}

function syncFilterButtons() {
  for (const filterEl of filterEls) {
    filterEl.classList.toggle('active', filterEl.dataset.filter === currentFilter);
  }
}

categoryBackEl.addEventListener('click', () => {
  currentFolder = parentFolder(currentFolder);
  currentFilter = currentFolder ? 'bookmark' : currentFilter;
  syncFilterButtons();
  renderCategoryNav();
  searchClips();
});

editSaveEl.addEventListener('click', saveEdit);
editCancelEl.addEventListener('click', closeEditPanel);
editCloseEl.addEventListener('click', closeEditPanel);

loadRevisitSuggestion();
refreshStats();
refreshBookmarkFolders();
searchClips();
searchEl.addEventListener('input', searchClips);
