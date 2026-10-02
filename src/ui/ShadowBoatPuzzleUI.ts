import Phaser from 'phaser';
import {
  PIECE_IDS, TARGET, APERTURE, WALL, LIGHT_Y, SOLUTION, SOLUTION_LIGHT_X,
  shadowPolygon, projectToWall,
  polygonPath, alignment, clipPolygon, type Point, type PieceState, type PieceId,
} from './shadowBoatGeometry';
import pencilCaseUrl from '../../assets/environment/room-shadow-pencil-case.png?url';
import triangleRulerUrl from '../../assets/environment/room-shadow-triangle-ruler.png?url';
import thinRulerUrl from '../../assets/environment/room-shadow-pencil.png?url';
import flashlightOffUrl from '../../assets/environment/room-flashlight-off.png?url';
import flashlightOnUrl from '../../assets/environment/room-flashlight-on.png?url';
import paintBrushUrl from '../../assets/items/room-paint-brush.png?url';
import wallDrawingUrl from '../../assets/environment/room-wall-drawing-incomplete.png?url';
import wallDrawingCompleteUrl from '../../assets/environment/room-wall-drawing-complete.png?url';
import wallBoatUrl from '../../assets/environment/room-wall-boat.png?url';

export interface ShadowBoatPuzzleHandle {
  element: HTMLDivElement;
  setBrushEquipped: (equipped: boolean) => void;
  close: () => void;
}

interface ShadowBoatPuzzleOptions {
  onClose: () => void;
  flashlightPowered?: boolean;
  onAligned?: (pieces: Record<PieceId, PieceState>, flashlightX: number) => void;
  onStateChange?: (pieces: Record<PieceId, PieceState>, flashlightX: number) => void;
  onWindStrokeCompleted?: (index: 1 | 2 | 3) => void;
  onCompleted?: () => void;
  initialAligned?: boolean;
  initialWindStrokeCount?: number;
  initialCompleted?: boolean;
  initialPieces?: Record<PieceId, PieceState>;
  initialFlashlightX?: number;
}

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'seek-shadow-boat-style';
const activePuzzles = new WeakMap<Phaser.Scene, ShadowBoatPuzzleHandle>();
const PIECE_ART_SIZE: Record<PieceId, { width: number; height: number }> = {
  hull: { width: 74, height: 18 },
  sail: { width: 37, height: 52 },
  mast: { width: 4, height: 63 },
};
const PIECE_ART_SCALE = 1.7;
const PIECE_ART_FORWARD_Y = 14;

