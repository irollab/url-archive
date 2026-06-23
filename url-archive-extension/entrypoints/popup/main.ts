const whyEl = document.getElementById('why') as HTMLTextAreaElement;
const btn = document.getElementById('clip') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

whyEl.focus();

btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.textContent = '剪藏中…';
  const res = await chrome.runtime.sendMessage({ type: 'CAPTURE', why: whyEl.value });
  if (res?.ok && res.written) {
    statusEl.textContent = '✓ 已剪藏到 Obsidian';
    setTimeout(() => window.close(), 800);
  } else if (res?.ok && !res.written) {
    statusEl.textContent = '✓ 已暂存（Obsidian 不可用，恢复后自动写入）';
  } else {
    statusEl.textContent = `✗ 失败：${res?.error ?? '未知错误'}`;
    btn.disabled = false;
  }
});
