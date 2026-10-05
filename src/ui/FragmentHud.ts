/**
 * HUD 贝壳图标（42px 显示）用的是房间书桌那只正式水彩贝的缩小版：
 * `assets/items/room-memory-pearl-shell-hud-v1.png`（168×168，37KB）。
 * 派生自 `room-memory-pearl-shell-v1.png`（1254×1254，1.7MB）：裁 alpha bbox →
 * 补 4% 透明边 → LANCZOS 缩到 168。源图改了要重新派生：
 *   /usr/bin/python3 - <<'PY'
 *   from PIL import Image
 *   src = Image.open('assets/items/room-memory-pearl-shell-v1.png').convert('RGBA')
 *   art = src.crop(src.getbbox()); side = int(max(art.size) * 1.08)
 *   c = Image.new('RGBA', (side, side), (0, 0, 0, 0))
 *   c.paste(art, ((side - art.width) // 2, (side - art.height) // 2), art)
 *   c.resize((168, 168), Image.LANCZOS).save('assets/items/room-memory-pearl-shell-hud-v1.png', optimize=True)
 *   PY
 * 不直接用 1.7MB 的源图：HUD 是常驻 DOM 层，没必要为 42px 背一张 1254px 的图。
 */
import Phaser from 'phaser';
import { fitCanvasDomOverlay } from './CanvasDomLayout';
import shellArtUrl from '../../assets/items/room-memory-pearl-shell-hud-v1.png?url';

export type FragmentKind = 'photo' | 'radio' | 'shadowBoat';

export interface FragmentHudHandle {
  collect: (kind: FragmentKind) => void;
  destroy: () => void;
  element: HTMLDivElement;
}

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'recall-fragment-hud-style';
const activeHuds = new WeakMap<Phaser.Scene, FragmentHudHandle>();

