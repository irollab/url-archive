/**
 * 图片点击灯箱：点击匹配的图片全屏放大（便于扫码），点击遮罩、按钮或 Esc 关闭。
 * 自带样式（首次调用注入一次 <style>），供扩展选项页与新标签页设置面板复用。
 */
const STYLE_ID = 'ua-lightbox-style';

const LIGHTBOX_CSS = `
.ua-lightbox{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:5vmin;background:rgba(6,10,18,.82);backdrop-filter:blur(6px);cursor:zoom-out;animation:ua-lightbox-in .12s ease}
.ua-lightbox img{max-width:min(92vw,460px);max-height:90vh;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.5);background:#fff;cursor:default}
.ua-lightbox-close{position:absolute;top:max(16px,3vmin);right:max(16px,3vmin);width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:22px;line-height:1;cursor:pointer;transition:background .15s ease}
.ua-lightbox-close:hover{background:rgba(255,255,255,.26)}
@keyframes ua-lightbox-in{from{opacity:0}to{opacity:1}}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = LIGHTBOX_CSS;
  document.head.appendChild(style);
}

export function attachImageLightbox(selector: string, root: ParentNode = document): void {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>(selector));
  if (!images.length) return;
  ensureStyle();

  let overlay: HTMLDivElement | null = null;

  const close = () => {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onKey);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  const open = (src: string, alt: string) => {
    close();
    overlay = document.createElement('div');
    overlay.className = 'ua-lightbox';
    overlay.addEventListener('click', close); // 点击遮罩关闭

    const big = document.createElement('img');
    big.src = src;
    big.alt = alt;
    big.addEventListener('click', (event) => event.stopPropagation()); // 点图片本身不关闭
    overlay.appendChild(big);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ua-lightbox-close';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.textContent = '×';
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);
  };

  for (const image of images) {
    image.style.cursor = 'zoom-in';
    image.addEventListener('click', () => open(image.currentSrc || image.src, image.alt));
  }
}
