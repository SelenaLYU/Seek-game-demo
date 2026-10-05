import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { chapterState, completedChapters } from './Progress';
import { showAlbumUI, type AlbumHandle } from '../ui/AlbumUI';
import { characterGroundHeight } from './grounding';

type Options = { justCompleted?: number; completionSaved?: boolean; onHome: () => void; onChapter: (chapter: number) => void };
type Building = { id: number; door: THREE.Vector3; box: THREE.Box3; materials: THREE.MeshStandardMaterial[]; colors: THREE.Color[] };

/** Self-contained Three.js view. The returned cleanup also releases all GPU resources. */
export function mountMemoryIsland(options: Options): () => void {
  const root = document.createElement('section');
  root.className = 'memory-island';
  root.innerHTML = `<style>
    .memory-island{position:fixed;inset:0;z-index:1100;background:#b9d0cf;color:#243d3d;font-family:system-ui,"Microsoft YaHei",sans-serif;overflow:hidden}
    .memory-island canvas{display:block;width:100%;height:100%;touch-action:none}
    .memory-island .hud{position:absolute;inset:0;pointer-events:none;padding:28px;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box}
    .memory-island header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .memory-island h1{font-family:serif;font-size:30px;font-weight:500;margin:4px 0 8px;letter-spacing:5px}
    .memory-island .eyebrow{font-size:11px;letter-spacing:3px;color:#49645f}
    .memory-island .subtitle{font-size:13px;margin:0;line-height:1.8}
    .memory-island button{pointer-events:auto;cursor:pointer;border:1px solid #56746c55;background:#f7f7efdd;color:#29463f;padding:12px 20px;border-radius:24px;font:inherit;font-size:14px;backdrop-filter:blur(10px)}
    .memory-island button:hover{background:#fff}.memory-island button:focus-visible{outline:3px solid #be8c49;outline-offset:3px}
    .memory-island button.primary{background:#2e574e;color:#fff;border-color:#2e574e}
    .memory-island footer{display:flex;align-items:end;justify-content:space-between;gap:20px}
    .memory-island .panel{background:#f7f8f0df;border:1px solid #ffffff99;border-radius:16px;padding:17px 22px;backdrop-filter:blur(10px);max-width:420px;box-shadow:0 5px 25px #294a3b0a}
    .memory-island .instructions{font-size:13px;line-height:1.9;margin:6px 0 0;color:#587068}
    .memory-island .actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .memory-island .chapter-picker{position:absolute;right:28px;top:112px;width:286px;pointer-events:auto}
    .memory-island .chapter-picker strong{display:block;margin-bottom:10px;font-size:14px;letter-spacing:.08em}
    .memory-island .chapter-list{display:grid;gap:8px}
    .memory-island .chapter-entry{display:grid;grid-template-columns:34px 1fr;align-items:center;gap:10px;width:100%;padding:10px 13px;border-radius:13px;text-align:left}
    .memory-island .chapter-entry span:first-child{font:18px/1 Georgia,serif;color:#906f45}
    .memory-island .chapter-entry b{display:block;font-size:13px;font-weight:650}
    .memory-island .chapter-entry small{display:block;margin-top:3px;color:#60766f;font-size:11px}
    .memory-island .chapter-entry:disabled{cursor:default;opacity:.52;background:#dfe4ded8}
    .memory-island .nearby{position:absolute;left:50%;bottom:125px;transform:translateX(-50%);text-align:center;min-width:240px;pointer-events:auto}
    .memory-island .nearby p{margin:0 0 12px;font-size:14px}
    .memory-island [hidden]{display:none!important}
    .memory-island .toast{position:absolute;left:50%;top:120px;transform:translateX(-50%);background:#264d43ed;color:#fff;padding:14px 24px;border-radius:28px;text-align:center;max-width:80%;font-size:14px}
    @media(max-width:650px){.memory-island .hud{padding:15px}.memory-island h1{font-size:24px}.memory-island footer{align-items:stretch;flex-direction:column;gap:10px}.memory-island .panel{padding:12px 16px}.memory-island .nearby{bottom:205px}.memory-island button{padding:10px 14px}.memory-island .subtitle{max-width:210px}.memory-island .chapter-picker{right:15px;top:118px;width:245px}}
  </style><div class="hud"><header><div><div class="eyebrow">SEEK / MEMORY ISLAND</div><h1>记忆之岛</h1><p class="subtitle">六段人生，慢慢找回。<br><span data-progress></span></p></div><button data-home>返回首页</button></header>
  <aside class="chapter-picker panel" data-chapter-picker><strong>记忆入口</strong><div class="chapter-list" data-chapter-list></div></aside>
  <div class="toast" role="status" hidden></div><div class="nearby panel" hidden><p></p><button class="primary" data-interact></button></div>
  <footer><div class="panel"><strong data-mode>岛屿总览</strong><p class="instructions"></p></div><div class="actions"><button data-album>相册</button><button class="primary" data-switch>进入岛屿</button></div></footer></div>`;
  document.body.append(root);
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const switchButton = get<HTMLButtonElement>('[data-switch]');
  const nearbyPanel = get<HTMLElement>('.nearby');
  const interactButton = get<HTMLButtonElement>('[data-interact]');
  const chapterPicker = get<HTMLElement>('[data-chapter-picker]');
  const chapterList = get<HTMLElement>('[data-chapter-list]');
  const instruction = get<HTMLElement>('.instructions');
  const toast = get<HTMLElement>('.toast');
  const abort = new AbortController();
  const signal = abort.signal;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c8dedc');
  scene.fog = new THREE.Fog('#c8dedc', 48, 115);
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch (error) { root.remove(); throw error; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.prepend(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
  camera.position.set(40, 39, 47);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 27;
  controls.maxDistance = 85;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI / 2.45;
  controls.update();
  scene.add(new THREE.HemisphereLight('#efffff', '#718674', 2.4));
  const sun = new THREE.DirectionalLight('#fff1d3', 3);
  sun.position.set(-18, 30, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, far: 80 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = scene): THREE.Mesh {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  }
  const sea = mesh(new THREE.PlaneGeometry(350, 350), mat('#83b8bb'));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -1.3; sea.castShadow = false;
  // The same smooth shoreline drives the ground, beach, trees and walking limit.
  // Its minimum radius leaves the existing town and all six entrances on dry land.
  const coastlineRadius = (angle: number) => 30.1
    + 1.7 * Math.sin(3 * angle + 0.55)
    + 0.85 * Math.cos(2 * angle - 0.8)
    + 0.55 * Math.sin(5 * angle + 1.4);
  const walkableHeight = (x: number, z: number) => Math.hypot(x, z) < 27 ? 0 : -0.25;
  function islandGeometry(top: number, bottom: number, height: number) {
    const geometry = new THREE.CylinderGeometry(top, bottom, height, 128);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      const radius = Math.hypot(x, z);
      if (radius < 0.001) continue;
      const scale = (radius + coastlineRadius(Math.atan2(x, z)) - 27) / radius;
      positions.setXYZ(i, x * scale, positions.getY(i), z * scale);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
  const shore = mesh(islandGeometry(28.4, 27.5, 1.8), mat('#cfcbb1'));
  shore.position.y = -1;
  const land = mesh(islandGeometry(27, 28.4, 0.5), mat('#b6bdb0'));
  land.position.y = -0.25;
  const plaza = mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.04, 7), mat('#d9d6c7'));
  plaza.position.y = 0.02;
  const buildings: Building[] = [];
  const collisionMeshes: THREE.Object3D[] = [];
  const obstacles: THREE.Box3[] = [];
  const districtMaterials: { id: number; material: THREE.MeshStandardMaterial; color: THREE.Color; gray: THREE.Color }[] = [];
  function districtMaterial(id: number, color: string, gray = '#a4adaa') {
    const material = mat(chapterState(id) === 'completed' && options.justCompleted !== id ? color : gray);
    districtMaterials.push({ id, material, color: new THREE.Color(color), gray: new THREE.Color(gray) });
    return material;
  }
  function lane(points: number[][], width = 2.4) {
    for (let j = 1; j < points.length; j++) {
      const [ax, az] = points[j - 1], [bx, bz] = points[j];
      const paving = mesh(new THREE.BoxGeometry(width, 0.035, Math.hypot(bx - ax, bz - az) + width * 0.35), mat('#d6d4c8'));
      paving.position.set((ax + bx) / 2, 0.035, (az + bz) / 2);
      paving.rotation.y = Math.atan2(bx - ax, bz - az);
    }
  }
  // An irregular main street with side alleys, rather than six radial spokes.
  lane([[-22, 7], [-12, 5], [-4, 2], [2, 0], [6, -6], [4, -13], [8, -22]], 3.2);
  lane([[-4, 2], [-9, -4], [-10, -10], [-8, -14]], 2.6);
  lane([[2, 0], [9, 4], [13, 2], [17, 3]], 2.6);
  lane([[-12, 5], [-13, 10], [-9, 13]], 2.6);
  lane([[9, 4], [8, 11], [5, 14]], 2.6);
  const sites = [
    { x: -8, z: -17, yaw: 0.08, width: 4.8, depth: 4.4, height: 4 },
    { x: 10, z: -13, yaw: -Math.PI / 2, width: 6.2, depth: 4.4, height: 5 },
    { x: 19, z: 1, yaw: -Math.PI / 2 + 0.12, width: 4.2, depth: 4.2, height: 7 },
    { x: 4, z: 17, yaw: Math.PI, width: 5.4, depth: 4.4, height: 4.3 },
    { x: -12, z: 15, yaw: Math.PI + 0.18, width: 5.6, depth: 4.4, height: 5.6 },
    { x: -19, z: -3, yaw: Math.PI / 2, width: 4.8, depth: 4.8, height: 4.8 },
  ];
  lane([[-12, 5], [-14, 0], [-15, -3]], 2.4);
  function roofOn(parent: THREE.Group, width: number, depth: number, height: number, material: THREE.Material) {
    const roof = mesh(new THREE.CylinderGeometry(0, 1, 1, 4, 1), material, parent);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set((width + 1) / Math.SQRT2, 1.5, (depth + 1.3) / Math.SQRT2);
    roof.position.y = height + 0.72;
    const eave = mesh(new THREE.BoxGeometry(width + 0.7, 0.16, depth + 0.8), material, parent);
    eave.position.y = height;
    return roof;
  }
  const palette = ['#dcb995', '#91afb0', '#acb999', '#d4afa4', '#b5aac6', '#c5be96'];
  const labels: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const id = i + 1;
    const site = sites[i];
    const center = new THREE.Vector3(site.x, 0, site.z);
    const group = new THREE.Group(); group.position.copy(center); scene.add(group);
    const height = site.height;
    const completed = chapterState(id) === 'completed';
    const materials = [districtMaterial(id, palette[i]), districtMaterial(id, '#586d68', '#81908d')];
    const walls = mesh(new THREE.BoxGeometry(site.width, height, site.depth), materials[0], group);
    walls.position.y = height / 2;
    const roof = roofOn(group, site.width, site.depth, height, materials[1]);
    const toCenter = new THREE.Vector3(Math.sin(site.yaw), 0, Math.cos(site.yaw));
    group.rotation.y = site.yaw;
    const door = mesh(new THREE.BoxGeometry(1.25, 2.25, 0.12), districtMaterial(id, '#765b47', '#667775'), group);
    door.position.set(0, 1.125, site.depth / 2 + 0.05);
    for (const x of [-1.6, 1.6]) {
      const window = mesh(new THREE.BoxGeometry(0.8, 1.2, 0.13), districtMaterial(id, '#efd5a0', '#c0c9c7'), group);
      window.position.set(x, height * 0.61, site.depth / 2 + 0.05);
    }
    const doorPosition = center.clone().addScaledVector(toCenter, site.depth / 2 + 1.5);
    const court = mesh(new THREE.BoxGeometry(site.width + 2, 0.025, 3.4), districtMaterial(id, '#d7cbb2', '#bbc1b9'));
    court.position.copy(doorPosition); court.position.y = 0.055; court.rotation.y = site.yaw;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(walls).expandByScalar(0.42);
    obstacles.push(box);
    buildings.push({ id, door: doorPosition, box, materials, colors: [new THREE.Color(palette[i]), new THREE.Color('#677f75')] });
    collisionMeshes.push(walls, roof);
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f6edde'; ctx.beginPath(); ctx.roundRect(0, 0, 640, 160, 35); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#2f4b43'; ctx.font = 'bold 40px sans-serif';
    ctx.fillText(`${String(id).padStart(2, '0')}  ${['童年', '学生时代', '人生阶段三', '人生阶段四', '人生阶段五', '人生阶段六'][i]}`, 320, 65);
    ctx.font = '29px sans-serif';
    ctx.fillText(completed ? '记忆已点亮' : chapterState(id) === 'available' ? '下一段旅程' : '记忆尚未解锁', 320, 118);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    label.position.copy(center).add(new THREE.Vector3(0, height + 2.8, 0)); label.scale.set(6.4, 1.6, 1); scene.add(label); labels.push(label);
  }
  // Ordinary homes belong to a district but never become level entrances.
  const homes = [
    [1,-15,-16,3.2,3,3.2,0.12],[1,-2,-19,3,4,3.8,-0.1],[1,-3,-10,3,3,2.6,1.4],
    [2,15,-16,3.3,3,3.4,-1.4],[2,15,-8,4,3,2.8,-1.6],[2,3,-21,2.8,3,3.1,0.4],
    [3,20,8,3,3.6,3.3,-1.3],[3,21,-6,3.2,3,4.1,-1.6],[3,12,-2,3,3,2.9,1.4],
    [4,10,19,3.5,3.5,3.3,3.1],[4,0,22,3.5,3,2.7,2.9],[4,2,9,3,3.2,3.1,1.8],
    [5,-18,13,3.6,3.6,3.2,2.8],[5,-11,22,3.4,3,2.6,3.3],[5,-6,8,3,3,3.4,2.7],
    [6,-23,1,2.8,3,3.1,1.4],[6,-21,-10,3,3.5,2.9,1.6],[6,-12,-4,2.8,3,3.2,1.8],
  ];
  homes.forEach(([id,x,z,width,depth,height,yaw], index) => {
    const group = new THREE.Group(); group.position.set(x,0,z); group.rotation.y = yaw; scene.add(group);
    const wall = mesh(new THREE.BoxGeometry(width,height,depth), districtMaterial(id, index % 2 ? '#d0c3ad' : '#ded6bd'), group);
    wall.position.y = height / 2;
    const roof = roofOn(group,width,depth,height,districtMaterial(id,index % 3 ? '#6b7b74' : '#807463', '#8a9590'));
    const door = mesh(new THREE.BoxGeometry(0.8,1.8,0.1),districtMaterial(id,'#836a50','#76827d'),group);
    door.position.set(0,0.9,depth/2+0.04);
    const window = mesh(new THREE.BoxGeometry(0.65,0.8,0.1),districtMaterial(id,'#e3c48c','#bdc5bc'),group);
    window.position.set(width*0.3,height*0.65,depth/2+0.05);
    scene.updateMatrixWorld(true);
    obstacles.push(new THREE.Box3().setFromObject(wall).expandByScalar(0.42)); collisionMeshes.push(wall,roof);
  });
  // Sparse scenery stays outside the walking routes.
  for (let i = 0; i < 18; i++) {
    const angle = (i + 0.4) * Math.PI * 2 / 18;
    const radius = coastlineRadius(angle) - 1.7 + Math.sin(i * 7) * 0.4;
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.17, 1.5, 7), mat('#7d8974'));
    trunk.position.set(Math.sin(angle) * radius, 0.75, Math.cos(angle) * radius);
    const crown = mesh(new THREE.IcosahedronGeometry(0.9 + (i % 3) * 0.2, 1), mat(i % 2 ? '#8dA68c' : '#79998c'));
    crown.position.copy(trunk.position).add(new THREE.Vector3(0, 1.2, 0));
  }
  const player = new THREE.Group(); scene.add(player); player.position.set(0, characterGroundHeight(0, 3, walkableHeight), 3);
  const body = mesh(new THREE.CapsuleGeometry(0.29, 0.6, 5, 10), mat('#385b60'), player); body.position.y = 1;
  const head = mesh(new THREE.SphereGeometry(0.23, 16, 12), mat('#e6ceb0'), player); head.position.y = 1.73;
  const hair = mesh(new THREE.SphereGeometry(0.235, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.53), mat('#434c48'), player); hair.position.y = 1.79;
  const legs: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const leg = mesh(new THREE.CapsuleGeometry(0.11, 0.44, 4, 8), mat('#4e5754'), player);
    leg.position.set(side * 0.16, 0.35, 0); legs.push(leg);
    const arm = mesh(new THREE.CapsuleGeometry(0.09, 0.46, 4, 8), mat('#75958b'), player);
    arm.position.set(side * 0.4, 1.04, 0);
  }
  let mode: 'overview' | 'explore' = 'overview';
  let yaw = 0, pitch = 0.24;
  let nearby: Building | undefined;
  let toastUntil = 0;
  let elapsed = 0;
  const overviewPosition = camera.position.clone();
  const overviewTarget = controls.target.clone();
  const keys = new Set<string>();
  const ray = new THREE.Raycaster();
  const focus = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const direction = new THREE.Vector3();
  function notify(message: string) { toast.textContent = message; toast.hidden = false; toastUntil = elapsed + 4; }
  for (const chapter of [1, 2, 3]) {
    const state = chapterState(chapter);
    const button = document.createElement('button');
    button.className = 'chapter-entry';
    button.disabled = state === 'locked';
    const title = chapter === 1 ? '童年冒险' : chapter === 2 ? '学生时代 · 骑楼街逃课' : '第三关 · 待闯关';
    const stateCopy = state === 'locked'
      ? '完成上一段记忆后解锁'
      : state === 'completed'
        ? '记忆已点亮 · 可以再次进入'
        : chapter === 2
          ? '第二关已解锁 · 点击进入'
          : chapter === 3
            ? '第三关已解锁 · 等待闯关'
            : '第一关已解锁 · 点击进入';
    button.innerHTML = `<span>${String(chapter).padStart(2, '0')}</span><span><b>${title}</b><small>${stateCopy}</small></span>`;
    button.addEventListener('click', () => {
      if (chapter !== 3) { options.onChapter(chapter); return; }
      notify('第三关：未完待续');
      window.setTimeout(() => {
        if (signal.aborted) return;
        nearbyPanel.hidden = false;
        nearbyPanel.querySelector('p')!.textContent = '是否查看后续关卡预告？';
        interactButton.textContent = '查看后续关卡预告';
        interactButton.onclick = () => options.onChapter(3);
      }, 650);
    }, { signal });
    chapterList.append(button);
  }
  function setMode(next: typeof mode) {
    keys.clear();
    (document.activeElement as HTMLElement | null)?.blur();
    if (next === 'explore') {
      overviewPosition.copy(camera.position); overviewTarget.copy(controls.target);
      controls.enabled = false;
    } else {
      camera.position.copy(overviewPosition); controls.target.copy(overviewTarget); controls.enabled = true; controls.update();
    }
    mode = next; nearby = undefined; nearbyPanel.hidden = true;
    chapterPicker.hidden = mode !== 'overview';
    get('[data-mode]').textContent = mode === 'overview' ? '岛屿总览' : '第三人称探索';
    instruction.textContent = mode === 'overview' ? '拖动画面旋转 · 滚轮缩放。进入岛屿后，在建筑之间走走。' : 'W A S D 移动 · 按住鼠标拖动转视角 · Shift 奔跑 · E 进入建筑';
    switchButton.textContent = mode === 'overview' ? '进入岛屿' : '查看岛屿';
    for (const label of labels) label.visible = mode === 'overview';
    if (mode === 'explore') updateCamera(1);
  }
  function interact() {
    if (mode !== 'explore' || !nearby) return;
    if (chapterState(nearby.id) === 'locked') { notify('先找回前一段记忆，再来这里。'); return; }
    if (nearby.id <= 2) options.onChapter(nearby.id);
    else notify(`第 ${nearby.id} 关入口已预留，冒险与房间内容尚未制作。`);
  }
  let album: AlbumHandle | undefined;
  get('[data-album]').addEventListener('click', () => {
    if (album) return;
    album = showAlbumUI({ completed: completedChapters(), onClose: () => { album = undefined; } });
  }, { signal });
  get('[data-home]').addEventListener('click', options.onHome, { signal });
  switchButton.addEventListener('click', () => setMode(mode === 'overview' ? 'explore' : 'overview'), { signal });
  interactButton.addEventListener('click', interact, { signal });
  window.addEventListener('keydown', event => {
    if (mode !== 'explore' || (event.target instanceof HTMLElement && event.target.closest('button,input,textarea'))) return;
    if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','KeyE'].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.code === 'KeyE' && !event.repeat) interact();
  }, { signal });
  window.addEventListener('keyup', event => keys.delete(event.code), { signal });
  window.addEventListener('blur', () => keys.clear(), { signal });
  let dragging: number | undefined;
  let lastX = 0, lastY = 0;
  renderer.domElement.addEventListener('pointerdown', event => {
    if (mode !== 'explore' || event.button !== 0) return;
    dragging = event.pointerId; lastX = event.clientX; lastY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
    (document.activeElement as HTMLElement | null)?.blur();
  }, { signal });
  renderer.domElement.addEventListener('pointermove', event => {
    if (mode !== 'explore' || dragging !== event.pointerId) return;
    yaw -= (event.clientX - lastX) * 0.005;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - lastY) * 0.004, -0.08, 0.8);
    lastX = event.clientX; lastY = event.clientY;
  }, { signal });
  renderer.domElement.addEventListener('lostpointercapture', () => { dragging = undefined; }, { signal });
  renderer.domElement.addEventListener('pointerup', () => { dragging = undefined; }, { signal });
  const allowed = (x: number, z: number) => Math.hypot(x, z) < coastlineRadius(Math.atan2(x, z)) - 0.8 && !obstacles.some(box => x > box.min.x && x < box.max.x && z > box.min.z && z < box.max.z);
  function updateCamera(blend: number) {
    focus.copy(player.position).add(new THREE.Vector3(0, 1.55, 0));
    desired.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(5.6).add(focus);
    direction.copy(desired).sub(focus).normalize(); ray.set(focus, direction); ray.far = 5.6;
    const hit = ray.intersectObjects(collisionMeshes, false)[0];
    if (hit) desired.copy(focus).addScaledVector(direction, Math.max(0.45, hit.distance - 0.3));
    desired.y = Math.max(desired.y, 0.35);
    camera.position.lerp(desired, blend); camera.lookAt(focus);
  }
  get('[data-progress]').textContent = `${completedChapters().length} / 6 段记忆已点亮 · 灰色建筑等待找回`;
  setMode('overview');
  if (options.justCompleted) {
    if (options.completionSaved === false) {
      notify(`第 ${options.justCompleted} 段记忆已点亮，但浏览器无法保存；刷新后可能需要重新完成。`);
    } else {
      notify(options.justCompleted === 1
        ? '第一段记忆回来了。童年的街区正在恢复颜色。'
        : `第 ${options.justCompleted} 段记忆回来了。新的街区正在恢复颜色。`);
    }
  }
  const resize = () => { const { width, height } = root.getBoundingClientRect(); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); renderer.setSize(width, height); };
  window.addEventListener('resize', resize, { signal }); resize();
  let frame = 0, last = performance.now(), disposed = false;
  function tick(now: number) {
    if (disposed) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now; elapsed += dt;
    if (mode === 'overview') controls.update();
    else {
      let x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      let z = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
      const length = Math.hypot(x, z);
      if (length) {
        x /= length; z /= length;
        const dx = x * Math.cos(yaw) + z * Math.sin(yaw), dz = -x * Math.sin(yaw) + z * Math.cos(yaw);
        const step = dt * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.5 : 3.2);
        if (allowed(player.position.x + dx * step, player.position.z)) player.position.x += dx * step;
        if (allowed(player.position.x, player.position.z + dz * step)) player.position.z += dz * step;
        player.position.y = characterGroundHeight(player.position.x, player.position.z, walkableHeight);
        player.rotation.y = Math.atan2(dx, dz);
      }
      legs.forEach((leg, index) => { leg.rotation.x = length ? Math.sin(elapsed * 11 + index * Math.PI) * 0.5 : 0; });
      updateCamera(1 - Math.exp(-12 * dt));
      nearby = buildings.find(b => b.door.distanceTo(player.position) < 2.8);
      nearbyPanel.hidden = !nearby;
      if (nearby) {
        const state = chapterState(nearby.id);
        nearbyPanel.querySelector('p')!.textContent = `第 ${nearby.id} 段记忆 · ${state === 'completed' ? '已点亮' : state === 'available' ? '等待探索' : '尚未解锁'}`;
        interactButton.textContent = state === 'locked'
          ? '查看解锁条件'
          : nearby.id === 1
            ? 'E · 进入童年冒险'
            : nearby.id === 2
              ? 'E · 进入学生时代冒险'
              : 'E · 查看下一段旅程';
      }
    }
    if (elapsed < 4) districtMaterials.filter(entry => entry.id === options.justCompleted).forEach(entry => entry.material.color.lerpColors(entry.gray, entry.color, Math.min(elapsed / 2.5, 1)));
    if (elapsed > toastUntil) toast.hidden = true;
    renderer.render(scene, camera); frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => {
    disposed = true; cancelAnimationFrame(frame); abort.abort(); controls.dispose(); keys.clear();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m)); }
      if (object instanceof THREE.Sprite) materials.add(object.material);
    });
    geometries.forEach(g => g.dispose());
    materials.forEach(m => { if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose(); m.dispose(); });
    renderer.dispose(); renderer.forceContextLoss(); root.remove();
  };
}
