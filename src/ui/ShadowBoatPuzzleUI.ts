import Phaser from 'phaser';
import {
  PIECE_IDS, TARGET, APERTURE, WALL, LIGHT_Y,
  piecePolygon, illuminatedPolygon, shadowPolygon, projectToWall,
  polygonPath, alignment, clipPolygon, type Point, type PieceState, type PieceId,
} from './shadowBoatGeometry';

export interface ShadowBoatPuzzleHandle {
  element: HTMLDivElement;
  setBrushEquipped: (equipped: boolean) => void;
  close: () => void;
}

interface ShadowBoatPuzzleOptions {
  onClose: () => void;
  onAligned?: () => void;
  onWindStrokeCompleted?: (index: 1 | 2 | 3) => void;
  onCompleted?: () => void;
}

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'seek-shadow-boat-style';
const activePuzzles = new WeakMap<Phaser.Scene, ShadowBoatPuzzleHandle>();

function installStyle(): void {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-shadow-boat {
      position: fixed; width: 960px; height: 540px; z-index: 1100;
      overflow: hidden; transform-origin: top left; color: #eadfbe;
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
      position: absolute; inset: 12px; opacity: .19;
      border-bottom: 1px solid rgba(226,212,175,.46);
      background: repeating-linear-gradient(174deg, transparent 0 15px, rgba(208,211,184,.24) 16px 18px);
    }
    .seek-shadow-boat__piece {
      position: absolute; padding: 0; border: 0; cursor: grab; touch-action: none;
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
      display: flex; align-items: flex-end; justify-content: center; padding: 0 0 9px;
      border: 1px solid rgba(236,218,173,.34); border-radius: 9px 9px 18px 18px;
      color: #ead7a6; background: linear-gradient(180deg, #5d6256, #292f2b);
      box-shadow: 0 7px 14px rgba(0,0,0,.38); cursor: ew-resize; touch-action: none;
      font-size: 8px;
    }
    .seek-shadow-boat__flashlight::before {
      content: ''; position: absolute; left: -7px; top: -10px; width: 56px; height: 23px;
      border: 1px solid rgba(238,221,176,.42); border-radius: 50% 50% 8px 8px;
      background: linear-gradient(180deg, #a39a7c, #575c52);
      box-shadow: 0 -3px 9px rgba(246,224,164,.13);
    }
    .seek-shadow-boat__flashlight::after {
      content: ''; position: absolute; left: 2px; top: 0; width: 38px; height: 13px;
      border-radius: 50%; background: rgba(255,231,165,.72);
      box-shadow: 0 0 10px rgba(255,230,157,.42);
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
      stroke: rgba(239,226,192,.65); stroke-width: 3; opacity: .24;
      transition: opacity 260ms ease, filter 260ms ease;
    }
    .seek-shadow-boat__wind-guide.is-current {
      opacity: .42; filter: drop-shadow(0 0 4px rgba(239,221,171,.24));
      animation: seek-wind-guide-pulse 1800ms ease-in-out infinite;
    }
    .seek-shadow-boat__wind-guide.is-drawn { opacity: .18; animation: none; }
    .seek-shadow-boat__wind-progress {
      stroke: rgba(250,231,177,.9); stroke-width: 5;
      filter: drop-shadow(0 0 5px rgba(247,218,145,.46));
    }
    .seek-shadow-boat.wind-one .seek-shadow-boat__complete-sail {
      transform-origin: 100% 100%; animation: seek-sail-corner 900ms ease-in-out;
    }
    .seek-shadow-boat.wind-two .seek-shadow-boat__complete {
      animation: seek-boat-float 1500ms ease-in-out;
    }
    .seek-shadow-boat.wind-two .seek-shadow-boat__sea {
      animation: seek-sea-ripple 1100ms ease-in-out;
    }
    .seek-shadow-boat.wind-three .seek-shadow-boat__complete {
      transform: translate(180px, -5px) scale(.38); opacity: .55;
      transition: transform 2800ms cubic-bezier(.22,.72,.18,1), opacity 2800ms ease;
    }
    .seek-shadow-boat.wind-three .seek-shadow-boat__light-volume { opacity: .025; }
    .seek-shadow-boat.wind-finished .seek-shadow-boat__wind-layer { pointer-events: none; }
    @keyframes seek-wind-guide-pulse {
      0%, 100% { opacity: .28; }
      50% { opacity: .52; }
    }
    @keyframes seek-sail-corner {
      0%, 100% { transform: rotate(0deg); }
      28% { transform: rotate(4deg); }
      52% { transform: rotate(-3deg); }
      76% { transform: rotate(2deg); }
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

    .seek-shadow-boat__optics { position:absolute; inset:0; width:960px; height:540px; pointer-events:none; }
    .seek-shadow-boat__light-volume { fill: #ffedba; opacity:.085; }
    .seek-shadow-boat__light-patch { fill:#ffe8b3; opacity:.25; }
    .seek-shadow-boat__cast { fill:#111711; opacity:.88; }
    .seek-shadow-boat__target { fill:rgba(191,172,128,.1); stroke:rgba(247,224,164,.62); stroke-width:1.5; stroke-dasharray:4 5; }
    .seek-shadow-boat__piece { background:none; border:0; padding:0; filter:drop-shadow(2px 3px 2px #101510); }
    .seek-shadow-boat__piece svg { display:block; width:100%; height:100%; overflow:visible; }
    .seek-shadow-boat__piece-label { opacity:0; }
    .seek-shadow-boat__piece:hover .seek-shadow-boat__piece-label,
    .seek-shadow-boat__piece:focus-visible .seek-shadow-boat__piece-label { opacity:1; }
    .seek-shadow-boat__complete { opacity:0; fill:#111711; transform-box:fill-box; transform-origin:center; transition:opacity 350ms, transform 800ms; }
    .seek-shadow-boat__complete-sail { transform-box:fill-box; transform-origin:bottom left; }
    .seek-shadow-boat.is-complete .seek-shadow-boat__cast,
    .seek-shadow-boat.is-complete .seek-shadow-boat__target { opacity:0; }
    .seek-shadow-boat.is-complete .seek-shadow-boat__flashlight { pointer-events:none; }
    .seek-shadow-boat__picture-frame { background:rgba(205,185,144,.16); transform:skewY(-5.14deg); }
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
      <h2 class="seek-shadow-boat__title">拖动物件，轻点转向；挪动灯光，看看墙上的变化。</h2>
      <p class="seek-shadow-boat__copy">拖动物件，轻点切换方向。</p>
      <button class="seek-shadow-boat__close" type="button" aria-label="关闭">×</button>
      <div class="seek-shadow-boat__wall">
        <div class="seek-shadow-boat__picture-frame">
          <div class="seek-shadow-boat__wall-drawing" aria-hidden="true"></div>
        </div>
        <div class="seek-shadow-boat__moon"></div>
        <div class="seek-shadow-boat__sea"></div>
        <svg class="seek-shadow-boat__optics" viewBox="0 0 960 540" aria-hidden="true">
          <path class="seek-shadow-boat__light-volume" />
          <path class="seek-shadow-boat__light-patch" />
          <path class="seek-shadow-boat__target" />
          <path class="seek-shadow-boat__cast" />
          <g class="seek-shadow-boat__complete"><path data-complete="hull" /><path class="seek-shadow-boat__complete-sail" data-complete="sail" /><path data-complete="mast" /></g>
        </svg>
        <div class="seek-shadow-boat__stand"></div>
        <button class="seek-shadow-boat__piece" data-piece="hull" type="button" aria-label="笔袋"><svg><path data-body /><path data-lit /></svg><span class="seek-shadow-boat__piece-label">笔袋</span></button>
        <button class="seek-shadow-boat__piece" data-piece="sail" type="button" aria-label="三角尺"><svg><path data-body /><path data-lit /></svg><span class="seek-shadow-boat__piece-label">三角尺</span></button>
        <button class="seek-shadow-boat__piece" data-piece="mast" type="button" aria-label="细尺"><svg><path data-body /><path data-lit /></svg><span class="seek-shadow-boat__piece-label">细尺</span></button>
        <svg class="seek-shadow-boat__wind-layer" viewBox="0 0 960 540" aria-label="依次描出三笔风">
          <path class="seek-shadow-boat__wind-guide" data-wind-guide="1" d="M 548 143 C 568 127, 602 127, 630 140" />
          <path class="seek-shadow-boat__wind-progress" data-wind-progress="1" d="M 548 143 C 568 127, 602 127, 630 140" />
          <path class="seek-shadow-boat__wind-guide" data-wind-guide="2" d="M 550 173 C 575 155, 610 157, 640 168" />
          <path class="seek-shadow-boat__wind-progress" data-wind-progress="2" d="M 550 173 C 575 155, 610 157, 640 168" />
          <path class="seek-shadow-boat__wind-guide" data-wind-guide="3" d="M 555 203 C 580 185, 618 192, 648 185" />
          <path class="seek-shadow-boat__wind-progress" data-wind-progress="3" d="M 555 203 C 580 185, 618 192, 648 185" />
        </svg>
        <div class="seek-shadow-boat__range"></div>
        <button class="seek-shadow-boat__flashlight" type="button" aria-label="移动手电筒">手电筒</button>
      </div>
    </section>`;

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
    const colors = { hull: '#8b6941', sail: '#bd9d61', mast: '#d2b177' };
    PIECE_IDS.forEach(id => {
      const points = piecePolygon(states[id]);
      const lit = illuminatedPolygon(states[id]);
      const padding = id === 'mast' ? 10 : 5;
      const minX = Math.min(...points.map(p=>p.x))-padding, minY = Math.min(...points.map(p=>p.y))-padding;
      const width = Math.max(...points.map(p=>p.x))-minX+padding, height = Math.max(...points.map(p=>p.y))-minY+padding;
      const piece = root.querySelector<HTMLElement>(`[data-piece="${id}"]`)!;
      Object.assign(piece.style,{ left:`${minX}px`,top:`${minY}px`,width:`${width}px`,height:`${height}px` });
      piece.querySelector('svg')!.setAttribute('viewBox',`${minX} ${minY} ${width} ${height}`);
      const body = piece.querySelector('[data-body]')!;
      body.setAttribute('d',polygonPath(points)); body.setAttribute('fill',colors[id]);
      body.setAttribute('stroke','#332c20'); body.setAttribute('stroke-width','1');
      const highlight = piece.querySelector('[data-lit]')!;
      highlight.setAttribute('d',polygonPath(lit)); highlight.setAttribute('fill','#ffe5a4'); highlight.setAttribute('opacity','.38');
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
        state.x = Phaser.Math.Clamp(state.x + dx, 360, 720);
        state.y = Phaser.Math.Clamp(state.y + dy, 275, id === 'mast' ? 345 : id === 'sail' ? 355 : 390);
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
      windGuides[1]?.classList.add('is-current');
    } else if (index === 2) {
      windGuides[2]?.classList.add('is-current');
    } else {
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