// 贝壳用房间书桌上那张正式水彩图（见文件头的派生说明），不再手绘轮廓。
// 三片记忆各对应贝壳的一条带子（左 / 中 / 右）：未收集时是全图的淡色残影，
// 收齐一片点亮一片，三片到齐再给整只壳加暖光。
function shellMarkup(): string {
  const layer = (kind: FragmentKind | 'ghost') =>
    kind === 'ghost'
      ? `<img class="recall-fragment-hud__art recall-fragment-hud__art--ghost" src="${shellArtUrl}" alt="" />`
      : `<img class="recall-fragment-hud__art recall-fragment-hud__art--piece" data-piece="${kind}" src="${shellArtUrl}" alt="" />`;
  return `<div class="recall-fragment-hud__shell" aria-hidden="true">
    ${layer('ghost')}${layer('photo')}${layer('radio')}${layer('shadowBoat')}
  </div>`;
}

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .recall-fragment-hud {
      position: fixed; width: 960px; height: 540px; z-index: 1000;
      transform-origin: top left; pointer-events: none; user-select: none;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .recall-fragment-hud * { box-sizing: border-box; }
    .recall-fragment-hud__card {
      position: absolute; bottom: 14px; left: 14px; width: 106px; height: 48px;
      display: flex; align-items: center; gap: 4px; padding: 4px 6px 4px 4px;
      border-radius: 9px 3px 9px 3px;
      border: 1px solid rgba(255,239,205,.18);
      background: linear-gradient(116deg, rgba(25,31,26,.42), rgba(46,47,37,.27));
      -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
      box-shadow: 0 5px 24px rgba(9,17,14,.15), inset 0 1px rgba(255,255,236,.10);
    }
    .recall-fragment-hud__shell { position: relative; width: 42px; height: 42px; flex: none; }
    .recall-fragment-hud__art {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
      /* 1024 级源图缩到 42px：交给浏览器平滑，不要出现锯齿 */
      image-rendering: auto;
    }
    /* 未收集：正式美术的淡色残影，替掉旧的手绘灰盒轮廓。
       opacity/brightness 是实拍调出来的：太暗（只降 brightness）在 42px 下只剩一坨黑，
       太淡则看不出是什么东西——这组是「看得出是那只贝、但明显没点亮」。 */
    .recall-fragment-hud__art--ghost {
      opacity: .38; filter: grayscale(.75) brightness(1.18) saturate(.4) contrast(.85);
    }
    .recall-fragment-hud__art--piece {
      opacity: 0; transition: opacity 650ms ease;
    }
    /* 三条带子用渐变遮罩而不是硬 clip：收齐一片时彩色不是被一条直线切开，
       而是在带子边缘渐入，残影从缝里透出来——像贝壳在“渐渐显出”。 */
    .recall-fragment-hud__art--piece[data-piece="photo"] {
      -webkit-mask-image: linear-gradient(to right, #000 0%, #000 26%, transparent 41%);
      mask-image: linear-gradient(to right, #000 0%, #000 26%, transparent 41%);
    }
    .recall-fragment-hud__art--piece[data-piece="radio"] {
      -webkit-mask-image: linear-gradient(to right, transparent 22%, #000 35%, #000 56%, transparent 71%);
      mask-image: linear-gradient(to right, transparent 22%, #000 35%, #000 56%, transparent 71%);
    }
    .recall-fragment-hud__art--piece[data-piece="shadowBoat"] {
      -webkit-mask-image: linear-gradient(to right, transparent 57%, #000 71%, #000 100%);
      mask-image: linear-gradient(to right, transparent 57%, #000 71%, #000 100%);
    }
    .recall-fragment-hud__art--piece.is-collected { opacity: 1; }
    .recall-fragment-hud.is-complete .recall-fragment-hud__shell {
      filter: drop-shadow(0 0 6px rgba(249,223,162,.68));
    }
    .recall-fragment-hud__copy { display: flex; flex-direction: column; min-width: 0; }
    .recall-fragment-hud__label {
      color: rgba(253,239,207,.81); font-size: 8px; letter-spacing: .08em;
      white-space: nowrap; text-shadow: 0 1px 4px rgba(0,0,0,.38);
    }
    .recall-fragment-hud__count {
      color: #f8e8bc; font: 16px/1.1 Georgia, serif; letter-spacing: .02em;
      text-shadow: 0 2px 7px rgba(0,0,0,.44);
    }
    .recall-fragment-hud__count small { color: rgba(247,231,195,.64); font-size: 10px; }
  `;
  document.head.append(style);
}

/** A compact shell filled one third at a time in the room's lower-left corner. */
export function createFragmentHud(scene: Phaser.Scene): FragmentHudHandle {
  activeHuds.get(scene)?.destroy();
  installStyle();
  const root = document.createElement('div');
  root.className = 'recall-fragment-hud';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', '记忆碎片 0/3');
  root.innerHTML = `<div class="recall-fragment-hud__card">
    ${shellMarkup()}
    <div class="recall-fragment-hud__copy">
      <span class="recall-fragment-hud__label">记忆碎片</span>
      <span class="recall-fragment-hud__count"><span data-count>0</span><small> / 3</small></span>
    </div>
  </div>`;
  const collected = new Set<FragmentKind>();
  let destroyed = false;
  const position = () => {
    fitCanvasDomOverlay(scene, root, WIDTH, HEIGHT, 'left');
  };
  const onShutdown = () => destroy();
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.scale.off(Phaser.Scale.Events.RESIZE, position);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    root.remove();
    activeHuds.delete(scene);
  };
  const handle: FragmentHudHandle = {
    element: root,
    destroy,
    collect: kind => {
      if (destroyed || collected.has(kind)) return;
      collected.add(kind);
      root.querySelector(`[data-piece="${kind}"]`)?.classList.add('is-collected');
      root.querySelector<HTMLElement>('[data-count]')!.textContent = String(collected.size);
      root.setAttribute('aria-label', `记忆碎片 ${collected.size}/3`);
      if (collected.size === 3) root.classList.add('is-complete');
    },
  };
  document.body.append(root);
  position();
  scene.scale.on(Phaser.Scale.Events.RESIZE, position);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  activeHuds.set(scene, handle);
  return handle;
}
