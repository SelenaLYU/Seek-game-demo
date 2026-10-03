import Phaser from 'phaser';

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

const SHELL = 'M 32 51 C 22 50 10 44 7 34 C 3 22 10 10 21 6 C 26 4 30 7 32 12 C 34 7 38 4 43 6 C 54 10 61 22 57 34 C 54 44 42 50 32 51 Z';

function shellMarkup(): string {
  return `<svg class="recall-fragment-hud__shell" viewBox="0 0 64 58" aria-hidden="true">
    <defs>
      <linearGradient id="recall-fragment-shell-fill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fffdf1" stop-opacity=".92" />
        <stop offset=".55" stop-color="#f4e9c9" stop-opacity=".68" />
        <stop offset="1" stop-color="#c8b997" stop-opacity=".46" />
      </linearGradient>
      <clipPath id="recall-fragment-shell-clip"><path d="${SHELL}" /></clipPath>
    </defs>
    <g clip-path="url(#recall-fragment-shell-clip)">
      <path class="recall-fragment-hud__piece" data-piece="photo" d="M 0 0 H 25 L 32 52 H 0 Z" />
      <path class="recall-fragment-hud__piece" data-piece="radio" d="M 23 0 H 41 L 32 52 Z" />
      <path class="recall-fragment-hud__piece" data-piece="shadowBoat" d="M 39 0 H 64 V 58 H 32 Z" />
    </g>
    <path class="recall-fragment-hud__shell-outline" d="${SHELL}" />
    <g class="recall-fragment-hud__ridges">
      <path d="M 32 50 C 24 36 20 22 21 8" />
      <path d="M 32 50 C 29 34 29 20 32 12" />
      <path d="M 32 50 C 35 34 35 20 43 8" />
      <path d="M 32 50 C 18 42 11 35 8 27" />
      <path d="M 32 50 C 46 42 53 35 56 27" />
    </g>
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
    .recall-fragment-hud__shell { width: 40px; height: 41px; flex: none; overflow: visible; }
    .recall-fragment-hud__shell-outline {
      fill: rgba(255,249,228,.035); stroke: rgba(249,234,199,.58); stroke-width: 1.2;
    }
    .recall-fragment-hud__piece {
      fill: url(#recall-fragment-shell-fill); opacity: 0;
      filter: drop-shadow(0 0 0 rgba(255,241,188,0));
      transition: opacity 650ms ease, filter 650ms ease;
    }
    .recall-fragment-hud__piece.is-collected {
      opacity: 1; filter: drop-shadow(0 0 5px rgba(255,239,187,.49));
    }
    .recall-fragment-hud__ridges path {
      fill: none; stroke: rgba(182,159,113,.48); stroke-width: .85; stroke-linecap: round;
    }
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
    const bounds = scene.game.canvas.getBoundingClientRect();
    root.style.left = `${bounds.left}px`;
    root.style.top = `${bounds.top}px`;
    root.style.transform = `scale(${bounds.width / WIDTH}, ${bounds.height / HEIGHT})`;
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
