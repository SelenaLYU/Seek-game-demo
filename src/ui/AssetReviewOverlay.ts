/**
 * 素材总览overlay：在游戏里逐张核对美术交付件（母版、图集、背景）。
 *
 * 为什么放在游戏里而不是另开看图工具：
 *  · 队友交付的是**母版**（一张图里排多个状态），还没按 Phaser 锚点切图；
 *    核对时要同时看到「图里有什么」和「游戏里贴在哪个坐标」，在同一窗口切换最省事。
 *  · Vite dev 直接按仓库根路径提供 `assets/...`，所以这里用 `<img src="assets/...">`，
 *    与 `this.load.image` 的字面路径一致，不需要再走一遍 Phaser 加载。
 *
 * 只用 DOM：不参与 Phaser 场景树，因此不会被房间的 `applyHDCamera` 缩放影响，
 * 也不占用场景生命周期；`?assetReview=1` 打开，关闭时返回的 dispose 会摘干净监听。
 */
import { resolveImageUrl } from '../assets';

export interface AssetReviewEntry {
  /** 侧栏与标题里显示的名字。 */
  label: string;
  /** 仓库根目录下的字面路径，与代码里 `this.load.image` 用的字符串一致。 */
  path: string;
  /** 交付状态、待切图说明等，显示在标题旁。 */
  note?: string;
}

const ROOT_ID = 'seek-asset-review';
const STYLE_ID = 'seek-asset-review-style';

