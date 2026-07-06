import {
  App,
  type FuzzyMatch,
  FuzzySuggestModal,
  ItemView,
  Modal,
  MarkdownView,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  WorkspaceLeaf,
  addIcon,
  normalizePath,
} from 'obsidian';
import { ClipServer } from './clip-server';
import {
  entryFromFrontmatter,
  pickDormantEntry,
  searchArchive,
  type ArchiveFrontmatter,
  type UrlArchiveEntry,
} from './archive-index';
import { createChatAnswer } from './chat-provider';
import { createEmbedding } from './embedding-provider';
import { buildRagContext, type RagSource } from './rag';
import { buildCurrentNoteQuery, relatedHitsForCurrentNote } from './related';
import { getDormantEntries, renderDormantReviewMarkdown } from './revival';
import {
  buildEmbeddingText,
  searchSemanticIndex,
  type SemanticSearchHit,
  type SemanticVector,
} from './semantic-index';
import irollabIconSvg from '../assets/IROLLAB_dark.svg';

interface UrlArchivePluginSettings {
  archiveFolder: string;
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  chatBaseUrl: string;
  chatApiKey: string;
  chatModel: string;
  reviewFolder: string;
  dormantDays: number;
  reviewLimit: number;
  clipServerEnabled: boolean;
  clipServerPort: number;
  clipServerToken: string;
}

const DEFAULT_SETTINGS: UrlArchivePluginSettings = {
  archiveFolder: 'URL Archive',
  embeddingBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  embeddingApiKey: '',
  embeddingModel: 'embedding-3',
  chatBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  chatApiKey: '',
  chatModel: 'glm-5.2',
  reviewFolder: 'URL Archive Reviews',
  dormantDays: 14,
  reviewLimit: 5,
  clipServerEnabled: true,
  clipServerPort: 27125,
  clipServerToken: '',
};

const URL_ARCHIVE_VIEW_TYPE = 'url-archive-panel';
const IROLLAB_ICON_ID = 'irollab';

interface UrlArchivePluginData {
  settings?: Partial<UrlArchivePluginSettings>;
  semanticVectors?: SemanticVector[];
}

export default class UrlArchivePlugin extends Plugin {
  settings: UrlArchivePluginSettings = DEFAULT_SETTINGS;
  private entries: UrlArchiveEntry[] = [];
  private semanticVectors: SemanticVector[] = [];
  private clipServer: ClipServer | null = null;

  async onload() {
    await this.loadSettings();
    await this.rebuildIndex();
    await this.startClipServer();
    addIcon(IROLLAB_ICON_ID, getSvgBody(irollabIconSvg));
    this.registerView(URL_ARCHIVE_VIEW_TYPE, (leaf) => new UrlArchivePanelView(leaf, this));
    this.addRibbonIcon(IROLLAB_ICON_ID, '打开 URL Archive 面板', () => {
      this.activatePanel();
    });

    this.addCommand({
      id: 'rebuild-url-archive-index',
      name: '重建 URL Archive 索引',
      callback: async () => {
        await this.rebuildIndex();
        new Notice(`URL Archive 已索引 ${this.entries.length} 条收藏`);
      },
    });

    this.addCommand({
      id: 'search-url-archive',
      name: '搜索 URL Archive',
      callback: () => {
        this.openKeywordSearch();
      },
    });

    this.addCommand({
      id: 'rebuild-url-archive-semantic-index',
      name: '重建 URL Archive 语义索引',
      callback: async () => {
        await this.rebuildSemanticIndex();
      },
    });

    this.addCommand({
      id: 'semantic-search-url-archive',
      name: '语义搜索 URL Archive',
      callback: () => {
        this.openSemanticSearch();
      },
    });

    this.addCommand({
      id: 'ask-url-archive',
      name: '问答 URL Archive',
      callback: () => {
        this.openAskModal();
      },
    });

    this.addCommand({
      id: 'revive-url-archive-clip',
      name: '回访一条沉睡收藏',
      callback: async () => {
        const entry = pickDormantEntry(this.entries);
        if (!entry) {
          new Notice('没有找到 URL Archive 收藏');
          return;
        }
        await this.openEntry(entry);
      },
    });

    this.addCommand({
      id: 'create-url-archive-dormant-review',
      name: '生成沉睡收藏回顾',
      callback: async () => {
        await this.createDormantReview();
      },
    });

    this.addCommand({
      id: 'suggest-related-url-archive-clips',
      name: '为当前笔记推荐相关收藏',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;
        if (!checking) {
          this.suggestRelatedForCurrentNote(view).catch((error) => {
            new Notice(error instanceof Error ? error.message : String(error));
          });
        }
        return true;
      },
    });

