import Phaser from 'phaser';
import {
  PIECE_IDS, TARGET, APERTURE, WALL, LIGHT_Y,
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
import wallBoatUrl from '../../assets/environment/room-wall-boat.png?url';

export interface ShadowBoatPuzzleHandle {
  element: HTMLDivElement;
  setBrushEquipped: (equipped: boolean) => void;
  close: () => void;
}

interface ShadowBoatPuzzleOptions {
  onClose: () => void;
  /** 正式流程可在电池装入前传 false；光影谜题默认使用亮灯状态。 */
  flashlightPowered?: boolean;
  onAligned?: () => void;
  onWindStrokeCompleted?: (index: 1 | 2 | 3) => void;
  onCompleted?: () => void;
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
// 美术图作为靠近玩家的前景实物显示；投影仍只读取上面的逻辑尺寸。
const PIECE_ART_SCALE = 1.7;
const PIECE_ART_FORWARD_Y = 14;

function installStyle(): void {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-shadow-boat {
      position: fixed; width: 960px; height: 540px; z-index: 1100;
      overflow: hidden; user-select: none; -webkit-user-select: none; transform-origin: top left; color: #eadfbe;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .seek-shadow-boat * { box-sizing: border-box; }
    .seek-shadow-boat__backdrop {
      position: absolute; inset: 0; border: 0; cursor: default;
      background: radial-gradient(circle at 52% 37%, transparent 0 28%, rgba(5,10,8,.16) 88%);
    }
    .seek-shadow-boat__panel {
      position: absolute; inset: 0;
      border: 1px solid rgba(239,220,174,.22);
      background: transparent;
      box-shadow: inset 0 0 52px rgba(3,9,7,.18);
      overflow: hidden;
    }
    .seek-shadow-boat__title {
      position: absolute; left: 18px; top: 16px; z-index: 5; margin: 0;
      padding: 8px 11px; border: 1px solid rgba(239,220,174,.17); border-radius: 7px;
      color: rgba(246,233,198,.9); background: rgba(12,21,17,.67);
      box-shadow: 0 4px 16px rgba(0,0,0,.18);
      font: 13px/1.25 Arial, "Microsoft YaHei", sans-serif; letter-spacing: .02em;
    }
    .seek-shadow-boat__copy {
      display: none;
    }
    .seek-shadow-boat__close {
      position: absolute; right: 18px; top: 15px; z-index: 5; width: 38px; height: 38px;
      border: 1px solid rgba(239,220,174,.16); border-radius: 7px;
      color: rgba(240,223,181,.78); background: rgba(12,21,17,.58);
      font-size: 28px; cursor: pointer;
    }
    .seek-shadow-boat__close:hover, .seek-shadow-boat__close:focus-visible {
      color: #fff5d8; outline: none;
    }
    .seek-shadow-boat__wall {
      position: absolute; inset: 0; width: 960px; height: 540px;
      border: 0;
      overflow: hidden; touch-action: none;
      background: transparent;
    }
    .seek-shadow-boat__sea {
      position: absolute; left: 630px; top: 255px; width: 260px; height: 45px;
      opacity: .27;
      background: repeating-linear-gradient(174deg, transparent 0 11px, rgba(190,207,190,.22) 12px 14px);
      border-top: 1px solid rgba(207,219,196,.12);
    }
    .seek-shadow-boat__moon {
      position: absolute; left: 824px; top: 113px; width: 42px; height: 42px;
      border-radius: 50%; background: rgba(246,230,182,.12);
      box-shadow: 0 0 30px rgba(238,222,179,.08);
    }
    .seek-shadow-boat__picture-frame {
      position: absolute; left: 545px; top: 72px; width: 380px; height: 270px;
      border: 5px solid rgba(112,87,54,.62); outline: 1px solid rgba(238,215,166,.22);
      box-shadow: inset 0 0 0 2px rgba(33,24,17,.52), 0 5px 16px rgba(4,8,6,.3);
      pointer-events: none;
    }
    .seek-shadow-boat__wall-drawing {
      position: absolute; inset: 0; overflow: hidden;
      background: transparent;
    }
    .seek-shadow-boat__wall-drawing img {
      display: block; width: 100%; height: 100%; object-fit: cover;
      opacity: 1;
    }
    .seek-shadow-boat__wall-boat {
      position: absolute; left: 621px; top: 185px; z-index: 2;
      width: 120px; height: 83px; object-fit: contain;
      opacity: 0; pointer-events: none; transform-origin: center;
      filter: saturate(.88) brightness(.9) drop-shadow(0 2px 2px rgba(12,19,17,.3));
    }
    .seek-shadow-boat__piece {
      position: absolute; padding: 0; border: 0; cursor: grab; touch-action: none;
      overflow: visible;
      color: rgba(242,225,185,.78);
      filter: drop-shadow(5px 6px 6px rgba(0,0,0,.38));
      transition: color 180ms ease, filter 180ms ease;
    }
    .seek-shadow-boat__piece:focus-visible { outline: 2px solid #e2c77f; outline-offset: 5px; }
    .seek-shadow-boat__piece.is-dragging { cursor: grabbing; filter: drop-shadow(7px 9px 8px rgba(0,0,0,.46)); }

    .seek-shadow-boat__piece-label {
      position: absolute; left: 50%; top: calc(100% + 7px); transform: translateX(-50%);
      padding: 3px 7px; border: 1px solid rgba(231,215,176,.18); border-radius: 10px;
      color: rgba(238,223,188,.72); background: rgba(13,21,18,.72);
      font-size: 10px; line-height: 1; white-space: nowrap; pointer-events: none;
    }
    .seek-shadow-boat__flashlight {
      position: absolute; left: 170px; top: 493px; width: 42px; height: 66px; transform-origin: 21px 7px;
      display: block; padding: 0; border: 0; overflow: visible;
      color: transparent; background: transparent;
      cursor: ew-resize; touch-action: none;
    }
    .seek-shadow-boat__flashlight-art {
      position: absolute; left: 50%; top: -10px; width: 55px; height: 83px;
      transform: translateX(-50%); object-fit: contain; pointer-events: none;
      filter: drop-shadow(0 7px 6px rgba(0,0,0,.38));
    }
    .seek-shadow-boat__range {
      position: absolute; left: 72px; right: 72px; bottom: 38px; height: 1px;
      border-top: 1px dashed rgba(230,213,173,.18); pointer-events: none;
    }
    .seek-shadow-boat.is-complete .seek-shadow-boat__piece { pointer-events: none; }
    .seek-shadow-boat.is-complete .seek-shadow-boat__piece-label { opacity: 0; }
    .seek-shadow-boat.is-complete .seek-shadow-boat__complete { opacity: 1; transform: scale(1); }
    .seek-shadow-boat.is-complete .seek-shadow-boat__title { color: #f2dfaa; }
    .seek-shadow-boat__wind-layer {
      position: absolute; inset: 0; z-index: 3; width: 960px; height: 540px;
      overflow: visible; opacity: 0; pointer-events: none; touch-action: none;
      transition: opacity 450ms ease;
    }
    .seek-shadow-boat.is-complete .seek-shadow-boat__wind-layer {
      opacity: 1;
    }
    .seek-shadow-boat.is-complete.has-brush .seek-shadow-boat__wind-layer {
      pointer-events: auto;
    }
    .seek-shadow-boat__wind-guide,
    .seek-shadow-boat__wind-progress {
      fill: none; stroke-linecap: round; stroke-linejoin: round;
    }
    .seek-shadow-boat__wind-guide {
      stroke: rgba(7,10,9,.98); stroke-width: 3.6; opacity: .82;
      transition: opacity 260ms ease, filter 260ms ease;
    }
    .seek-shadow-boat__wind-guide.is-current {
      opacity: .96; filter: drop-shadow(0 1px 1px rgba(245,235,207,.3));
      animation: seek-wind-guide-pulse 1800ms ease-in-out infinite;
    }
    .seek-shadow-boat__wind-guide.is-drawn { opacity: 0; animation: none; }
    .seek-shadow-boat__wind-progress {
      stroke: rgba(255,251,226,.96); stroke-width: 7;
      filter: url(#seek-wind-crayon) drop-shadow(0 1px 1px rgba(48,91,92,.38));
    }
    .seek-shadow-boat.wind-two .seek-shadow-boat__complete {
      animation: seek-boat-float 1500ms ease-in-out;
    }
    .seek-shadow-boat.wind-two .seek-shadow-boat__sea {
      animation: seek-sea-ripple 1100ms ease-in-out;
    }
    .seek-shadow-boat.wind-three .seek-shadow-boat__complete {
      animation: seek-shadow-dissolve 1200ms ease-in-out forwards;
    }
    .seek-shadow-boat.wind-three .seek-shadow-boat__wall-boat {
      animation: seek-painted-boat-sail 3500ms cubic-bezier(.3,.58,.4,1) forwards;
    }
    .seek-shadow-boat__memory-line {
      position: absolute; left: 58px; top: 218px; z-index: 4; width: 360px;
      margin: 0; color: rgba(248,235,203,.94); opacity: 0; pointer-events: none;
      text-align: center; font: 15px/1.85 "Microsoft YaHei", sans-serif; letter-spacing: .04em;
      text-shadow: 0 2px 5px rgba(4,8,6,.9), 0 0 12px rgba(4,8,6,.72);
      transform: translateY(5px);
      transition: opacity 550ms ease, transform 550ms ease;
    }
    .seek-shadow-boat.wind-three .seek-shadow-boat__memory-line {
      opacity: 1; transform: translateY(0);
    }
    .seek-shadow-boat.wind-three .seek-shadow-boat__light-volume { opacity: .025; }
    .seek-shadow-boat.wind-finished .seek-shadow-boat__wind-layer { pointer-events: none; }
    .seek-shadow-boat.has-brush, .seek-shadow-boat.has-brush * { cursor: none; }
    .seek-shadow-boat__brush-cursor { display:none; position:absolute; width:80px; height:40px;
      z-index:20; pointer-events:none; transform:translate(-21px,-34px); object-fit:contain; }
    .seek-shadow-boat.has-brush.is-pointer-inside .seek-shadow-boat__brush-cursor { display:block; }
    @keyframes seek-wind-guide-pulse {
      0%, 100% { opacity: .7; }
      50% { opacity: 1; }
    }
    @keyframes seek-boat-float {
      0%, 100% { transform: translateY(0); }
      40% { transform: translateY(-7px); }
      70% { transform: translateY(3px); }
    }
    @keyframes seek-sea-ripple {
      0%, 100% { opacity: .27; transform: translateX(0); }
      40% { opacity: .55; transform: translateX(8px); }
      70% { opacity: .4; transform: translateX(-5px); }
    }
    @keyframes seek-shadow-dissolve {
      0% { opacity: 1; filter: blur(0); transform: translate(0, 0) scale(1); }
      42% { opacity: .58; filter: blur(.6px); transform: translate(5px, -1px) scale(.99); }
      100% { opacity: 0; filter: blur(2.5px); transform: translate(18px, -2px) scale(.96); }
    }
    @keyframes seek-painted-boat-sail {
      0% { opacity: 0; transform: translate(0, 0) scale(.94); filter: saturate(.6) brightness(.65) blur(1.8px); }
      14% { opacity: .42; transform: translate(3px, -1px) scale(.96); filter: saturate(.7) brightness(.72) blur(1px); }
      34% { opacity: 1; transform: translate(22px, -2px) scale(1); filter: saturate(.88) brightness(.9) blur(0); }
      100% { opacity: 1; transform: translate(180px, -5px) scale(.9); filter: saturate(.88) brightness(.9) blur(0); }
    }

    .seek-shadow-boat__optics { position:absolute; inset:0; width:960px; height:540px; pointer-events:none; }
    .seek-shadow-boat__light-volume { fill: #ffedba; opacity:.085; }
    .seek-shadow-boat__light-patch { fill:#ffe8b3; opacity:.25; }
    .seek-shadow-boat__cast { fill:#111711; opacity:.88; }
    .seek-shadow-boat__target { fill:rgba(7,10,9,.045); stroke:rgba(7,10,9,.9); stroke-width:2.2; stroke-dasharray:5 8; }
    .seek-shadow-boat__piece { background:none; border:0; padding:0; filter:drop-shadow(2px 3px 2px #101510); }
    .seek-shadow-boat__piece-art {
      position: absolute; left: 50%; top: 50%; object-fit: fill;
      transform-origin: center; pointer-events: none; user-select: none;
    }
    .seek-shadow-boat__piece-label { opacity:0; }
    .seek-shadow-boat__piece:hover .seek-shadow-boat__piece-label,
    .seek-shadow-boat__piece:focus-visible .seek-shadow-boat__piece-label { opacity:1; }
    .seek-shadow-boat__complete { opacity:0; fill:#111711; transform-box:fill-box; transform-origin:center; transition:opacity 350ms, transform 800ms; }
    .seek-shadow-boat__complete-sail { transform-box:fill-box; transform-origin:bottom left; }
    .seek-shadow-boat.is-complete .seek-shadow-boat__cast,
    .seek-shadow-boat.is-complete .seek-shadow-boat__target { opacity:0; }
    .seek-shadow-boat.is-complete .seek-shadow-boat__flashlight { pointer-events:none; }
    .seek-shadow-boat__picture-frame { background:transparent; transform:skewY(-5.14deg); }
    .seek-shadow-boat__stand { position:absolute; left:430px; top:399px; width:240px; height:9px; border-radius:50%; background:rgba(87,66,39,.85); border-top:2px solid rgba(223,190,130,.48); box-shadow:0 7px 12px #0b110c66; pointer-events:none; }
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
      <h2 class="seek-shadow-boat__title">为这个大海创造一艘小船吧。</h2>
      <p class="seek-shadow-boat__copy">为这个大海创造一艘小船吧。</p>
      <button class="seek-shadow-boat__close" type="button" aria-label="关闭">×</button>
      <div class="seek-shadow-boat__wall">
        <div class="seek-shadow-boat__picture-frame">
          <div class="seek-shadow-boat__wall-drawing" aria-hidden="true"><img src="${wallDrawingUrl}" alt=""></div>
        </div>
        <div class="seek-shadow-boat__moon"></div>
        <div class="seek-shadow-boat__sea"></div>
        <p class="seek-shadow-boat__memory-line">那天是韩梅梅第一次见到大海<br>有一点点怕，但是又很喜欢……</p>
        <svg class="seek-shadow-boat__optics" viewBox="0 0 960 540" aria-hidden="true">
          <path class="seek-shadow-boat__light-volume" />
          <path class="seek-shadow-boat__light-patch" />
          <path class="seek-shadow-boat__target" />
          <path class="seek-shadow-boat__cast" />
          <g class="seek-shadow-boat__complete"><path data-complete="hull" /><path class="seek-shadow-boat__complete-sail" data-complete="sail" /><path data-complete="mast" /></g>
        </svg>
        <img class="seek-shadow-boat__wall-boat" src="${wallBoatUrl}" alt="" aria-hidden="true">
        <div class="seek-shadow-boat__stand"></div>
        <button class="seek-shadow-boat__piece" data-piece="hull" type="button" aria-label="笔袋"><img class="seek-shadow-boat__piece-art" src="${pencilCaseUrl}" alt=""><span class="seek-shadow-boat__piece-label">笔袋</span></button>
        <button class="seek-shadow-boat__piece" data-piece="sail" type="button" aria-label="三角尺"><img class="seek-shadow-boat__piece-art" src="${triangleRulerUrl}" alt=""><span class="seek-shadow-boat__piece-label">三角尺</span></button>
        <button class="seek-shadow-boat__piece" data-piece="mast" type="button" aria-label="细尺"><img class="seek-shadow-boat__piece-art" src="${thinRulerUrl}" alt=""><span class="seek-shadow-boat__piece-label">细尺</span></button>
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
        <div class="seek-shadow-boat__range"></div>
        <button class="seek-shadow-boat__flashlight" type="button" aria-label="移动手电筒"><img class="seek-shadow-boat__flashlight-art" src="${options.flashlightPowered === false ? flashlightOffUrl : flashlightOnUrl}" alt=""></button>
      </div>
    </section><img class="seek-shadow-boat__brush-cursor" src="${paintBrushUrl}" alt="" aria-hidden="true">`;

  root.addEventListener('dragstart', event => event.preventDefault());
  root.querySelectorAll('img').forEach(img => { img.draggable = false; });
  const wall = root.querySelector<HTMLElement>('.seek-shadow-boat__wall')!;
  const cast = root.querySelector<SVGPathElement>('.seek-shadow-boat__cast')!;
  const lightPatch = root.querySelector<SVGPathElement>('.seek-shadow-boat__light-patch')!;
  const lightVolume = root.querySelector<SVGPathElement>('.seek-shadow-boat__light-volume')!;
  root.querySelector('.seek-shadow-boat__target')!.setAttribute('d', TARGET.map(polygonPath).join(' '));
  const flashlight = root.querySelector<HTMLButtonElement>('.seek-shadow-boat__flashlight')!;
  const status = root.querySelector<HTMLElement>('.seek-shadow-boat__title')!;
  const windLayer = root.querySelector<SVGSVGElement>('.seek-shadow-boat__wind-layer')!;
  const windGuides = [...root.querySelectorAll<SVGPathElement>('[data-wind-guide]')];
  const windProgressPaths = [...root.querySelectorAll<SVGPathElement>('[data-wind-progress]')];
  const states: Record<PieceId, PieceState> = {
    hull: { id: 'hull', x: 390, y: 380, rotation: 0 },
    sail: { id: 'sail', x: 548, y: 352, rotation: 1 },
    mast: { id: 'mast', x: 485, y: 335, rotation: 1 },
  };
  let flashlightX = 520;
  let alignmentTimer: ReturnType<typeof setTimeout> | undefined;
  let completed = false;
  let brushEquipped = false;
  let windStrokeCount = 0;
  let windDrawing = false;
  let windPointerId: number | null = null;
  let windProgress = 0;
  let closed = false;
  let sailAnimation = 0;
  let settledSail: Point[] = [];
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

  const render = () => {
    const polygons = PIECE_IDS.map(id => shadowPolygon(states[id], flashlightX));
    cast.setAttribute('d', polygons.map(polygonPath).join(' '));
    // Every beam boundary uses the same ray/wall intersection as the shadow.
    const footprint = APERTURE.map(p => projectToWall(p, flashlightX));
    lightPatch.setAttribute('d', polygonPath(clipPolygon(footprint, WALL)));
    const boundary = [...footprint, { x: flashlightX, y: LIGHT_Y }].sort((a,b) => a.x-b.x || a.y-b.y);
    const turn = (a: Point,b: Point,c: Point) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const lower: Point[] = [], upper: Point[] = [];
    for (const p of boundary) { while(lower.length>1 && turn(lower[lower.length-2],lower[lower.length-1],p)<=0) lower.pop(); lower.push(p); }
    for (const p of [...boundary].reverse()) { while(upper.length>1 && turn(upper[upper.length-2],upper[upper.length-1],p)<=0) upper.pop(); upper.push(p); }
    lightVolume.setAttribute('d', polygonPath([...lower.slice(0,-1),...upper.slice(0,-1)]));
    PIECE_IDS.forEach(id => {

      const padding = id === 'mast' ? 10 : 5;
      const artSize = PIECE_ART_SIZE[id];
      const artWidth = artSize.width * PIECE_ART_SCALE;
      const artHeight = artSize.height * PIECE_ART_SCALE;
      const renderedArtWidth = states[id].rotation ? artHeight : artWidth;
      const renderedArtHeight = states[id].rotation ? artWidth : artHeight;
      // One transform for the entire assembly keeps the visible triangle,
      // ruler and bag connected exactly as their projected counterparts.
      const artCenterX = 550 + (states[id].x + artSize.width / 2 - 550) * PIECE_ART_SCALE;
      const artCenterY = 360 + (states[id].y + artSize.height / 2 - 360) * PIECE_ART_SCALE + PIECE_ART_FORWARD_Y;
      const minX = artCenterX - renderedArtWidth / 2 - padding;
      const minY = artCenterY - renderedArtHeight / 2 - padding;
      const maxX = artCenterX + renderedArtWidth / 2 + padding;
      const maxY = artCenterY + renderedArtHeight / 2 + padding;
      const width = maxX - minX;
      const height = maxY - minY;
      const piece = root.querySelector<HTMLElement>(`[data-piece="${id}"]`)!;
      Object.assign(piece.style,{ left:`${minX}px`,top:`${minY}px`,width:`${width}px`,height:`${height}px` });
      const art = piece.querySelector<HTMLImageElement>('.seek-shadow-boat__piece-art')!;
      Object.assign(art.style, {
        left: `${artCenterX - minX}px`,
        top: `${artCenterY - minY}px`,
        width: `${artWidth}px`,
        height: `${artHeight}px`,
        transform: `translate(-50%, -50%) rotate(${states[id].rotation ? 90 : 0}deg)`,
      });
    });
    flashlight.style.left = `${flashlightX-21}px`;
    flashlight.style.transform = `rotate(${Math.atan2(555-flashlightX,LIGHT_Y-352)*180/Math.PI}deg)`;
    const match = alignment(polygons);
    root.dataset.overlap = match.overlap.toFixed(3);
    if (!completed && match.ready && !alignmentTimer) {
      alignmentTimer = setTimeout(() => {
        alignmentTimer = undefined;
        const current = PIECE_IDS.map(id => shadowPolygon(states[id],flashlightX));
        if (closed || !alignment(current).ready) return;
        completed = true;
        settledSail = current[1];
        PIECE_IDS.forEach((id,i) => root.querySelector(`[data-complete="${id}"]`)!.setAttribute('d',polygonPath(current[i])));
        root.classList.add('is-complete');
        status.textContent = '试试用画笔画一画吧。';
        windGuides[0]?.classList.add('is-current');
        options.onAligned?.();
      }, 400);
    } else if (!match.ready && alignmentTimer) {
      clearTimeout(alignmentTimer); alignmentTimer = undefined;
    }
  };

  const makeDraggable = (element: HTMLElement, onMove: (dx: number, dy: number) => void, onTap?: () => void) => {
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
    };
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
  };

  (Object.keys(states) as PieceId[]).forEach(id => {
    const state = states[id];
    const element = root.querySelector<HTMLElement>(`[data-piece="${id}"]`)!;
    makeDraggable(
      element,
      (dx, dy) => {
        state.x = Phaser.Math.Clamp(state.x + dx / PIECE_ART_SCALE, 360, 720);
        state.y = Phaser.Math.Clamp(state.y + dy / PIECE_ART_SCALE, 250, 425 - PIECE_ART_SIZE[id].height / 2);
      },
      () => { state.rotation = state.rotation === 0 ? 1 : 0; },
    );
  });
  makeDraggable(flashlight, dx => {
    flashlightX = Phaser.Math.Clamp(flashlightX + dx, 220, 760);
  });

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
      status.textContent = '';
      status.style.display = 'none';
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