const STYLE = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 12000; display: flex; flex-direction: column;
  color: #e7eef0; background: rgba(11,15,19,.95);
  font: 13px/1.5 Arial, "Microsoft YaHei", sans-serif;
}
#${ROOT_ID} header {
  display: flex; gap: 10px; align-items: baseline; padding: 10px 14px;
  border-bottom: 1px solid rgba(217,230,231,.18);
}
#${ROOT_ID} header b { font-size: 15px; color: #f4e9cd; }
#${ROOT_ID} header span { color: #9db0b3; font-size: 12px; }
#${ROOT_ID} header button {
  margin-left: auto; padding: 6px 12px; color: #f4e9cd; cursor: pointer;
  background: rgba(82,106,98,.6); border: 1px solid rgba(239,220,174,.4); border-radius: 6px;
}
#${ROOT_ID} .body { flex: 1; display: flex; min-height: 0; }
#${ROOT_ID} .list { width: 280px; overflow: auto; padding: 8px; border-right: 1px solid rgba(217,230,231,.14); }
#${ROOT_ID} .list button {
  display: block; width: 100%; margin: 0 0 6px; padding: 7px 9px; text-align: left;
  color: #d5e0e1; cursor: pointer; background: rgba(255,255,255,.05);
  border: 1px solid transparent; border-radius: 6px;
}
#${ROOT_ID} .list button[aria-current="true"] {
  color: #fff6dc; background: rgba(82,106,98,.55); border-color: rgba(239,220,174,.45);
}
#${ROOT_ID} .list small { display: block; color: #8fa2a5; font-size: 11px; }
#${ROOT_ID} .stage { position: relative; flex: 1; overflow: hidden; cursor: grab; background: #14181c; }
#${ROOT_ID} .stage.dragging { cursor: grabbing; }
#${ROOT_ID} .stage img { position: absolute; left: 0; top: 0; transform-origin: 0 0; image-rendering: auto; }
#${ROOT_ID} footer {
  display: flex; gap: 14px; padding: 8px 14px; border-top: 1px solid rgba(217,230,231,.18);
  color: #a9bcbf; font-size: 12px;
}
`;

/**
 * 挂载素材总览。返回的 dispose 会移除 DOM 与全部监听，可安全重复调用。
 */
export function createAssetReviewOverlay(entries: readonly AssetReviewEntry[]): () => void {
  document.getElementById(ROOT_ID)?.remove();
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.append(style);
  }

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <header>
      <b>第二关美术交付件总览</b>
      <span>滚轮缩放 · 拖拽平移 · ←/→ 切换 · 0 复位 · Esc 关闭</span>
      <button type="button" data-close>关闭</button>
    </header>
    <div class="body">
      <div class="list" role="tablist"></div>
      <div class="stage"><img alt="" /></div>
    </div>
    <footer><span data-path></span><span data-size></span><span data-note></span><span data-zoom></span></footer>
  `;

  const list = root.querySelector<HTMLElement>('.list')!;
  const stage = root.querySelector<HTMLElement>('.stage')!;
  const image = root.querySelector<HTMLImageElement>('.stage img')!;
  const pathText = root.querySelector<HTMLElement>('[data-path]')!;
  const sizeText = root.querySelector<HTMLElement>('[data-size]')!;
  const noteText = root.querySelector<HTMLElement>('[data-note]')!;
  const zoomText = root.querySelector<HTMLElement>('[data-zoom]')!;

  let index = 0;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let dragX = 0;
  let dragY = 0;

  const apply = () => {
    image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    zoomText.textContent = `缩放 ${(scale * 100).toFixed(0)}%`;
  };

  /** 按容器「适应窗口」给一个初始缩放：母版尺寸差异很大，统一 1 倍会看不全。 */
  const fit = () => {
    const natural = { width: image.naturalWidth || 1, height: image.naturalHeight || 1 };
    const box = { width: stage.clientWidth - 24, height: stage.clientHeight - 24 };
    scale = Math.min(box.width / natural.width, box.height / natural.height, 1);
    offsetX = (stage.clientWidth - natural.width * scale) / 2;
    offsetY = (stage.clientHeight - natural.height * scale) / 2;
    apply();
  };

  const select = (next: number) => {
    index = (next + entries.length) % entries.length;
    const entry = entries[index];
    // Keep the PNG path in the list/footer as the source-of-truth label, but display its WebP sibling.
    image.src = resolveImageUrl(entry.path);
    image.alt = entry.label;
    pathText.textContent = entry.path;
    noteText.textContent = entry.note ?? '';
    sizeText.textContent = '载入中…';
    for (const button of list.querySelectorAll('button')) {
      button.setAttribute('aria-current', String(Number(button.dataset.index) === index));
    }
    list.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const onLoad = () => {
    sizeText.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    fit();
  };
  const onError = () => { sizeText.textContent = '缺文件（仓库里没有这张图）'; };

  entries.forEach((entry, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.index = String(i);
    button.innerHTML = `${entry.label}<small>${entry.path.split('/').at(-1)}</small>`;
    button.addEventListener('click', () => select(i));
    list.append(button);
  });

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const before = scale;
    scale = Math.min(4, Math.max(0.05, scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    // 以光标为锚点缩放，核对局部细节时不用反复调平移
    const rect = stage.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    offsetX = px - (px - offsetX) * (scale / before);
    offsetY = py - (py - offsetY) * (scale / before);
    apply();
  };
  const onPointerDown = (event: PointerEvent) => {
    dragging = true; dragX = event.clientX; dragY = event.clientY;
    stage.classList.add('dragging');
    stage.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    offsetX += event.clientX - dragX; offsetY += event.clientY - dragY;
    dragX = event.clientX; dragY = event.clientY;
    apply();
  };
  const onPointerUp = (event: PointerEvent) => {
    dragging = false; stage.classList.remove('dragging');
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { dispose(); return; }
    if (event.key === 'ArrowRight') select(index + 1);
    else if (event.key === 'ArrowLeft') select(index - 1);
    else if (event.key === '0') fit();
    else return;
    event.preventDefault();
  };
  const onResize = () => fit();

  const dispose = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    stage.removeEventListener('wheel', onWheel);
    stage.removeEventListener('pointerdown', onPointerDown);
    stage.removeEventListener('pointermove', onPointerMove);
    stage.removeEventListener('pointerup', onPointerUp);
    stage.removeEventListener('pointercancel', onPointerUp);
    image.removeEventListener('load', onLoad);
    image.removeEventListener('error', onError);
    root.remove();
  };

  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  image.addEventListener('load', onLoad);
  image.addEventListener('error', onError);
  root.querySelector<HTMLElement>('[data-close]')!.addEventListener('click', dispose);
  // 捕获阶段拦截：否则 ←/→ 会被 Phaser 的键盘输入一并吃掉
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);

  document.body.append(root);
  select(0);
  return dispose;
}