function installStyle(): void {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-shadow-boat {
      position: fixed; width: 960px; height: 540px; z-index: 1100;
      overflow: hidden; user-select: none; -webkit-user-select: none;
      transform-origin: top left; color: #eadfbe;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .seek-shadow-boat * { box-sizing: border-box; }

    /* 深夜静谧暗室背景与环境光影 */
    .seek-shadow-boat__backdrop {
      position: absolute; inset: 0; border: 0; cursor: default;
      background: radial-gradient(ellipse at 50% 65%, rgba(20, 28, 23, 0.94) 0%, rgba(10, 15, 12, 0.97) 60%, rgba(5, 7, 6, 0.99) 100%);
      -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    }
    .seek-shadow-boat__panel {
      position: absolute; inset: 0;
      background: transparent;
      overflow: hidden;
    }

    /* 顶部优雅意境提示 */
    .seek-shadow-boat__title {
      position: absolute; left: 50%; top: 22px; transform: translateX(-50%); z-index: 10; margin: 0;
      padding: 7px 18px; border: 1px solid rgba(239, 220, 174, 0.22); border-radius: 20px;
      color: rgba(246, 233, 198, 0.95); background: rgba(12, 19, 15, 0.78);
      box-shadow: 0 4px 20px rgba(0,0,0,0.4), inset 0 1px rgba(255,255,255,0.08);
      font: 13px/1.3 "Microsoft YaHei", sans-serif; letter-spacing: .06em;
      transition: color 300ms ease, border-color 300ms ease;
      white-space: nowrap; pointer-events: none;
    }
    .seek-shadow-boat.is-complete .seek-shadow-boat__title {
      color: #fff2c6; border-color: rgba(247, 220, 148, 0.5);
      box-shadow: 0 0 18px rgba(244, 211, 134, 0.25);
    }

    /* 关闭按钮 */
    .seek-shadow-boat__close {
      position: absolute; right: 24px; top: 18px; z-index: 12; width: 34px; height: 34px;
      border: 1px solid rgba(239,220,174,.2); border-radius: 50%;
      color: rgba(240,223,181,.78); background: rgba(12,21,17,.65);
      font-size: 20px; line-height: 1; display: grid; place-items: center; cursor: pointer;
      transition: all 180ms ease;
    }
    .seek-shadow-boat__close:hover {
      color: #fff; background: rgba(25, 38, 30, 0.9);
      border-color: rgba(244, 221, 158, 0.5); transform: scale(1.06);
    }

    .seek-shadow-boat__wall {
      position: absolute; inset: 0; width: 960px; height: 540px;
      border: 0; overflow: hidden; touch-action: none;
    }

    /* 真实暗部桌面与实物展示台 */
    .seek-shadow-boat__desk {
      position: absolute; left: 0; right: 0; bottom: 0; height: 160px;
      background: linear-gradient(180deg, rgba(34, 28, 20, 0.92) 0%, rgba(18, 14, 10, 0.98) 100%);
      border-top: 2px solid rgba(138, 112, 77, 0.35);
      box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.75);
      pointer-events: none;
    }
    .seek-shadow-boat__stand {
      position: absolute; left: 390px; top: 382px; width: 330px; height: 12px;
      border-radius: 50%; background: radial-gradient(ellipse at center, rgba(120, 94, 62, 0.7) 0%, rgba(48, 37, 24, 0.85) 75%, transparent 100%);
      border-top: 1px solid rgba(223, 190, 130, 0.35);
      box-shadow: 0 8px 18px rgba(0,0,0,0.6); pointer-events: none;
    }

    /* 右侧墙面实木画框与儿童画 */
    .seek-shadow-boat__picture-frame {
      position: absolute; left: 545px; top: 72px; width: 380px; height: 270px;
      border: 5px solid #4a3824; border-radius: 2px;
      box-shadow: 0 12px 28px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(238,215,166,.3), inset 0 0 16px rgba(0,0,0,0.5);
      pointer-events: none; overflow: hidden;
      transform: skewY(-5.14deg);
    }
    .seek-shadow-boat__wall-drawing {
      position: absolute; inset: 0; width: 100%; height: 100%;
    }
    .seek-shadow-boat__wall-drawing-incomplete,
    .seek-shadow-boat__wall-drawing-complete {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;
    }
    .seek-shadow-boat__wall-drawing-incomplete {
      opacity: 0.92; filter: brightness(0.9); transition: opacity 1200ms ease;
    }
    .seek-shadow-boat__wall-drawing-complete {
      opacity: 0; filter: brightness(0.95); transition: opacity 1200ms ease;
    }
    .seek-shadow-boat.wind-finished .seek-shadow-boat__wall-drawing-incomplete { opacity: 0; }
    .seek-shadow-boat.wind-finished .seek-shadow-boat__wall-drawing-complete { opacity: 0.98; }

    /* 彩色小船图层 */
    .seek-shadow-boat__wall-boat {
      position: absolute; left: 621px; top: 185px; z-index: 3;
      width: 120px; height: 83px; object-fit: contain;
      opacity: 0; pointer-events: none; transform-origin: center;
      filter: saturate(.92) brightness(.92) drop-shadow(0 2px 4px rgba(12,19,17,.4));
    }
    .seek-shadow-boat.is-complete .seek-shadow-boat__wall-boat { opacity: 1; }
    .seek-shadow-boat.wind-two .seek-shadow-boat__wall-boat { animation: seek-boat-float 1500ms ease-in-out infinite; }
    .seek-shadow-boat.wind-three .seek-shadow-boat__wall-boat {
      animation: seek-painted-boat-sail 3500ms cubic-bezier(.3,.58,.4,1) forwards;
    }

    /* 回忆文字 */
    .seek-shadow-boat__memory-line {
      position: absolute; left: 64px; top: 218px; width: 380px; z-index: 5;
      margin: 0; color: rgba(248, 235, 203, 0.96); opacity: 0; pointer-events: none;
      text-align: left; font: 15px/1.85 "Microsoft YaHei", sans-serif; letter-spacing: .06em;
      text-shadow: 0 2px 8px rgba(0,0,0,0.9), 0 0 16px rgba(0,0,0,0.8);
      transform: translateY(6px);
      transition: opacity 600ms ease, transform 600ms ease;
    }
    .seek-shadow-boat.wind-three .seek-shadow-boat__memory-line {
      opacity: 1; transform: translateY(0);
    }

    /* 体积光与光锥几何渲染 */
    .seek-shadow-boat__optics {
      position: absolute; inset: 0; width: 960px; height: 540px; pointer-events: none; z-index: 2;
    }
    .seek-shadow-boat__light-volume {
      fill: url(#seek-beam-gradient); opacity: 0.55;
      transition: opacity 300ms ease;
    }
    .seek-shadow-boat__light-patch {
      fill: url(#seek-spotlight-glow); opacity: 0.65;
    }
    .seek-shadow-boat__cast {
      fill: #0c120e; opacity: 0.86;
      filter: blur(0.5px);
      transition: opacity 300ms ease;
    }
    .seek-shadow-boat.is-complete .seek-shadow-boat__cast {
      filter: drop-shadow(0 0 6px rgba(247, 218, 145, 0.45));
    }
    .seek-shadow-boat__target {
      fill: rgba(7, 10, 9, 0.04);
      stroke: rgba(240, 218, 160, 0.72); stroke-width: 1.6; stroke-dasharray: 4 6;
      filter: drop-shadow(0 0 2px rgba(240, 218, 160, 0.4));
    }
    .seek-shadow-boat.is-complete .seek-shadow-boat__target { opacity: 0; }
    .seek-shadow-boat__complete {
      opacity: 0; fill: #0c120e; transform-box: fill-box; transform-origin: center;
      transition: opacity 350ms ease, transform 800ms ease;
    }
    .seek-shadow-boat__complete-sail { transform-box: fill-box; transform-origin: bottom left; }

    /* 桌面三件套物理物件 */
    .seek-shadow-boat__piece {
      position: absolute; padding: 0; border: 0; cursor: grab; touch-action: none;
      overflow: visible; z-index: 4; background: none;
      filter: drop-shadow(3px 7px 8px rgba(0,0,0,0.6));
      transition: filter 180ms ease, transform 180ms ease;
    }
    .seek-shadow-boat__piece:hover { filter: drop-shadow(4px 9px 12px rgba(0,0,0,0.75)) brightness(1.05); }
    .seek-shadow-boat__piece.is-dragging { cursor: grabbing; filter: drop-shadow(6px 12px 16px rgba(0,0,0,0.85)) brightness(1.08); z-index: 6; }
    .seek-shadow-boat__piece-art {
      position: absolute; left: 50%; top: 50%; object-fit: fill;
      transform-origin: center; pointer-events: none; user-select: none;
    }
    .seek-shadow-boat__piece-label {
      position: absolute; left: 50%; top: calc(100% + 5px); transform: translateX(-50%);
      padding: 2px 7px; border: 1px solid rgba(231,215,176,.2); border-radius: 10px;
      color: rgba(238,223,188,.78); background: rgba(10,16,13,.82);
      font-size: 10px; line-height: 1; white-space: nowrap; pointer-events: none;
      opacity: 0; transition: opacity 160ms ease;
    }
    .seek-shadow-boat__piece:hover .seek-shadow-boat__piece-label { opacity: 1; }
    .seek-shadow-boat.is-complete .seek-shadow-boat__piece { pointer-events: none; }

    /* 手电筒与滑轨 */
    .seek-shadow-boat__range {
      position: absolute; left: 240px; right: 280px; bottom: 42px; height: 3px;
      background: linear-gradient(90deg, transparent, rgba(230,213,173,.3) 15%, rgba(230,213,173,.3) 85%, transparent);
      border-radius: 2px; box-shadow: 0 1px 4px rgba(0,0,0,0.5);
      pointer-events: none; z-index: 4;
    }
    .seek-shadow-boat__flashlight-wrap {
      position: absolute; left: 320px; bottom: 12px; width: 64px; height: 100px;
      transform: translateX(-32px); z-index: 8; cursor: ew-resize; touch-action: none;
    }
    .seek-shadow-boat__flashlight-art {
      width: 100%; height: 100%; object-fit: contain; pointer-events: none;
      filter: drop-shadow(0 8px 12px rgba(0,0,0,0.7));
      transition: filter 180ms ease;
    }
    .seek-shadow-boat__flashlight-wrap.is-dragging .seek-shadow-boat__flashlight-art {
      filter: drop-shadow(0 12px 18px rgba(0,0,0,0.9)) brightness(1.1);
      cursor: grabbing;
    }
    .seek-shadow-boat__flashlight-hint {
      position: absolute; left: 50%; top: -20px; transform: translateX(-50%);
      padding: 2px 7px; border-radius: 10px; border: 1px solid rgba(239,220,174,.25);
      background: rgba(10,16,13,.85); color: #ead7a6; font-size: 10px; white-space: nowrap;
      pointer-events: none; opacity: 0; transition: opacity 160ms ease;
    }
    .seek-shadow-boat__flashlight-wrap:hover .seek-shadow-boat__flashlight-hint { opacity: 1; }

    /* 描风与光标图层 */
    .seek-shadow-boat__wind-layer {
      position: absolute; inset: 0; z-index: 5; width: 960px; height: 540px;
      overflow: visible; opacity: 0; pointer-events: none; touch-action: none;
      transition: opacity 450ms ease;
    }
    .seek-shadow-boat.is-complete .seek-shadow-boat__wind-layer { opacity: 1; }
    .seek-shadow-boat.is-complete.has-brush .seek-shadow-boat__wind-layer { pointer-events: auto; }
    .seek-shadow-boat__wind-guide,
    .seek-shadow-boat__wind-progress { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .seek-shadow-boat__wind-guide {
      stroke: rgba(18, 26, 22, 0.95); stroke-width: 3.4; opacity: .8;
      transition: opacity 260ms ease;
    }
    .seek-shadow-boat__wind-guide.is-current {
      opacity: 1; filter: drop-shadow(0 0 3px rgba(245,235,207,.4));
      animation: seek-wind-guide-pulse 1800ms ease-in-out infinite;
    }
    .seek-shadow-boat__wind-guide.is-drawn { opacity: 0; }
    .seek-shadow-boat__wind-progress {
      stroke: rgba(255, 248, 220, 0.98); stroke-width: 6.5;
      filter: url(#seek-wind-crayon) drop-shadow(0 1px 2px rgba(32, 60, 56, 0.45));
    }
    .seek-shadow-boat.has-brush, .seek-shadow-boat.has-brush * { cursor: none; }
    .seek-shadow-boat__brush-cursor {
      display: none; position: absolute; width: 72px; height: 36px;
      z-index: 30; pointer-events: none; transform: translate(-18px, -30px); object-fit: contain;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));
    }
    .seek-shadow-boat.has-brush.is-pointer-inside .seek-shadow-boat__brush-cursor { display: block; }

    /* 动画 */
    @keyframes seek-wind-guide-pulse {
      0%, 100% { opacity: .7; }
      50% { opacity: 1; }
    }
    @keyframes seek-boat-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    @keyframes seek-shadow-dissolve {
      0% { opacity: 1; filter: blur(0); transform: translate(0, 0) scale(1); }
      50% { opacity: .5; filter: blur(1.5px); transform: translate(6px, -1px) scale(.98); }
      100% { opacity: 0; filter: blur(3px); transform: translate(16px, -2px) scale(.95); }
    }
    @keyframes seek-painted-boat-sail {
      0% { opacity: 0; transform: translate(0, 0) scale(.94); }
      20% { opacity: 0.8; transform: translate(8px, -1px) scale(.96); }
      40% { opacity: 1; transform: translate(25px, -2px) scale(1); }
      100% { opacity: 1; transform: translate(165px, -4px) scale(.9); }
    }
    @media (prefers-reduced-motion: reduce) {
      .seek-shadow-boat__complete, .seek-shadow-boat__piece, .seek-shadow-boat__light-volume,
      .seek-shadow-boat__wind-layer, .seek-shadow-boat__wind-guide,
      .seek-shadow-boat__complete-sail { transition-duration: 1ms !important; animation-duration: 1ms !important; }
    }
  `;
  document.head.append(style);
}

export function showShadowBoatPuzzleUI(
  scene: Phaser.Scene,
  options: ShadowBoatPuzzleOptions,
): ShadowBoatPuzzleHandle {
  activePuzzles.get(scene)?.close();
  installStyle();

  const root = document.createElement('div');
  root.className = 'seek-shadow-boat';
  root.tabIndex = -1;
  root.innerHTML = `
    <div class="seek-shadow-boat__backdrop"></div>
    <section class="seek-shadow-boat__panel" aria-label="墙面光影组合">
      <h2 class="seek-shadow-boat__title" data-status>挪动手电寻找视差焦点，摆动物件在海面上聚合成船</h2>
      <button class="seek-shadow-boat__close" type="button" aria-label="返回房间">×</button>
      <div class="seek-shadow-boat__wall">
        <!-- 景深桌面与展台 -->
        <div class="seek-shadow-boat__desk"></div>
        <div class="seek-shadow-boat__stand"></div>

        <!-- 墙面实木画框与儿童画作 -->
        <div class="seek-shadow-boat__picture-frame">
          <div class="seek-shadow-boat__wall-drawing" aria-hidden="true">
            <img class="seek-shadow-boat__wall-drawing-incomplete" src="${wallDrawingUrl}" alt="未完成海面涂鸦">
            <img class="seek-shadow-boat__wall-drawing-complete" src="${wallDrawingCompleteUrl}" alt="已完成海面涂鸦">
          </div>
        </div>

        <!-- 破浪彩色小船与回忆语句 -->
        <img class="seek-shadow-boat__wall-boat" src="${wallBoatUrl}" alt="" aria-hidden="true">
        <p class="seek-shadow-boat__memory-line">那天是韩梅梅第一次见到大海<br>有一点点怕，但是又很喜欢……</p>

        <!-- 光学计算层：体积光束、画框聚光斑、物理投影与虚线目标 -->
        <svg class="seek-shadow-boat__optics" viewBox="0 0 960 540" aria-hidden="true">
          <defs>
            <linearGradient id="seek-beam-gradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stop-color="#fff5cc" stop-opacity="0.5" />
              <stop offset="40%" stop-color="#ffe8a3" stop-opacity="0.22" />
              <stop offset="100%" stop-color="#f5d688" stop-opacity="0.04" />
            </linearGradient>
            <radialGradient id="seek-spotlight-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#fffbe0" stop-opacity="0.55" />
              <stop offset="55%" stop-color="#fae29d" stop-opacity="0.25" />
              <stop offset="100%" stop-color="#e8c874" stop-opacity="0" />
            </radialGradient>
            <clipPath id="seek-picture-clip" clipPathUnits="userSpaceOnUse">
              <path d="M 545 72 H 935 V 345 H 545 Z" />
            </clipPath>
          </defs>
          <path class="seek-shadow-boat__light-volume" />
          <path class="seek-shadow-boat__light-patch" clip-path="url(#seek-picture-clip)" />
          <path class="seek-shadow-boat__target" clip-path="url(#seek-picture-clip)" />
          <path class="seek-shadow-boat__cast" clip-path="url(#seek-picture-clip)" />
          <g class="seek-shadow-boat__complete" clip-path="url(#seek-picture-clip)">
            <path data-complete="hull" />
            <path class="seek-shadow-boat__complete-sail" data-complete="sail" />
            <path data-complete="mast" />
          </g>
        </svg>

        <!-- 空间错落桌面三件套 -->
        <button class="seek-shadow-boat__piece" data-piece="hull" type="button" aria-label="笔袋">
          <img class="seek-shadow-boat__piece-art" src="${pencilCaseUrl}" alt="">
          <span class="seek-shadow-boat__piece-label">笔袋 · 点击旋转</span>
        </button>
        <button class="seek-shadow-boat__piece" data-piece="sail" type="button" aria-label="三角尺">
          <img class="seek-shadow-boat__piece-art" src="${triangleRulerUrl}" alt="">
          <span class="seek-shadow-boat__piece-label">三角尺 · 点击旋转</span>
        </button>
        <button class="seek-shadow-boat__piece" data-piece="mast" type="button" aria-label="细竹尺">
          <img class="seek-shadow-boat__piece-art" src="${thinRulerUrl}" alt="">
          <span class="seek-shadow-boat__piece-label">细竹尺 · 点击旋转</span>
        </button>

        <!-- 描风层 -->
        <svg class="seek-shadow-boat__wind-layer" viewBox="0 0 960 540" aria-label="依次描出三笔风">
          <defs>
            <clipPath id="seek-wind-frame"><path d="M 559 103 L 911 72 L 911 311 L 559 343 Z" /></clipPath>
            <filter id="seek-wind-crayon" x="-18%" y="-35%" width="136%" height="170%" color-interpolation-filters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency=".045 .32" numOctaves="2" seed="17" result="paper-noise" />
              <feDisplacementMap in="SourceGraphic" in2="paper-noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="rough-stroke" />
              <feGaussianBlur in="rough-stroke" stdDeviation=".16" result="soft-edge" />
              <feMerge><feMergeNode in="rough-stroke" /><feMergeNode in="soft-edge" /></feMerge>
            </filter>
          </defs>
          <g clip-path="url(#seek-wind-frame)">
            <path class="seek-shadow-boat__wind-guide" data-wind-guide="1" d="M 582 124 C 607 132 642 153 676 148 C 703 144 706 120 690 116 C 678 113 672 125 681 130" />
            <path class="seek-shadow-boat__wind-progress" data-wind-progress="1" d="M 582 124 C 607 132 642 153 676 148 C 703 144 706 120 690 116 C 678 113 672 125 681 130" />
            <path class="seek-shadow-boat__wind-guide" data-wind-guide="2" d="M 582 160 C 603 168 628 184 654 181 C 678 178 680 157 666 154 C 656 152 651 163 659 167" />
            <path class="seek-shadow-boat__wind-progress" data-wind-progress="2" d="M 582 160 C 603 168 628 184 654 181 C 678 178 680 157 666 154 C 656 152 651 163 659 167" />
            <path class="seek-shadow-boat__wind-guide" data-wind-guide="3" d="M 582 194 C 598 201 615 212 631 210 C 649 207 651 193 641 191 C 633 190 630 198 636 201" />
            <path class="seek-shadow-boat__wind-progress" data-wind-progress="3" d="M 582 194 C 598 201 615 212 631 210 C 649 207 651 193 641 191 C 633 190 630 198 636 201" />
          </g>
        </svg>

        <!-- 手电筒自由滑轨与可拖拽把手 -->
        <div class="seek-shadow-boat__range"></div>
        <div class="seek-shadow-boat__flashlight-wrap" role="slider" aria-label="移动手电筒调整投影透视" tabindex="0">
          <span class="seek-shadow-boat__flashlight-hint">左右拖动手电筒 · 改变投影视差</span>
          <img class="seek-shadow-boat__flashlight-art" src="${flashlightOnUrl}" alt="" draggable="false">
        </div>
      </div>
    </section>
    <img class="seek-shadow-boat__brush-cursor" src="${paintBrushUrl}" alt="" aria-hidden="true">
  `;

  root.addEventListener('dragstart', event => event.preventDefault());
  root.querySelectorAll('img').forEach(img => { img.draggable = false; });
  const wall = root.querySelector<HTMLElement>('.seek-shadow-boat__wall')!;
  const cast = root.querySelector<SVGPathElement>('.seek-shadow-boat__cast')!;
  const lightPatch = root.querySelector<SVGPathElement>('.seek-shadow-boat__light-patch')!;
  const lightVolume = root.querySelector<SVGPathElement>('.seek-shadow-boat__light-volume')!;
  root.querySelector('.seek-shadow-boat__target')!.setAttribute('d', TARGET.map(polygonPath).join(' '));
  const flashlight = root.querySelector<HTMLElement>('.seek-shadow-boat__flashlight-wrap')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const windLayer = root.querySelector<SVGSVGElement>('.seek-shadow-boat__wind-layer')!;
  const windGuides = [...root.querySelectorAll<SVGPathElement>('[data-wind-guide]')];
  const windProgressPaths = [...root.querySelectorAll<SVGPathElement>('[data-wind-progress]')];

  const states: Record<PieceId, PieceState> = {
    hull: { id: 'hull', x: 390, y: 380, rotation: 0 },
    sail: { id: 'sail', x: 548, y: 352, rotation: 1 },
    mast: { id: 'mast', x: 485, y: 335, rotation: 1 },
  };
  for (const id of PIECE_IDS) {
    const initial = options.initialPieces?.[id];
    if (initial) states[id] = { ...initial, id };
    else if (options.initialAligned) states[id] = { ...SOLUTION[id] };
  }

  let flashlightX = Phaser.Math.Clamp(
    options.initialFlashlightX ?? (options.initialAligned ? SOLUTION_LIGHT_X : 460),
    240, 680,
  );
  let alignmentTimer: ReturnType<typeof setTimeout> | undefined;
  let completed = options.initialAligned ?? false;
  let brushEquipped = false;
  let windStrokeCount = Phaser.Math.Clamp(Math.floor(options.initialWindStrokeCount ?? 0), 0, 3);
  let windDrawing = false;
  let windPointerId: number | null = null;
  let windProgress = 0;
  let closed = false;
  let sailAnimation = 0;
  let settledSail: Point[] = shadowPolygon(states.sail, flashlightX);

  const brushCursor = root.querySelector<HTMLImageElement>('.seek-shadow-boat__brush-cursor')!;
  root.addEventListener('pointermove', event => {
    const bounds = root.getBoundingClientRect();
    brushCursor.style.left = `${(event.clientX - bounds.left) * WIDTH / bounds.width}px`;
    brushCursor.style.top = `${(event.clientY - bounds.top) * HEIGHT / bounds.height}px`;
    root.classList.add('is-pointer-inside');
  });
  root.addEventListener('pointerleave', () => root.classList.remove('is-pointer-inside'));

  windProgressPaths.forEach(path => {
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
  });
  windProgressPaths.forEach((path, index) => {
    if (index < windStrokeCount) {
      path.style.strokeDashoffset = '0';
      windGuides[index]?.classList.add('is-drawn');
    }
  });
  if (windStrokeCount < 3 && completed) windGuides[windStrokeCount]?.classList.add('is-current');
  if (options.initialCompleted) {
    completed = true;
    windStrokeCount = 3;
    root.classList.add('wind-finished');
    status.style.display = 'none';
  }
  if (completed) {
    root.classList.add('is-complete');
    status.textContent = windStrokeCount >= 3 ? '纸船顺着海风远航了' : '影子已契合！选画笔在画上描出三笔风';
  }
  if (windStrokeCount >= 1) root.classList.add('wind-one');
  if (windStrokeCount >= 2) root.classList.add('wind-two');
  if (windStrokeCount >= 3) root.classList.add('wind-three');

  const render = () => {
    // 空间光影投射：每个物件依其深度投射到斜面墙上
    const polygons = PIECE_IDS.map(id => shadowPolygon(states[id], flashlightX));
    cast.setAttribute('d', polygons.map(polygonPath).join(' '));

    // 手电筒位置与微动态指向
    flashlight.style.left = `${flashlightX}px`;
    const tilt = (550 - flashlightX) * 0.05;
    flashlight.style.transform = `translateX(-32px) rotate(${tilt}deg)`;

    // 动态光斑与体积光锥
    const litWall = APERTURE.map(p => projectToWall(p, flashlightX));
    lightPatch.setAttribute('d', polygonPath(litWall));
    const leftEdge = litWall.reduce((a, b) => a.x < b.x ? a : b);
    const rightEdge = litWall.reduce((a, b) => a.x > b.x ? a : b);
    const topEdgeY = Math.min(...litWall.map(p => p.y));
    lightVolume.setAttribute(
      'd',
      `M ${flashlightX} ${LIGHT_Y} L ${leftEdge.x} ${leftEdge.y} Q 550 ${topEdgeY - 8} ${rightEdge.x} ${rightEdge.y} Z`
    );

    // 空间前景实物渲染
    PIECE_IDS.forEach(id => {
      const padding = id === 'mast' ? 10 : 5;
      const artSize = PIECE_ART_SIZE[id];
      const artWidth = artSize.width * PIECE_ART_SCALE;
      const artHeight = artSize.height * PIECE_ART_SCALE;
      const renderedArtWidth = states[id].rotation ? artHeight : artWidth;
      const renderedArtHeight = states[id].rotation ? artWidth : artHeight;

      const artCenterX = 550 + (states[id].x + artSize.width / 2 - 550) * PIECE_ART_SCALE;
      const artCenterY = 360 + (states[id].y + artSize.height / 2 - 360) * PIECE_ART_SCALE + PIECE_ART_FORWARD_Y;
      const minX = artCenterX - renderedArtWidth / 2 - padding;
      const minY = artCenterY - renderedArtHeight / 2 - padding;
      const maxX = artCenterX + renderedArtWidth / 2 + padding;
      const maxY = artCenterY + renderedArtHeight / 2 + padding;
      const width = maxX - minX;
      const height = maxY - minY;

      const piece = root.querySelector<HTMLElement>(`[data-piece="${id}"]`)!;
      Object.assign(piece.style, { left: `${minX}px`, top: `${minY}px`, width: `${width}px`, height: `${height}px` });
      const art = piece.querySelector<HTMLImageElement>('.seek-shadow-boat__piece-art')!;
      Object.assign(art.style, {
        left: `${artCenterX - minX}px`,
        top: `${artCenterY - minY}px`,
        width: `${artWidth}px`,
        height: `${artHeight}px`,
        transform: `translate(-50%, -50%) rotate(${states[id].rotation ? 90 : 0}deg)`,
      });
    });

    if (completed) {
      PIECE_IDS.forEach((id, index) => {
        root.querySelector(`[data-complete="${id}"]`)?.setAttribute('d', polygonPath(polygons[index]));
      });
    }

    const match = alignment(polygons);
    root.dataset.overlap = match.overlap.toFixed(3);

    if (!completed && match.ready && !alignmentTimer) {
      alignmentTimer = setTimeout(() => {
        alignmentTimer = undefined;
        const current = PIECE_IDS.map(id => shadowPolygon(states[id], flashlightX));
        if (closed || !alignment(current).ready) return;
        completed = true;
        settledSail = current[1];
        PIECE_IDS.forEach((id, i) => root.querySelector(`[data-complete="${id}"]`)!.setAttribute('d', polygonPath(current[i])));
        root.classList.add('is-complete');
        status.textContent = '小船影子完美契合！拿上画笔，在画中描出三笔海风';
        windGuides[0]?.classList.add('is-current');
        options.onAligned?.(
          Object.fromEntries(PIECE_IDS.map(id => [id, { ...states[id] }])) as Record<PieceId, PieceState>,
          flashlightX,
        );
      }, 350);
    } else if (!match.ready && alignmentTimer) {
      clearTimeout(alignmentTimer);
      alignmentTimer = undefined;
    }
  };

  const makeDraggable = (
    element: HTMLElement,
    onMove: (dx: number, dy: number) => void,
    onTap?: () => void,
  ) => {
    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let distance = 0;

    element.addEventListener('pointerdown', event => {
      if (completed) return;
      event.preventDefault();
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      distance = 0;
      element.setPointerCapture(pointerId);
      element.classList.add('is-dragging');
    });

    element.addEventListener('pointermove', event => {
      if (completed || pointerId !== event.pointerId || !element.hasPointerCapture(pointerId)) return;
      const scale = wall.getBoundingClientRect().width / WIDTH;
      const dx = (event.clientX - lastX) / scale;
      const dy = (event.clientY - lastY) / scale;
      distance += Math.hypot(dx, dy);
      lastX = event.clientX;
      lastY = event.clientY;
      onMove(dx, dy);
      render();
    });

    const release = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      element.classList.remove('is-dragging');
      if (!completed && event.type !== 'pointercancel' && distance < 7) onTap?.();
      pointerId = null;
      render();
      options.onStateChange?.(
        Object.fromEntries(PIECE_IDS.map(id => [id, { ...states[id] }])) as Record<PieceId, PieceState>,
        flashlightX,
      );
    };

    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
  };

  // 物件拖动与转向
  (Object.keys(states) as PieceId[]).forEach(id => {
    const state = states[id];
    const element = root.querySelector<HTMLElement>(`[data-piece="${id}"]`)!;
    makeDraggable(
      element,
      (dx, dy) => {
        state.x = Phaser.Math.Clamp(state.x + dx / PIECE_ART_SCALE, 350, 720);
        state.y = Phaser.Math.Clamp(state.y + dy / PIECE_ART_SCALE, 260, 420 - PIECE_ART_SIZE[id].height / 2);
      },
      () => { state.rotation = state.rotation === 0 ? 1 : 0; },
    );
  });

  // 手电筒自由移动与透视改变
  makeDraggable(flashlight, (dx, _dy) => {
    flashlightX = Phaser.Math.Clamp(flashlightX + dx, 240, 680);
  });

  // 描风绘制逻辑
  const windPoint = (event: PointerEvent) => {
    const bounds = windLayer.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * HEIGHT,
    };
  };

  const finishWindStroke = () => {
    const index = (windStrokeCount + 1) as 1 | 2 | 3;
    const guide = windGuides[windStrokeCount];
    const progressPath = windProgressPaths[windStrokeCount];
    progressPath.style.strokeDashoffset = '0';
    guide.classList.remove('is-current');
    guide.classList.add('is-drawn');
    windStrokeCount = index;
    root.classList.add(index === 1 ? 'wind-one' : index === 2 ? 'wind-two' : 'wind-three');
    options.onWindStrokeCompleted?.(index);

    if (index === 1) {
      const sail = root.querySelector<SVGPathElement>('[data-complete="sail"]')!;
      const minX = Math.min(...settledSail.map(p => p.x));
      const maxX = Math.max(...settledSail.map(p => p.x));
      const start = performance.now();
      const flutter = (now: number) => {
        const progress = Math.min(1, (now - start) / 1300);
        const wave = Math.sin(progress * Math.PI * 6) * (1 - progress) * 8;
        sail.setAttribute('d', polygonPath(settledSail.map(p => {
          const weight = Math.pow(Math.max(0, (p.x - minX) / (maxX - minX)), 3);
          return { x: p.x + wave * weight * .3, y: p.y + wave * weight };
        })));
        if (progress < 1 && !closed) sailAnimation = requestAnimationFrame(flutter);
      };
      sailAnimation = requestAnimationFrame(flutter);
      windGuides[1]?.classList.add('is-current');
    } else if (index === 2) {
      windGuides[2]?.classList.add('is-current');
    } else {
      root.classList.remove('wind-two');
      status.textContent = '海风吹拂，小船载着记忆远航了';
      root.classList.add('wind-finished');
      options.onCompleted?.();
    }
    windProgress = 0;
    windDrawing = false;
    windPointerId = null;
  };

  const updateWindStroke = (event: PointerEvent) => {
    if (!windDrawing || windStrokeCount >= 3) return;
    const path = windProgressPaths[windStrokeCount];
    const length = path.getTotalLength();
    const point = windPoint(event);
    const from = Math.max(0, windProgress - 0.025);
    const to = Math.min(1, windProgress + 0.16);
    let nearest = windProgress;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let step = 0; step <= 26; step += 1) {
      const candidate = from + ((to - from) * step) / 26;
      const sample = path.getPointAtLength(candidate * length);
      const distance = Math.hypot(point.x - sample.x, point.y - sample.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = candidate;
      }
    }
    if (nearestDistance <= 30 && nearest >= windProgress - 0.015) {
      windProgress = Math.max(windProgress, nearest);
      path.style.strokeDashoffset = `${length * (1 - windProgress)}`;
      if (windProgress >= .965) finishWindStroke();
    }
  };

  windLayer.addEventListener('pointerdown', event => {
    if (!completed || !brushEquipped || windStrokeCount >= 3) return;
    const path = windProgressPaths[windStrokeCount];
    const start = path.getPointAtLength(0);
    const point = windPoint(event);
    if (Math.hypot(point.x - start.x, point.y - start.y) > 34) return;
    windDrawing = true;
    windPointerId = event.pointerId;
    windProgress = 0;
    windLayer.setPointerCapture(event.pointerId);
    updateWindStroke(event);
  });
  windLayer.addEventListener('pointermove', event => {
    if (event.pointerId === windPointerId) updateWindStroke(event);
  });
  const stopWindStroke = (event: PointerEvent) => {
    if (event.pointerId !== windPointerId) return;
    if (windLayer.hasPointerCapture(event.pointerId)) windLayer.releasePointerCapture(event.pointerId);
    if (windProgress < .965 && windStrokeCount < 3) {
      const path = windProgressPaths[windStrokeCount];
      path.style.strokeDashoffset = `${path.getTotalLength()}`;
    }
    windDrawing = false;
    windPointerId = null;
    windProgress = 0;
  };
  windLayer.addEventListener('pointerup', stopWindStroke);
  windLayer.addEventListener('pointercancel', stopWindStroke);

  const position = () => {
    const bounds = scene.game.canvas.getBoundingClientRect();
    root.style.left = `${bounds.left}px`;
    root.style.top = `${bounds.top}px`;
    root.style.transform = `scale(${bounds.width / WIDTH}, ${bounds.height / HEIGHT})`;
  };
  const close = (notify = true) => {
    if (closed) return;
    closed = true;
    if (alignmentTimer) clearTimeout(alignmentTimer);
    cancelAnimationFrame(sailAnimation);
    scene.scale.off(Phaser.Scale.Events.RESIZE, position);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    root.remove();
    activePuzzles.delete(scene);
    if (notify) options.onClose();
  };
  const onShutdown = () => close(false);

  root.querySelector<HTMLButtonElement>('.seek-shadow-boat__close')!.addEventListener('click', () => close());
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  document.body.append(root);
  position();
  render();
  scene.scale.on(Phaser.Scale.Events.RESIZE, position);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  root.focus();

  const handle: ShadowBoatPuzzleHandle = {
    element: root,
    setBrushEquipped: equipped => {
      brushEquipped = equipped;
      root.classList.toggle('has-brush', equipped);
    },
    close: () => close(),
  };
  activePuzzles.set(scene, handle);
  return handle;
}