    this.addCommand({
      id: 'open-url-archive-panel',
      name: '打开 URL Archive 面板',
      callback: () => {
        this.activatePanel();
      },
    });

    this.registerEvent(this.app.vault.on('create', () => this.rebuildIndex()));
    this.registerEvent(this.app.vault.on('modify', () => this.rebuildIndex()));
    this.registerEvent(this.app.vault.on('delete', () => this.rebuildIndex()));
    this.addSettingTab(new UrlArchiveSettingTab(this.app, this));
  }

  async rebuildIndex() {
    const files = this.app.vault.getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${this.settings.archiveFolder.replace(/\/+$/, '')}/`));
    const entries: UrlArchiveEntry[] = [];

    for (const file of files) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as ArchiveFrontmatter | undefined;
      if (!frontmatter) continue;
      const entry = entryFromFrontmatter(file.path, frontmatter);
      if (entry) entries.push(entry);
    }

    this.entries = entries.sort((a, b) => b.clipped.localeCompare(a.clipped));
  }

  async onunload() {
    await this.stopClipServer();
  }

  getStats() {
    return {
      entries: this.entries.length,
      semanticVectors: this.semanticVectors.length,
      clipServer: this.clipServer?.running ?? false,
    };
  }

  /** 启动本地剪藏接收服务：仅桌面端、开关开启且已配置 Token */
  async startClipServer(): Promise<void> {
    if (this.clipServer) return;
    if (!this.settings.clipServerEnabled) return;
    if (Platform.isMobileApp) return; // 移动端无法运行本地 HTTP 服务
    if (!this.settings.clipServerToken) {
      this.settings.clipServerToken = generateToken();
      await this.savePluginData();
    }

    const server = new ClipServer({
      port: this.settings.clipServerPort,
      token: this.settings.clipServerToken,
      writeNote: (path, content) => this.writeClipNote(path, content),
      log: (message) => console.info(`[URL Archive] ${message}`),
    });

    try {
      await server.start();
      this.clipServer = server;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`URL Archive 剪藏服务启动失败：${message}`);
      console.error('[URL Archive] 剪藏服务启动失败', error);
    }
  }

  async stopClipServer(): Promise<void> {
    if (!this.clipServer) return;
    await this.clipServer.stop();
    this.clipServer = null;
  }

  /** 应用设置变更后重启服务，使端口/开关/Token 生效 */
  async restartClipServer(): Promise<void> {
    await this.stopClipServer();
    await this.startClipServer();
  }

  /** 把浏览器扩展发来的 markdown 写入 vault，父文件夹缺失时自动创建 */
  private async writeClipNote(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    await this.ensureParentFolder(normalized);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(normalized, content);
    }
    await this.rebuildIndex();
  }

  private async ensureParentFolder(path: string): Promise<void> {
    const slash = path.lastIndexOf('/');
    if (slash <= 0) return;
    const folder = path.slice(0, slash);
    if (this.app.vault.getAbstractFileByPath(folder) instanceof TFolder) return;
    await this.app.vault.createFolder(folder).catch(() => undefined); // 并发/已存在时忽略
  }

  openKeywordSearch() {
    new ArchiveSearchModal(this.app, this.entries, async (entry) => {
      await this.openEntry(entry);
    }).open();
  }

  openSemanticSearch() {
    new SemanticSearchModal(this.app, async (query) => {
      return this.semanticSearch(query);
    }, async (entry) => {
      await this.openEntry(entry);
    }).open();
  }

  openAskModal() {
    new AskUrlArchiveModal(this.app, async (question) => {
      return this.answerQuestion(question);
    }).open();
  }

  async activatePanel() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(URL_ARCHIVE_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: URL_ARCHIVE_VIEW_TYPE, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  async rebuildSemanticIndex() {
    await this.rebuildIndex();
    const vectors: SemanticVector[] = [];
    let indexed = 0;

    for (const entry of this.entries) {
      const text = buildEmbeddingText(entry);
      if (!text.trim()) continue;
      const embedding = await createEmbedding(text, this.settings);
      vectors.push({ path: entry.path, embedding, indexedAt: new Date().toISOString() });
      indexed += 1;
      if (indexed % 5 === 0) new Notice(`URL Archive 语义索引：${indexed}/${this.entries.length}`);
    }

    this.semanticVectors = vectors;
    await this.savePluginData();
    new Notice(`URL Archive 语义索引已完成：${vectors.length} 条收藏`);
  }

  async semanticSearch(query: string): Promise<SemanticSearchHit[]> {
    if (!this.semanticVectors.length) {
      throw new Error('语义索引为空，请先运行“重建 URL Archive 语义索引”');
    }
    const embedding = await createEmbedding(query, this.settings);
    return searchSemanticIndex(this.entries, this.semanticVectors, embedding, 10);
  }

  async answerQuestion(question: string): Promise<{ answer: string; sources: RagSource[] }> {
    const hits = await this.semanticSearch(question);
    const context = buildRagContext(question, hits, 5);
    const answer = await createChatAnswer(context.prompt, this.settings);
    return { answer, sources: context.sources };
  }

  async createDormantReview() {
    await this.rebuildIndex();
    const now = new Date();
    const entries = getDormantEntries(this.entries, now, this.settings.dormantDays, this.settings.reviewLimit);
    const markdown = renderDormantReviewMarkdown(entries, now);
    const folder = normalizePath(this.settings.reviewFolder || DEFAULT_SETTINGS.reviewFolder);
    const path = normalizePath(`${folder}/${now.toISOString().slice(0, 10)}.md`);

    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    const existing = this.app.vault.getAbstractFileByPath(path);
    let file: TFile;
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, markdown);
      file = existing;
    } else {
      file = await this.app.vault.create(path, markdown);
    }
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice(`URL Archive 回顾已生成：${entries.length} 条收藏`);
  }

  async suggestRelatedForCurrentNote(view: MarkdownView) {
    if (!this.semanticVectors.length) {
      throw new Error('语义索引为空，请先运行“重建 URL Archive 语义索引”');
    }
    if (!view.file) throw new Error('当前没有打开 markdown 笔记');
    const content = await this.app.vault.read(view.file);
    const query = buildCurrentNoteQuery(view.file.path, content);
    const embedding = await createEmbedding(query, this.settings);
    const hits = relatedHitsForCurrentNote(this.entries, this.semanticVectors, embedding, view.file.path, 5);
    new RelatedClipsModal(this.app, hits, async (entry) => {
      await this.openEntry(entry);
    }).open();
  }

  async openEntry(entry: UrlArchiveEntry) {
    const file = this.app.vault.getAbstractFileByPath(entry.path);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
      await this.markVisited(file);
      return;
    }
    window.open(entry.url, '_blank');
  }

  async markVisited(file: TFile) {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.last_visited = new Date().toISOString();
      frontmatter.revived = Number(frontmatter.revived ?? 0) + 1;
    });
    await this.rebuildIndex();
  }

  async loadSettings() {
    const data = (await this.loadData()) as UrlArchivePluginData | Partial<UrlArchivePluginSettings> | null;
    if (data && 'archiveFolder' in data) {
      this.settings = { ...DEFAULT_SETTINGS, ...(data as Partial<UrlArchivePluginSettings>) };
      this.semanticVectors = [];
      return;
    }
    this.settings = { ...DEFAULT_SETTINGS, ...(data as UrlArchivePluginData | null)?.settings };
    this.semanticVectors = (data as UrlArchivePluginData | null)?.semanticVectors ?? [];
  }

  async saveSettings() {
    await this.savePluginData();
    await this.rebuildIndex();
  }

  async savePluginData() {
    await this.saveData({
      settings: this.settings,
      semanticVectors: this.semanticVectors,
    } satisfies UrlArchivePluginData);
  }
}

/** 生成一段随机 Token，用于剪藏服务鉴权 */
function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function getSvgBody(svg: string): string {
  return svg
    .replace(/<\?xml[\s\S]*?\?>/i, '')
    .replace(/<!doctype[\s\S]*?>/i, '')
    .replace(/<\/?svg[^>]*>/gi, '')
    .trim();
}

class ArchiveSearchModal extends FuzzySuggestModal<UrlArchiveEntry> {
  constructor(
    app: App,
    private entries: UrlArchiveEntry[],
    private onChoose: (entry: UrlArchiveEntry) => Promise<void>,
  ) {
    super(app);
    this.setPlaceholder('按标题、标签、别名、场景、摘要搜索 URL Archive...');
  }

  getItems(): UrlArchiveEntry[] {
    return this.entries;
  }

  getItemText(entry: UrlArchiveEntry): string {
    return [
      entry.title,
      entry.domain,
      entry.tags.join(' '),
      entry.keywords.join(' '),
      entry.aliases.join(' '),
      entry.intent,
      entry.summary,
      entry.why,
      entry.url,
    ].join(' ');
  }

  renderSuggestion(match: FuzzyMatch<UrlArchiveEntry>, el: HTMLElement) {
    const entry = match.item;
    el.createEl('div', { text: entry.title || entry.url, cls: 'suggestion-title' });
    el.createEl('small', {
      text: `${entry.domain}${entry.summary ? ` - ${entry.summary}` : ''}`,
      cls: 'suggestion-note',
    });
  }

  async onChooseItem(entry: UrlArchiveEntry) {
    await this.onChoose(entry);
  }
}

class SemanticSearchModal extends Modal {
  private resultsEl!: HTMLElement;
  private inputEl!: HTMLInputElement;

  constructor(
    app: App,
    private search: (query: string) => Promise<SemanticSearchHit[]>,
    private onChoose: (entry: UrlArchiveEntry) => Promise<void>,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: '语义搜索 URL Archive' });
    this.inputEl = contentEl.createEl('input', {
      type: 'text',
      placeholder: '描述你记得的内容或意图...',
    });
    this.inputEl.style.width = '100%';
    this.inputEl.style.marginBottom = '12px';
    this.resultsEl = contentEl.createDiv();

    this.inputEl.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;
      await this.runSearch();
    });
    this.inputEl.focus();
  }

  private async runSearch() {
    const query = this.inputEl.value.trim();
    if (!query) return;
    this.resultsEl.empty();
    this.resultsEl.createEl('p', { text: '搜索中...' });
    try {
      const hits = await this.search(query);
      this.renderHits(hits);
    } catch (error) {
      this.resultsEl.empty();
      this.resultsEl.createEl('p', { text: error instanceof Error ? error.message : String(error) });
    }
  }

  private renderHits(hits: SemanticSearchHit[]) {
    this.resultsEl.empty();
    if (!hits.length) {
      this.resultsEl.createEl('p', { text: '没有找到语义匹配。' });
      return;
    }
    for (const hit of hits) {
      const button = this.resultsEl.createEl('button', {
        text: `${hit.entry.title || hit.entry.url} (${hit.score.toFixed(3)})`,
      });
      button.style.display = 'block';
      button.style.width = '100%';
      button.style.marginBottom = '8px';
      button.onclick = async () => {
        await this.onChoose(hit.entry);
        this.close();
      };
      this.resultsEl.createEl('small', { text: hit.entry.summary || hit.entry.domain });
    }
  }
}

class AskUrlArchiveModal extends Modal {
  private resultsEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;

  constructor(
    app: App,
    private answer: (question: string) => Promise<{ answer: string; sources: RagSource[] }>,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: '问答 URL Archive' });
    this.inputEl = contentEl.createEl('textarea', {
      placeholder: '询问你的收藏，例如：有哪些财务自动化工具？',
    });
    this.inputEl.rows = 3;
    this.inputEl.style.width = '100%';
    this.inputEl.style.marginBottom = '12px';
    const button = contentEl.createEl('button', { text: '提问' });
    button.onclick = async () => this.runAnswer();
    this.resultsEl = contentEl.createDiv();
    this.inputEl.focus();
  }

  private async runAnswer() {
    const question = this.inputEl.value.trim();
    if (!question) return;
    this.resultsEl.empty();
    this.resultsEl.createEl('p', { text: '思考中...' });
    try {
      const result = await this.answer(question);
      this.renderAnswer(result.answer, result.sources);
    } catch (error) {
      this.resultsEl.empty();
      this.resultsEl.createEl('p', { text: error instanceof Error ? error.message : String(error) });
    }
  }

  private renderAnswer(answer: string, sources: RagSource[]) {
    this.resultsEl.empty();
    const answerEl = this.resultsEl.createEl('div');
    answerEl.style.whiteSpace = 'pre-wrap';
    answerEl.setText(answer);

    this.resultsEl.createEl('h3', { text: '来源' });
    if (!sources.length) {
      this.resultsEl.createEl('p', { text: '没有来源。' });
      return;
    }
    for (const source of sources) {
      this.resultsEl.createEl('div', {
        text: `${source.title || source.path} (${source.score.toFixed(3)}) - ${source.path}`,
      });
    }
  }
}

class RelatedClipsModal extends Modal {
  constructor(
    app: App,
    private hits: SemanticSearchHit[],
    private onChoose: (entry: UrlArchiveEntry) => Promise<void>,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: '相关 URL Archive 收藏' });
    if (!this.hits.length) {
      contentEl.createEl('p', { text: '没有找到相关收藏。' });
      return;
    }

    for (const hit of this.hits) {
      const button = contentEl.createEl('button', {
        text: `${hit.entry.title || hit.entry.url} (${hit.score.toFixed(3)})`,
      });
      button.style.display = 'block';
      button.style.width = '100%';
      button.style.marginBottom = '6px';
      button.onclick = async () => {
        await this.onChoose(hit.entry);
        this.close();
      };
      contentEl.createEl('small', { text: hit.entry.summary || hit.entry.domain });
      contentEl.createEl('hr');
    }
  }
}

class UrlArchivePanelView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: UrlArchivePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return URL_ARCHIVE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'URL Archive';
  }

  getIcon(): string {
    return IROLLAB_ICON_ID;
  }

  async onOpen() {
    this.render();
  }

  render() {
    const { containerEl } = this;
    containerEl.empty();
    const root = containerEl.createDiv({ cls: 'url-archive-panel' });
    root.createEl('h2', { text: 'URL Archive' });

    const stats = this.plugin.getStats();
    root.createEl('p', {
      text: `已索引 ${stats.entries} 条收藏，语义向量 ${stats.semanticVectors} 条`,
    });

    this.addButton(root, '搜索收藏', () => this.plugin.openKeywordSearch());
    this.addButton(root, '语义搜索', () => this.plugin.openSemanticSearch());
    this.addButton(root, '问答收藏库', () => this.plugin.openAskModal());
    this.addButton(root, '重建普通索引', async () => {
      await this.plugin.rebuildIndex();
      new Notice(`URL Archive 已索引 ${this.plugin.getStats().entries} 条收藏`);
      this.render();
    });
    this.addButton(root, '重建语义索引', async () => {
      await this.plugin.rebuildSemanticIndex();
      this.render();
    });
    this.addButton(root, '回访一条沉睡收藏', async () => {
      const entry = pickDormantEntry(this.plugin['entries']);
      if (!entry) {
        new Notice('没有找到 URL Archive 收藏');
        return;
      }
      await this.plugin.openEntry(entry);
    });
    this.addButton(root, '生成沉睡收藏回顾', async () => {
      await this.plugin.createDormantReview();
    });
    this.addButton(root, '为当前笔记推荐收藏', async () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view?.file) {
        new Notice('当前没有打开 markdown 笔记');
        return;
      }
      await this.plugin.suggestRelatedForCurrentNote(view);
    });
  }

  private addButton(parent: HTMLElement, text: string, onClick: () => void | Promise<void>) {
    const button = parent.createEl('button', { text });
    button.style.display = 'block';
    button.style.width = '100%';
    button.style.marginBottom = '8px';
    button.onclick = () => {
      Promise.resolve(onClick()).catch((error) => {
        new Notice(error instanceof Error ? error.message : String(error));
      });
    };
  }
}

class UrlArchiveSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: UrlArchivePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'URL Archive 设置' });

    new Setting(containerEl)
      .setName('收藏文件夹')
      .setDesc('存放 URL Archive 剪藏笔记的 markdown 文件夹。')
      .addText((text) => {
        text
          .setPlaceholder('URL Archive')
          .setValue(this.plugin.settings.archiveFolder)
          .onChange(async (value) => {
            this.plugin.settings.archiveFolder = value.trim() || DEFAULT_SETTINGS.archiveFolder;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Embedding API 端点')
      .setDesc('OpenAI 兼容 base URL，例如：https://open.bigmodel.cn/api/paas/v4')
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.embeddingBaseUrl)
          .setValue(this.plugin.settings.embeddingBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.embeddingBaseUrl = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Embedding API Key')
      .setDesc('仅保存在当前 vault 的插件数据中。')
      .addText((text) => {
        text
          .setPlaceholder('API key')
          .setValue(this.plugin.settings.embeddingApiKey)
          .onChange(async (value) => {
            this.plugin.settings.embeddingApiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Embedding 模型')
      .setDesc('填写你的服务商支持的 embedding 模型。')
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.embeddingModel)
          .setValue(this.plugin.settings.embeddingModel)
          .onChange(async (value) => {
            this.plugin.settings.embeddingModel = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Chat API 端点')
      .setDesc('OpenAI 兼容 chat base URL。')
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.chatBaseUrl)
          .setValue(this.plugin.settings.chatBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.chatBaseUrl = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Chat API Key')
      .setDesc('仅保存在当前 vault 的插件数据中。')
      .addText((text) => {
        text
          .setPlaceholder('API key')
          .setValue(this.plugin.settings.chatApiKey)
          .onChange(async (value) => {
            this.plugin.settings.chatApiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Chat 模型')
      .setDesc('智谱 GLM-5.2 填 glm-5.2。')
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.chatModel)
          .setValue(this.plugin.settings.chatModel)
          .onChange(async (value) => {
            this.plugin.settings.chatModel = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('回顾笔记文件夹')
      .setDesc('生成沉睡收藏回顾笔记的位置。')
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.reviewFolder)
          .setValue(this.plugin.settings.reviewFolder)
          .onChange(async (value) => {
            this.plugin.settings.reviewFolder = value.trim() || DEFAULT_SETTINGS.reviewFolder;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('沉睡阈值天数')
      .setDesc('收藏超过这么多天未访问，就会进入沉睡回顾候选。')
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.dormantDays))
          .setValue(String(this.plugin.settings.dormantDays))
          .onChange(async (value) => {
            const days = Number(value);
            this.plugin.settings.dormantDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_SETTINGS.dormantDays;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('回顾条目上限')
      .setDesc('一篇回顾笔记最多包含多少条沉睡收藏。')
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.reviewLimit))
          .setValue(String(this.plugin.settings.reviewLimit))
          .onChange(async (value) => {
            const limit = Number(value);
            this.plugin.settings.reviewLimit = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_SETTINGS.reviewLimit;
            await this.plugin.saveSettings();
          });
      });

    containerEl.createEl('h3', { text: '浏览器剪藏服务' });
    containerEl.createEl('p', {
      text: '开启后，URL Archive 浏览器扩展可直接把剪藏写入本 vault，无需再安装 Local REST API 插件。仅桌面端可用，服务只监听 127.0.0.1。',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('启用剪藏服务')
      .setDesc(Platform.isMobileApp ? '移动端不支持本地服务。' : '关闭后浏览器扩展将无法通过本插件写入。')
      .addToggle((toggle) => {
        toggle
          .setDisabled(Platform.isMobileApp)
          .setValue(this.plugin.settings.clipServerEnabled)
          .onChange(async (value) => {
            this.plugin.settings.clipServerEnabled = value;
            await this.plugin.saveSettings();
            await this.plugin.restartClipServer();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName('监听端口')
      .setDesc('浏览器扩展需填写相同端口，默认 27125。')
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.clipServerPort))
          .setValue(String(this.plugin.settings.clipServerPort))
          .onChange(async (value) => {
            const port = Number(value);
            this.plugin.settings.clipServerPort = Number.isInteger(port) && port >= 1024 && port <= 65535
              ? port
              : DEFAULT_SETTINGS.clipServerPort;
            await this.plugin.saveSettings();
            await this.plugin.restartClipServer();
          });
      });

    new Setting(containerEl)
      .setName('访问 Token')
      .setDesc('把此 Token 填入浏览器扩展的「官方插件 Token」栏位。')
      .addText((text) => {
        text.setValue(this.plugin.settings.clipServerToken).setDisabled(true);
        text.inputEl.style.width = '100%';
      })
      .addExtraButton((button) => {
        button
          .setIcon('copy')
          .setTooltip('复制 Token')
          .onClick(async () => {
            await navigator.clipboard.writeText(this.plugin.settings.clipServerToken);
            new Notice('已复制剪藏服务 Token');
          });
      })
      .addExtraButton((button) => {
        button
          .setIcon('refresh-cw')
          .setTooltip('重新生成 Token')
          .onClick(async () => {
            this.plugin.settings.clipServerToken = generateToken();
            await this.plugin.saveSettings();
            await this.plugin.restartClipServer();
            this.display();
            new Notice('已重新生成 Token，请同步更新浏览器扩展');
          });
      });

    new Setting(containerEl)
      .setName('服务状态')
      .setDesc(this.plugin.getStats().clipServer ? '运行中' : '未运行');

    new Setting(containerEl)
      .setName('已索引收藏数')
      .setDesc(String(this.plugin['entries'].length));

    new Setting(containerEl)
      .setName('语义向量数')
      .setDesc(String(this.plugin['semanticVectors'].length));
  }
}
