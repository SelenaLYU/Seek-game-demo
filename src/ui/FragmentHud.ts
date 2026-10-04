import Phaser from 'phaser';
import { fitCanvasDomOverlay } from './CanvasDomLayout';

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

// 单面扇贝轮廓：顶部由五个自然起伏的贝壳瓣构成，底部向铰合点收拢。
// 形状与最终出现的彩色珍珠贝保持同一种水彩轮廓语言。
const SHELL = 'M 32 55 C 25 52 17 47 11 42 C 5 37 3 30 6 24 C 8 19 13 16 18 18 C 18 12 23 8 28 10 C 30 5 37 4 41 9 C 46 7 52 10 53 15 C 59 15 63 21 61 27 C 59 36 49 46 32 55 Z';

function shellMarkup(): string {
  return `<svg class="recall-fragment-hud__shell" viewBox="0 0 64 58" aria-hidden="true">
    <defs>
      <linearGradient id="recall-fragment-shell-fill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff4cf" />
        <stop offset=".34" stop-color="#f3b6a3" />
        <stop offset=".66" stop-color="#9fcfd0" />
        <stop offset="1" stop-color="#f8d8ad" />
      </linearGradient>
      <radialGradient id="recall-fragment-pearl" cx="40%" cy="32%" r="68%">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset=".45" stop-color="#fff4cd" />
        <stop offset=".72" stop-color="#9fe6e7" />
        <stop offset="1" stop-color="#72b9ca" />
      </radialGradient>
      <clipPath id="recall-fragment-shell-clip"><path d="${SHELL}" /></clipPath>
    </defs>
    <g clip-path="url(#recall-fragment-shell-clip)">
      <path class="recall-fragment-hud__piece" data-piece="photo" d="M 0 0 H 25 L 32 52 H 0 Z" />
      <path class="recall-fragment-hud__piece" data-piece="radio" d="M 23 0 H 41 L 32 52 Z" />
      <path class="recall-fragment-hud__piece" data-piece="shadowBoat" d="M 39 0 H 64 V 58 H 32 Z" />
    </g>
    <path class="recall-fragment-hud__shell-outline" d="${SHELL}" />
    <g class="recall-fragment-hud__ridges">
      <path d="M 32 53 C 23 42 17 30 18 19" />
      <path d="M 32 53 C 26 38 25 23 28 11" />
      <path d="M 32 53 C 31 36 33 21 36 7" />
      <path d="M 32 53 C 38 38 44 25 51 13" />
      <path d="M 32 53 C 19 47 10 38 7 29" />
      <path d="M 32 53 C 47 47 57 37 60 27" />
    </g>
    <path class="recall-fragment-hud__highlight" d="M 10 27 C 18 18 26 16 33 14 C 42 11 51 14 57 21" />
    <circle class="recall-fragment-hud__pearl" cx="32" cy="43" r="5.5" />
  </svg>`;
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
    .recall-fragment-hud__shell { width: 42px; height: 42px; flex: none; overflow: visible; }
    .recall-fragment-hud__shell-outline {
      fill: rgba(255,246,222,.055); stroke: rgba(116,76,46,.92); stroke-width: 1.55;
      stroke-linejoin: round;
    }
    .recall-fragment-hud__piece {
      fill: url(#recall-fragment-shell-fill); opacity: 0;
      filter: drop-shadow(0 0 0 rgba(255,241,188,0));
      transition: opacity 650ms ease, filter 650ms ease;
    }
    .recall-fragment-hud__piece.is-collected {
      opacity: .96; filter: drop-shadow(0 0 5px rgba(255,224,171,.55));
    }
    .recall-fragment-hud__ridges path {
      fill: none; stroke: rgba(126,86,55,.54); stroke-width: .82; stroke-linecap: round;
    }
    .recall-fragment-hud__highlight {
      fill: none; stroke: rgba(255,255,244,.64); stroke-width: 1.05; stroke-linecap: round;
    }
    .recall-fragment-hud__pearl {
      fill: url(#recall-fragment-pearl); opacity: .14;
      stroke: rgba(255,247,214,.72); stroke-width: .8;
      transition: opacity 650ms ease, filter 650ms ease;
    }
    .recall-fragment-hud.is-complete .recall-fragment-hud__shell {
      filter: drop-shadow(0 0 6px rgba(249,223,162,.68));
    }
    .recall-fragment-hud.is-complete .recall-fragment-hud__pearl {
      opacity: 1; filter: drop-shadow(0 0 5px rgba(147,235,236,.88));
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
