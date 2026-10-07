import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { chapterState, completedChapters } from './Progress';
import { showAlbumUI, type AlbumHandle } from '../ui/AlbumUI';
import { buildingGroundFill, foundationTerrainHeight, groundIslandBuilding, type BuildingFoundation } from './buildingGrounding';

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
    .memory-island .sky-haze{position:absolute;inset:0 0 auto;height:27vh;pointer-events:none;background:radial-gradient(ellipse 12% 19% at 72% 20%,rgba(255,255,255,.68),rgba(255,255,255,.28) 48%,transparent 100%),radial-gradient(ellipse 10% 15% at 83% 14%,rgba(255,255,255,.55),rgba(255,255,255,.18) 55%,transparent 100%),radial-gradient(ellipse 9% 13% at 58% 17%,rgba(255,255,255,.48),transparent 100%),radial-gradient(circle at 92% 20%,rgba(255,239,192,.3),transparent 8%);opacity:.32}
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
    .memory-island .asset-status{position:absolute;left:28px;top:157px;color:#49645f;font-size:11px;letter-spacing:.03em}
    .memory-island.is-art-preview .chapter-picker,.memory-island.is-art-preview footer{display:none}
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
  </style><div class="hud"><div class="sky-haze" aria-hidden="true"></div><header><div><div class="eyebrow">SEEK / MEMORY ISLAND</div><h1>记忆之岛</h1><p class="subtitle">六段人生，慢慢找回。<br><span data-progress></span></p></div><button data-home>返回首页</button></header>
  <span class="asset-status" data-assets aria-live="polite"></span><aside class="chapter-picker panel" data-chapter-picker><strong>记忆入口</strong><div class="chapter-list" data-chapter-list></div></aside>
  <div class="toast" role="status" hidden></div><div class="nearby panel" hidden><p></p><button class="primary" data-interact></button></div>
  <footer><div class="panel"><strong data-mode>岛屿总览</strong><p class="instructions"></p></div><div class="actions"><button data-album>相册</button><button class="primary" data-switch>进入岛屿</button></div></footer></div>`;
  document.body.append(root);
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const switchButton = get<HTMLButtonElement>('[data-switch]');
  const assetStatus = get<HTMLElement>('[data-assets]');
  // Art-review mode reveals the source materials without changing chapter progress.
  const forceColorPreview = new URLSearchParams(window.location.search).get('artPreview') === 'color';
  root.classList.toggle('is-art-preview', forceColorPreview);
  let assetsSettled = 0;
  let assetsFailed = 0;
  const nearbyPanel = get<HTMLElement>('.nearby');
  const interactButton = get<HTMLButtonElement>('[data-interact]');
  const chapterPicker = get<HTMLElement>('[data-chapter-picker]');
  const chapterList = get<HTMLElement>('[data-chapter-list]');
  const instruction = get<HTMLElement>('.instructions');
  const toast = get<HTMLElement>('.toast');
  const abort = new AbortController();
  const signal = abort.signal;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#85bfd7');
  scene.fog = new THREE.Fog('#c4e0df', 54, 125);
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
  scene.add(camera);
  scene.add(new THREE.HemisphereLight('#efffff', '#718674', 2.4));
  const sun = new THREE.DirectionalLight('#fff1d3', 3);
  sun.position.set(-18, 30, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, far: 80 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], parent: THREE.Object3D = scene): THREE.Mesh {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  }
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 512;
  const skyContext = skyCanvas.getContext('2d')!;
  const skyGradient = skyContext.createLinearGradient(0, 0, 0, skyCanvas.height);
  skyGradient.addColorStop(0, '#5aa7cf'); skyGradient.addColorStop(0.32, '#80c3d7');
  skyGradient.addColorStop(0.57, '#a9d9d9'); skyGradient.addColorStop(0.79, '#c9e2d5');
  skyGradient.addColorStop(1, '#c4dfd7');
  skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
  const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace;
  const sky = mesh(new THREE.SphereGeometry(155, 48, 32), new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.castShadow = sky.receiveShadow = false;
  const waterCanvas = document.createElement('canvas'); waterCanvas.width = 256; waterCanvas.height = 256;
  const waterContext = waterCanvas.getContext('2d')!;
  waterContext.fillStyle = '#57b5d0'; waterContext.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 9; row++) for (let col = 0; col < 5; col++) {
    const x = col * 57 + (row % 2) * 17 + (row * 19 + col * 11) % 13;
    const y = row * 31 + (col * 7) % 12;
    waterContext.beginPath(); waterContext.ellipse(x, y, 13 + (col % 3) * 4, 1.5 + (row % 2), 0.08, 0, Math.PI * 2);
    waterContext.fillStyle = row % 3 ? 'rgba(201,244,236,0.43)' : 'rgba(28,143,181,0.28)'; waterContext.fill();
  }
  const waterTexture = new THREE.CanvasTexture(waterCanvas); waterTexture.colorSpace = THREE.SRGBColorSpace;
  waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping; waterTexture.repeat.set(34, 34);
  const seaGeometry = new THREE.PlaneGeometry(350, 350);
  const sea = mesh(seaGeometry, new THREE.MeshStandardMaterial({ map: waterTexture, color: '#b3edf0', roughness: 0.38, metalness: 0.025 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -1.24; sea.castShadow = false; sea.receiveShadow = false;
  // The same smooth shoreline drives the ground, beach, trees and walking limit.
  // Its minimum radius leaves the existing town and all six entrances on dry land.
  const coastlineRadius = (angle: number) => 29.7
    + 3.1 * Math.sin(2 * angle + 0.35)
    + 1.9 * Math.cos(3 * angle - 0.9)
    + 1.05 * Math.sin(5 * angle + 1.4);
  const hilltops = [
    { x: -15, z: 15, radius: 12, height: 1.8 },
    { x: -15, z: -10, radius: 11, height: 2.2 },
    { x: -1, z: -5, radius: 12, height: 1.9 },
    { x: 14, z: 0, radius: 12, height: 2.7 },
    { x: 20, z: 14, radius: 11, height: 2.2 },
    { x: 9, z: -19, radius: 12, height: 3.3 },
  ];
  const clamp01 = (value: number) => THREE.MathUtils.clamp(value, 0, 1);
  const ease = (value: number) => value * value * (3 - 2 * value);
  const buildingFoundations: BuildingFoundation[] = [];
  const groundedScenery: { object: THREE.Object3D; x: number; z: number; offset: number }[] = [];
  function keepSceneryGrounded(object: THREE.Object3D, x: number, z: number) {
    groundedScenery.push({ object, x, z, offset: object.position.y - terrainHeight(x, z) });
  }
  function naturalTerrainHeight(x: number, z: number) {
    const radius = Math.hypot(x, z);
    const angle = Math.atan2(x, z);
    const edgeDistance = Math.max(0, coastlineRadius(angle) - 0.45 - radius);
    const edgeFade = ease(clamp01(edgeDistance / 3.6));
    let height = 0.35 + 0.7 * (1 - ease(clamp01(radius / 29)));
    for (const hill of hilltops) {
      const dx = (x - hill.x) * 0.92;
      const dz = (z - hill.z) * 1.08;
      const distance = Math.hypot(dx, dz);
      const terrace = ease(clamp01((hill.radius - distance) / (hill.radius * 0.48)));
      height = Math.max(height, 0.35 + hill.height * terrace);
    }
    const broadRoll = (Math.sin(x * 0.24 + z * 0.12) + Math.cos(z * 0.22 - x * 0.11)) * 0.11;
    return Math.max(0, (height + broadRoll) * edgeFade);
  }
  function terrainHeight(x: number, z: number) {
    const natural = naturalTerrainHeight(x, z);
    const supported = foundationTerrainHeight(x, z, natural, buildingFoundations);
    // Preserve the original shoreline junction at the outermost terrain ring.
    const edgeDistance = coastlineRadius(Math.atan2(x, z)) - 0.45 - Math.hypot(x, z);
    return THREE.MathUtils.lerp(natural, supported, ease(clamp01(edgeDistance / 0.3)));
  }
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
  const shore = mesh(islandGeometry(28.4, 27.5, 1.8), mat('#ddcda8'));
  shore.position.y = -1;
  const meadowCanvas = document.createElement('canvas'); meadowCanvas.width = 512; meadowCanvas.height = 512;
  const meadowContext = meadowCanvas.getContext('2d')!;
  meadowContext.fillStyle = '#b9cda7'; meadowContext.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 180; i++) {
    const x = (i * 173 + 31) % 512, y = (i * 271 + 97) % 512;
    meadowContext.beginPath(); meadowContext.ellipse(x, y, 8 + (i % 7) * 3, 5 + (i % 5) * 2, (i % 9) * 0.2, 0, Math.PI * 2);
    meadowContext.fillStyle = ['rgba(230,217,167,0.15)','rgba(114,158,126,0.18)','rgba(247,232,190,0.2)'][i % 3]; meadowContext.fill();
  }
  const meadowTexture = new THREE.CanvasTexture(meadowCanvas); meadowTexture.colorSpace = THREE.SRGBColorSpace;
  const terrainSegments = 192, terrainRings = 64;
  const terrainVertices: number[] = [], terrainColors: number[] = [], terrainUvs: number[] = [], terrainIndices: number[] = [];
  const lowland = new THREE.Color('#c0d39f'), hillside = new THREE.Color('#9eb98c'), highland = new THREE.Color('#849c83');
  for (let ring = 0; ring <= terrainRings; ring++) for (let segment = 0; segment <= terrainSegments; segment++) {
    const angle = segment / terrainSegments * Math.PI * 2;
    const radius = (coastlineRadius(angle) - 0.45) * ring / terrainRings;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const y = terrainHeight(x, z);
    terrainVertices.push(x, y, z);
    terrainUvs.push(x / 34 + 0.5, z / 34 + 0.5);
    const color = lowland.clone().lerp(hillside, clamp01(y / 2.1));
    if (y > 1.45) color.lerp(highland, clamp01((y - 1.45) / 1.8) * 0.72);
    terrainColors.push(color.r, color.g, color.b);
    if (ring < terrainRings && segment < terrainSegments) {
      const a = ring * (terrainSegments + 1) + segment;
      const b = (ring + 1) * (terrainSegments + 1) + segment;
      const c = b + 1, d = a + 1;
      terrainIndices.push(a, b, c, a, c, d);
    }
  }
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(terrainVertices, 3));
  terrainGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(terrainVertices.length), 3));
  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
  terrainGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(terrainUvs, 2));
  terrainGeometry.setIndex(terrainIndices); terrainGeometry.computeVertexNormals(); terrainGeometry.computeBoundingSphere();
  const land = mesh(terrainGeometry, new THREE.MeshStandardMaterial({ map: meadowTexture, vertexColors: true, roughness: 1 }));
  function refreshBuildingTerrain() {
    const positions = terrainGeometry.getAttribute('position');
    const colors = terrainGeometry.getAttribute('color');
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const y = terrainHeight(positions.getX(vertex), positions.getZ(vertex));
      positions.setY(vertex, y);
      const color = lowland.clone().lerp(hillside, clamp01(y / 2.1));
      if (y > 1.45) color.lerp(highland, clamp01((y - 1.45) / 1.8) * 0.72);
      colors.setXYZ(vertex, color.r, color.g, color.b);
    }
    positions.needsUpdate = colors.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    terrainGeometry.computeBoundingBox();
    terrainGeometry.computeBoundingSphere();
    for (const item of groundedScenery) {
      item.object.position.y = terrainHeight(item.x, item.z) + item.offset;
    }
  }
  const foamMaterial = new THREE.MeshBasicMaterial({ color: '#e7f6e9', transparent: true, opacity: 0.72, depthWrite: false });
  for (const [offset, y, radius] of [[1.75, -1.08, 0.09], [2.5, -1.12, 0.045]] as const) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 256; i++) {
      const angle = i * Math.PI * 2 / 256;
      const ripple = Math.sin(angle * 17 + offset) * 0.16 + Math.cos(angle * 29) * 0.09;
      const r = coastlineRadius(angle) + offset + ripple;
      points.push(new THREE.Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r));
    }
    const foamLine = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.12), 512, radius, 5, true), foamMaterial);
    foamLine.castShadow = foamLine.receiveShadow = false;
  }
  const cliffRockMaterials = ['#828f86', '#a09b86', '#75877f', '#aaa28c'].map(color => mat(color));
  for (let i = 0; i < 34; i++) {
    const angle = i * Math.PI * 2 / 34 + 0.07 + Math.sin(i * 4.1) * 0.07;
    const radius = coastlineRadius(angle) + 0.72 + Math.sin(i * 8.3) * 0.72;
    const rock = mesh(new THREE.IcosahedronGeometry(0.42 + (i % 5) * 0.15, 0), cliffRockMaterials[i % cliffRockMaterials.length]);
    rock.position.set(Math.sin(angle) * radius, -0.62 + (i % 3) * 0.08, Math.cos(angle) * radius);
    rock.scale.set(0.72 + (i % 3) * 0.13, 0.58 + (i % 4) * 0.08, 0.82 + (i % 2) * 0.18);
    rock.rotation.set((i % 3) * 0.18, angle + i * 0.24, (i % 4) * 0.11);
    rock.castShadow = rock.receiveShadow = false;
  }
  for (let i = 0; i < 8; i++) {
    const angle = 0.25 + i * Math.PI * 2 / 8 + Math.sin(i * 2.3) * 0.12;
    const radius = 47 + (i % 3) * 8;
    const scale = 1.4 + (i % 4) * 0.55;
    const islet = new THREE.Group();
    islet.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius); scene.add(islet);
    const rock = mesh(new THREE.CylinderGeometry(scale * 0.72, scale * 1.2, 1.65, 7, 1), mat('#8b9990'), islet);
    rock.position.y = -0.48; rock.rotation.y = angle;
    const sandCap = mesh(new THREE.CylinderGeometry(scale * 0.77, scale * 0.78, 0.18, 7), mat('#d2c7a5'), islet);
    sandCap.position.y = 0.38;
    const greenCap = mesh(new THREE.CylinderGeometry(scale * 0.56, scale * 0.62, 0.14, 7), mat('#9db798'), islet);
    greenCap.position.y = 0.53;
    rock.castShadow = rock.receiveShadow = false;
    sandCap.castShadow = sandCap.receiveShadow = false;
    greenCap.castShadow = greenCap.receiveShadow = false;
    for (let tuft = 0; tuft < 3; tuft++) {
      const shrub = mesh(new THREE.IcosahedronGeometry(0.45 + (tuft % 2) * 0.16, 1), mat(tuft === 1 ? '#a9bf91' : '#7fa18a'), islet);
      const a = tuft * Math.PI * 2 / 3;
      shrub.position.set(Math.sin(a) * scale * 0.35, 0.92, Math.cos(a) * scale * 0.35);
      shrub.castShadow = shrub.receiveShadow = false;
    }
  }
  // Low, broken reefs sit just beyond the beach, like the rocks in the concept map.
  for (let i = 0; i < 17; i++) {
    const angle = (i + 0.2) * Math.PI * 2 / 17 + Math.sin(i * 3.7) * 0.09;
    const radius = coastlineRadius(angle) + 4.1 + (i % 4) * 1.25;
    const size = 0.55 + (i % 5) * 0.22;
    const reef = mesh(new THREE.IcosahedronGeometry(size, 0), cliffRockMaterials[(i + 1) % cliffRockMaterials.length]);
    reef.position.set(Math.sin(angle) * radius, -0.74 + (i % 3) * 0.08, Math.cos(angle) * radius);
    reef.scale.set(1.25 + (i % 3) * 0.18, 0.62 + (i % 2) * 0.16, 0.9 + (i % 4) * 0.08);
    reef.rotation.set((i % 3) * 0.14, angle + i * 0.21, (i % 4) * 0.09);
    reef.castShadow = reef.receiveShadow = false;
  }
  const buildings: Building[] = [];
  const collisionMeshes: THREE.Object3D[] = [];
  const obstacles: THREE.Box3[] = [];
  const modelGrayUniforms: { id: number; uniform: { value: number } }[] = [];
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const modelPaths = [
    '/island-models/ch01-shell-house.glb',
    '/island-models/ch02-snack-shop.glb',
    '/island-models/ch03-dog-studio.glb',
    '/island-models/ch04-purple-treehouse.glb',
    '/island-models/ch05-beach-tent.glb',
    '/island-models/ch06-album-house.glb',
  ];
  const updateAssetStatus = () => { assetStatus.textContent = `3D 模型 ${assetsSettled}/${modelPaths.length + 5} 已载入${forceColorPreview ? ' · 彩色美术预览' : ''}${assetsFailed ? ` · ${assetsFailed} 个失败` : ''}`; };
  const districtMaterials: { id: number; material: THREE.MeshStandardMaterial; color: THREE.Color; gray: THREE.Color }[] = [];
  function districtMaterial(id: number, color: string, gray = '#a4adaa') {
    const material = mat(chapterState(id) === 'completed' && options.justCompleted !== id ? color : gray);
    districtMaterials.push({ id, material, color: new THREE.Color(color), gray: new THREE.Color(gray) });
    return material;
  }
  // Coordinates follow the supplied island plan from the overview camera:
  // shell in the open foreground, snack bag upper left, studio in the back center,
  // album at the far end, treehouse to the right, and tent at the near right.
  const sites = [
    { x: 2, z: 13, yaw: Math.PI / 3, width: 7.2, depth: 5.8, height: 4.8 },
    { x: -15, z: -10, yaw: 0, width: 6.4, depth: 5.1, height: 6.2 },
    { x: -1, z: -5, yaw: 0, width: 6.5, depth: 5.6, height: 5.4 },
    { x: 14, z: 0, yaw: -Math.PI / 2, width: 6.2, depth: 5.6, height: 7.4 },
    { x: 20, z: 14, yaw: Math.PI, width: 7, depth: 6.1, height: 4.5 },
    { x: 9, z: -19, yaw: 0, width: 8.1, depth: 6.5, height: 8 },
  ];
  // A short pier and landing mark the island entrance in the foreground left.
  const dock = new THREE.Group(); dock.position.set(-17, terrainHeight(-17, 15) - 0.05, 15); dock.rotation.y = -0.48; scene.add(dock);
  const dockDeck = mesh(new THREE.BoxGeometry(4.5, 0.2, 8.2), mat('#9a7353'), dock); dockDeck.position.set(0, 0.16, 2.3);
  for (let i = 0; i < 10; i++) {
    const plank = mesh(new THREE.BoxGeometry(4.35, 0.055, 0.68), mat(i % 2 ? '#bd9670' : '#a9825d'), dock);
    plank.position.set(0, 0.29, -1.15 + i * 0.75);
  }
  for (const x of [-1.8, 1.8]) for (const z of [-0.8, 5.2]) {
    const post = mesh(new THREE.CylinderGeometry(0.13, 0.17, 1.5, 7), mat('#80664d'), dock);
    post.position.set(x, -0.34, z);
  }
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
    const center = new THREE.Vector3(site.x, terrainHeight(site.x, site.z), site.z);
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
    // Keep the simple windows as ambient details around GLB assets, but hide the
    // blockout building once its generated replacement has loaded.
    for (const child of [...group.children]) if (child instanceof THREE.Mesh && child !== walls && child !== roof && child !== door) {
      child.userData.isBlockout = true;
    }
    walls.userData.isBlockout = true;
    roof.userData.isBlockout = true;
    door.userData.isBlockout = true;
    gltfLoader.load(modelPaths[i], gltf => {
      if (signal.aborted) { disposeGltf(gltf.scene); return; }
      const model = gltf.scene;
      const rawBounds = new THREE.Box3().setFromObject(model);
      const rawSize = rawBounds.getSize(new THREE.Vector3());
      const targetHeight = height * (id === 4 || id === 6 ? 1.2 : 1.05);
      const scale = targetHeight / Math.max(rawSize.y, rawSize.x * 0.55, 0.001);
      model.scale.setScalar(scale);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      model.position.x -= (bounds.min.x + bounds.max.x) / 2;
      model.position.y -= bounds.min.y;
      model.position.z -= (bounds.min.z + bounds.max.z) / 2;
      // The shell's authored entrance faces +X. Align it with the group's +Z
      // entrance so the visible doorway and interaction point turn together.
      model.rotation.y = id === 1 ? -Math.PI / 2 : Math.PI;
      if (id === 1) {
        model.updateMatrixWorld(true);
        const rotatedCenter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
        model.position.x -= rotatedCenter.x;
        model.position.z -= rotatedCenter.z;
      }
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const originals = Array.isArray(object.material) ? object.material : [object.material];
        const cloned = originals.map(original => {
          const material = original.clone();
          if (material instanceof THREE.MeshStandardMaterial) {
            const grayUniform = { value: forceColorPreview || (chapterState(id) === 'completed' && options.justCompleted !== id) ? 0 : 1 };
            material.onBeforeCompile = shader => {
              shader.uniforms.uIslandGray = grayUniform;
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                '#include <common>\nuniform float uIslandGray;',
              );
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                '#include <color_fragment>\nfloat islandLuminance = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(islandLuminance), uIslandGray);',
              );
            };
            material.customProgramCacheKey = () => 'memory-island-grayscale-v1';
            modelGrayUniforms.push({ id, uniform: grayUniform });
          }
          return material;
        });
        object.material = Array.isArray(object.material) ? cloned : cloned[0];
      });
      group.add(model);
      const foundation = groundIslandBuilding(model, naturalTerrainHeight);
      buildingFoundations.push(foundation);
      refreshBuildingTerrain();
      // These two assets have raised root/step undersides in the reported views.
      const fillGeometry = id === 4 || id === 6 ? buildingGroundFill(model, terrainHeight) : null;
      if (fillGeometry) {
        const positions = fillGeometry.getAttribute('position');
        const colors: number[] = [], uvs: number[] = [];
        for (let vertex = 0; vertex < positions.count; vertex++) {
          const y = positions.getY(vertex);
          const color = lowland.clone().lerp(hillside, clamp01(y / 2.1));
          if (y > 1.45) color.lerp(highland, clamp01((y - 1.45) / 1.8) * 0.72);
          colors.push(color.r, color.g, color.b);
          uvs.push(positions.getX(vertex) / 34 + 0.5, positions.getZ(vertex) / 34 + 0.5);
        }
        fillGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        fillGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        const grassMaterial = Array.isArray(land.material) ? land.material[0] : land.material;
        const soil = mesh(fillGeometry, grassMaterial.clone());
        soil.receiveShadow = true;
        collisionMeshes.push(soil);
      }
      doorPosition.y = terrainHeight(doorPosition.x, doorPosition.z);
      labels[i].position.y = foundation.height + height + 2.8;
      walls.visible = roof.visible = door.visible = false;
      group.children.filter(child => child.userData.isBlockout).forEach(child => { child.visible = false; });
      collisionMeshes.push(model);
      box.setFromObject(model).expandByScalar(0.2);
      for (const blockout of [walls, roof]) {
        const index = collisionMeshes.indexOf(blockout);
        if (index !== -1) collisionMeshes.splice(index, 1);
      }
      console.info(`[MemoryIsland] Loaded chapter ${id} Tripo model`, { size: size.toArray(), scale });
      assetsSettled++; updateAssetStatus();
    }, undefined, error => { assetsSettled++; assetsFailed++; updateAssetStatus(); console.error(`[MemoryIsland] Could not load chapter ${id} model`, error); });
    const doorPosition = center.clone().addScaledVector(toCenter, site.depth / 2 + 1.5);
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
  // Six concept buildings are the focal points; keep the gray blockout homes
  // out of this review scene so they do not mask the generated assets.
  // Sparse scenery frames the coastline.
  for (let i = 0; i < 18; i++) {
    const angle = (i + 0.4) * Math.PI * 2 / 18;
    const radius = coastlineRadius(angle) - 2.15 + Math.sin(i * 7) * 0.45;
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.17, 1.5, 7), mat('#7d8974'));
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    trunk.position.set(x, terrainHeight(x, z) + 0.75, z);
    keepSceneryGrounded(trunk, x, z);
    trunk.castShadow = trunk.receiveShadow = false;
    const blossomTree = angle > 0.75 && angle < 1.65;
    for (let leaf = 0; leaf < 3; leaf++) {
      const crown = mesh(new THREE.IcosahedronGeometry(0.72 + ((i + leaf) % 3) * 0.12, 1), mat(blossomTree ? (leaf % 2 ? '#e7a9c5' : '#f0bad0') : (leaf % 2 ? '#8eaa89' : '#769989')));
      const a = leaf * Math.PI * 2 / 3;
      crown.position.copy(trunk.position).add(new THREE.Vector3(Math.sin(a) * 0.48, 1.1 + (leaf % 2) * 0.32, Math.cos(a) * 0.48));
      keepSceneryGrounded(crown, x, z);
      crown.scale.set(1.08, 0.86 + (leaf % 2) * 0.12, 0.98);
      crown.castShadow = crown.receiveShadow = false;
    }
  }
  // A denser pink grove frames the fourth memory house while leaving the path open.
  for (const [x, z, tint] of [[11, -3, '#e7a9c5'], [17, -3, '#f0bad0'], [18, 3, '#e7a9c5'], [10, 3, '#f4c7d7']] as const) {
    const trunk = mesh(new THREE.CylinderGeometry(0.13, 0.19, 1.8, 7), mat('#806d62'));
    trunk.position.set(x, terrainHeight(x, z) + 0.9, z);
    keepSceneryGrounded(trunk, x, z);
    for (let leaf = 0; leaf < 4; leaf++) {
      const crown = mesh(new THREE.IcosahedronGeometry(0.9 + (leaf % 2) * 0.14, 1), mat(tint));
      crown.position.set(x + Math.sin(leaf * Math.PI / 2) * 0.55, terrainHeight(x, z) + 1.75 + (leaf % 2) * 0.34, z + Math.cos(leaf * Math.PI / 2) * 0.55);
      keepSceneryGrounded(crown, x, z);
      crown.scale.set(1.1, 0.9, 1);
    }
  }
  const player = new THREE.Group(); scene.add(player); player.position.set(0, terrainHeight(0, 3), 3);
  const blockoutPlayer = new THREE.Group(); player.add(blockoutPlayer);
  const body = mesh(new THREE.CapsuleGeometry(0.29, 0.6, 5, 10), mat('#385b60'), blockoutPlayer); body.position.y = 1;
  const head = mesh(new THREE.SphereGeometry(0.23, 16, 12), mat('#e6ceb0'), blockoutPlayer); head.position.y = 1.73;
  const hair = mesh(new THREE.SphereGeometry(0.235, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.53), mat('#434c48'), blockoutPlayer); hair.position.y = 1.79;
  const legs: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const leg = mesh(new THREE.CapsuleGeometry(0.11, 0.44, 4, 8), mat('#4e5754'), blockoutPlayer);
    leg.position.set(side * 0.16, 0.35, 0); legs.push(leg);
    const arm = mesh(new THREE.CapsuleGeometry(0.09, 0.46, 4, 8), mat('#75958b'), blockoutPlayer);
    arm.position.set(side * 0.4, 1.04, 0);
  }
  const characterAnimationPaths = {
    idle: '/island-models/character-han-meimei-v3-idle.glb',
    walk: '/island-models/character-han-meimei-v3-walk.glb',
    run: '/island-models/character-han-meimei-v3-run.glb',
    jump: '/island-models/character-han-meimei-v3-jump.glb',
  } as const;
  type CharacterMotion = keyof typeof characterAnimationPaths;
  const characterActions = new Map<CharacterMotion, THREE.AnimationAction>();
  const pendingCharacterClips = new Map<CharacterMotion, THREE.AnimationClip>();
  let characterMixer: THREE.AnimationMixer | undefined;
  let activeCharacterAction: THREE.AnimationAction | undefined;
  let characterMotion: CharacterMotion = 'idle';
  let jumpPlaying = false;
  let jumpUntil = 0;
  function setCharacterMotion(next: CharacterMotion) {
    characterMotion = next;
    if (jumpPlaying) return;
    const action = characterActions.get(next);
    if (!action || action === activeCharacterAction) return;
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.18).play();
    activeCharacterAction?.fadeOut(0.18);
    activeCharacterAction = action;
  }
  function registerCharacterClip(name: CharacterMotion, clip: THREE.AnimationClip) {
    if (!characterMixer) { pendingCharacterClips.set(name, clip); return; }
    const action = characterMixer.clipAction(clip);
    characterActions.set(name, action);
    if (name === characterMotion) setCharacterMotion(characterMotion);
  }
  gltfLoader.load('/island-models/character-han-meimei-v3.glb', gltf => {
    if (signal.aborted) { disposeGltf(gltf.scene); return; }
    const model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    model.scale.setScalar(2.05 / Math.max(size.y, size.x * 0.9, size.z * 0.9, 0.001));
    model.updateMatrixWorld(true);
    const scaledBounds = new THREE.Box3().setFromObject(model);
    model.position.set(-(scaledBounds.min.x + scaledBounds.max.x) / 2, -scaledBounds.min.y, -(scaledBounds.min.z + scaledBounds.max.z) / 2);
    model.rotation.y = -Math.PI / 2;
    model.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    player.add(model);
    characterMixer = new THREE.AnimationMixer(model);
    pendingCharacterClips.forEach((clip, name) => registerCharacterClip(name, clip));
    setCharacterMotion(characterMotion);
    blockoutPlayer.visible = false;
    console.info('[MemoryIsland] Loaded Han Meimei H3.1 character model', { size: size.toArray() });
    assetsSettled++; updateAssetStatus();
  }, undefined, error => { assetsSettled++; assetsFailed++; updateAssetStatus(); console.error('[MemoryIsland] Could not load Han Meimei character model', error); });
  for (const name of ['idle', 'walk', 'run', 'jump'] as const) {
    gltfLoader.load(characterAnimationPaths[name], gltf => {
      if (signal.aborted) { disposeGltf(gltf.scene); return; }
      const clip = gltf.animations.find(animation => animation.name.toLowerCase() === name) ?? gltf.animations[0];
      if (clip) registerCharacterClip(name, clip);
      else { assetsFailed++; console.error(`[MemoryIsland] Missing ${name} animation clip`); }
      disposeGltf(gltf.scene);
      assetsSettled++; updateAssetStatus();
    }, undefined, error => { assetsSettled++; assetsFailed++; updateAssetStatus(); console.error(`[MemoryIsland] Could not load ${name} animation`, error); });
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
  const followFocus = new THREE.Vector3();
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
    instruction.textContent = mode === 'overview' ? '拖动画面旋转 · 滚轮缩放。进入岛屿后，在建筑之间走走。' : 'W A S D 移动 · 空格跳跃 · 按住鼠标拖动转视角 · Shift 奔跑 · E 进入建筑';
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
    if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','KeyE','Space'].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.code === 'Space' && !event.repeat) {
      const jump = characterActions.get('jump');
      if (jump && characterMixer && !jumpPlaying) {
        jumpPlaying = true;
        jumpUntil = elapsed + jump.getClip().duration;
        activeCharacterAction?.fadeOut(0.12);
        jump.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.12).play();
        jump.clampWhenFinished = true;
        activeCharacterAction = jump;
      }
    }
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
    const hit = ray.intersectObjects(collisionMeshes, true)[0];
    if (hit) desired.copy(focus).addScaledVector(direction, Math.max(0.45, hit.distance - 0.3));
    desired.y = Math.max(desired.y, 0.35);
    camera.position.lerp(desired, blend);
    followFocus.lerp(focus, blend);
    camera.lookAt(followFocus);
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
    characterMixer?.update(dt);
    if (jumpPlaying && elapsed >= jumpUntil) {
      jumpPlaying = false;
      setCharacterMotion(characterMotion);
    }
    waterTexture.offset.set(elapsed * 0.003, elapsed * 0.0018);
    player.position.y = terrainHeight(player.position.x, player.position.z);
    if (mode === 'overview') controls.update();
    else {
      let x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      let z = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
      const length = Math.hypot(x, z);
      const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
      setCharacterMotion(length ? running ? 'run' : 'walk' : 'idle');
      if (length) {
        x /= length; z /= length;
        const dx = x * Math.cos(yaw) + z * Math.sin(yaw), dz = -x * Math.sin(yaw) + z * Math.cos(yaw);
        const step = dt * (running ? 5.5 : 3.2);
        if (allowed(player.position.x + dx * step, player.position.z)) player.position.x += dx * step;
        if (allowed(player.position.x, player.position.z + dz * step)) player.position.z += dz * step;
        player.rotation.y = Math.atan2(dx, dz);
      }
      player.position.y = terrainHeight(player.position.x, player.position.z);
      legs.forEach((leg, index) => { leg.rotation.x = length ? Math.sin(elapsed * 11 + index * Math.PI) * 0.5 : 0; });
      // Dampen both camera position and aim so the third-person view trails the player smoothly.
      updateCamera(1 - Math.exp(-8 * dt));
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
    modelGrayUniforms.forEach(({ id, uniform }) => {
      const target = forceColorPreview || chapterState(id) === 'completed' ? 0 : 1;
      uniform.value = id === options.justCompleted && elapsed < 4 ? 1 - Math.min(elapsed / 2.5, 1) : target;
    });
    if (elapsed > toastUntil) toast.hidden = true;
    renderer.render(scene, camera); frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => {
    disposed = true; cancelAnimationFrame(frame); abort.abort(); controls.dispose(); keys.clear(); characterMixer?.stopAllAction();
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

function disposeGltf(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}
