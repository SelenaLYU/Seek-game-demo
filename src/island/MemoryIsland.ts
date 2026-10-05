import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { chapterState, completedChapters } from './Progress';
import { showAlbumUI, type AlbumHandle } from '../ui/AlbumUI';

type Options = { justCompleted?: number; completionSaved?: boolean; onHome: () => void; onChapter: (chapter: number) => void };
type Building = { id: number; door: THREE.Vector3; box: THREE.Box3; materials: THREE.MeshStandardMaterial[]; colors: THREE.Color[] };

/** Self-contained Three.js view. The returned cleanup also releases all GPU resources. */
export function mountMemoryIsland(options: Options): () => void {
  const root = document.createElement('section');
  root.className = 'memory-island';
  root.innerHTML = `<style>
    .memory-island{position:fixed;inset:0;z-index:1100;background:#080d2d;color:#eef2ff;font-family:system-ui,"Microsoft YaHei",sans-serif;overflow:hidden}
    .memory-island canvas{display:block;width:100%;height:100%;touch-action:none}
    .memory-island .hud{position:absolute;inset:0;pointer-events:none;padding:28px;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box}
    .memory-island header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .memory-island h1{font-family:serif;font-size:30px;font-weight:500;margin:4px 0 8px;letter-spacing:5px}
    .memory-island h1{color:#fff3d7;text-shadow:0 1px 4px #315575,0 1px 16px #4776a688}
    .memory-island .eyebrow{font-size:11px;letter-spacing:3px;color:#f2f8ff;text-shadow:0 1px 5px #265783,0 1px 13px #26578399}
    .memory-island .subtitle{font-size:13px;margin:0;line-height:1.8;color:#fff;text-shadow:0 1px 4px #24557d,0 0 12px #315f89}
    .memory-island button{pointer-events:auto;cursor:pointer;border:1px solid #56746c55;background:#f7f7efdd;color:#29463f;padding:12px 20px;border-radius:24px;font:inherit;font-size:14px;backdrop-filter:blur(10px)}
    .memory-island button:hover{background:#fff}.memory-island button:focus-visible{outline:3px solid #be8c49;outline-offset:3px}
    .memory-island button.primary{background:#2e574e;color:#fff;border-color:#2e574e}
    .memory-island footer{display:flex;align-items:end;justify-content:space-between;gap:20px}
    .memory-island .panel{background:#f7f8f0df;border:1px solid #ffffff99;border-radius:16px;padding:17px 22px;backdrop-filter:blur(10px);max-width:420px;box-shadow:0 5px 25px #294a3b0a}
    .memory-island .instructions{font-size:13px;line-height:1.9;margin:6px 0 0;color:#587068}
    .memory-island .actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .memory-island .chapter-picker{position:absolute;right:28px;top:112px;width:286px;pointer-events:auto}
    .memory-island .asset-status{position:absolute;left:28px;top:157px;color:#c7d6ff;font-size:11px;letter-spacing:.03em;text-shadow:0 1px 10px #081037}
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
  </style><div class="hud"><header><div><div class="eyebrow">SEEK / MEMORY ISLAND</div><h1>记忆之岛</h1><p class="subtitle">六段人生，慢慢找回。<br><span data-progress></span></p></div><button data-home>返回首页</button></header>
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
  // The supplied plan is a wide, horizontal island. Keep coordinates used by
  // terrain/path generation compact, and widen the assembled island uniformly.
  const mapScaleX = 1.34;
  const islandRoot = new THREE.Group();
  islandRoot.scale.x = mapScaleX;
  scene.add(islandRoot);
  scene.background = new THREE.Color('#91c8f4');
  scene.fog = null;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch (error) { root.remove(); throw error; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.prepend(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);
  camera.position.set(0, 55, 70);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -8);
  const overviewDirection = camera.position.clone().sub(controls.target).normalize();
  const overviewDistance = camera.position.distanceTo(controls.target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 27;
  controls.maxDistance = 180;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI / 2.45;
  controls.update();
  scene.add(camera);
  scene.add(new THREE.HemisphereLight('#dce6ff', '#35445f', 1.45));
  const sun = new THREE.DirectionalLight('#ffe4bd', 2.15);
  sun.position.set(-18, 30, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, far: 80 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], parent: THREE.Object3D = islandRoot): THREE.Mesh {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  }
  const atmosphereUniforms = { uTime: { value: 0 } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(800, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: atmosphereUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      vertexShader: `varying vec3 vDirection; void main(){ vDirection=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        varying vec3 vDirection;
        float hash31(vec3 p){
          p=fract(p*0.1031); p+=dot(p,p.yzx+33.33);
          return fract((p.x+p.y)*p.z);
        }
        float noise31(vec3 p){
          vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash31(i),hash31(i+vec3(1.0,0.0,0.0)),f.x),
                         mix(hash31(i+vec3(0.0,1.0,0.0)),hash31(i+vec3(1.0,1.0,0.0)),f.x),f.y),
                     mix(mix(hash31(i+vec3(0.0,0.0,1.0)),hash31(i+vec3(1.0,0.0,1.0)),f.x),
                         mix(hash31(i+vec3(0.0,1.0,1.0)),hash31(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z);
        }
        float cloudNoise(vec3 p){
          float sum=0.0, amplitude=0.5;
          for(int octave=0;octave<4;octave++){
            sum+=noise31(p)*amplitude;
            p=p*2.03+vec3(17.1,9.2,13.7);
            amplitude*=0.5;
          }
          return sum;
        }
        void main(){
          vec3 dir=normalize(vDirection);
          float altitude=dir.y;
          vec3 drift=vec3(uTime*0.004,0.0,-uTime*0.003);
          float broad=cloudNoise(dir*vec3(5.6,3.7,5.6)+drift);
          float detail=cloudNoise(dir*vec3(13.0,8.5,13.0)-drift*1.3);
          float cloudField=broad*0.88+detail*0.12;
          float cloudThreshold=mix(0.58,0.75,smoothstep(-0.1,0.85,altitude));
          float cloud=smoothstep(cloudThreshold-0.12,cloudThreshold+0.16,cloudField);

          vec3 skyBlue=mix(vec3(0.48,0.79,0.97),vec3(0.22,0.53,0.88),smoothstep(0.0,0.95,altitude));
          float horizonGlow=exp(-pow((altitude-0.035)/0.34,2.0));
          vec3 cloudWhite=mix(vec3(0.94,0.98,1.0),vec3(1.0,0.80,0.86),horizonGlow*0.44);
          cloudWhite=mix(cloudWhite,vec3(0.80,0.86,1.0),smoothstep(0.46,0.95,altitude)*0.24);
          float cloudLight=smoothstep(cloudThreshold+0.02,cloudThreshold+0.24,cloudField);
          cloudWhite=mix(cloudWhite,vec3(1.0,0.98,0.94),cloudLight*0.28);
          vec3 color=mix(skyBlue,cloudWhite,cloud);

          // Pearlescent cloud-sea bands carry the reference image's gentle
          // cyan and lavender flow without isolated stars or a space backdrop.
          float lowCloud=1.0-smoothstep(0.02,0.36,altitude);
          float current=sin((dir.x*3.2+dir.z*5.1+detail*2.8+uTime*0.006)*5.0);
          float shimmer=smoothstep(0.74,0.94,current+cloudField*0.32)*lowCloud;
          color=mix(color,vec3(0.56,0.88,0.98),shimmer*0.20);
          color+=horizonGlow*vec3(0.055,0.075,0.12);
          float sunGlow=1.0-smoothstep(0.0,0.95,length(dir-normalize(vec3(-0.38,0.62,0.72))));
          color+=sunGlow*vec3(0.14,0.13,0.12);
          gl_FragColor=vec4(color,1.0);
        }
      `,
    }),
  );
  sky.frustumCulled = false;
  sky.castShadow = sky.receiveShadow = false;
  scene.add(sky);
  const oceanUniforms = { uTime: { value: 0 } };
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.ShaderMaterial({
      uniforms: oceanUniforms,
      depthWrite: true,
      toneMapped: false,
      vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorldPosition=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }`,
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        varying vec3 vWorldPosition;
        float wave(vec2 p, float scale, float speed){
          return sin(p.x*scale + sin(p.y*scale*0.73 + uTime*speed)*0.75 + uTime*speed*0.58);
        }
        void main(){
          vec2 p=vWorldPosition.xz*0.012;
          float broad=wave(p,2.2,0.055)*0.5 + wave(p.yx+vec2(7.3,-4.1),1.45,0.04)*0.5;
          float fine=wave(p+vec2(3.1,8.7),4.2,0.075)*0.5 + wave(p.yx-vec2(9.4,2.8),3.2,0.06)*0.5;
          float depth=mix(0.0,1.0,smoothstep(-0.72,0.78,broad*0.72+fine*0.18));
          vec3 deep=vec3(0.035,0.34,0.59);
          vec3 aqua=vec3(0.16,0.69,0.81);
          vec3 color=mix(deep,aqua,depth);
          float current=wave(p+vec2(13.0,-5.0),2.75,0.045);
          float pearl=smoothstep(0.90,0.985,current + broad*0.08);
          color=mix(color,vec3(0.73,0.91,0.93),pearl*0.42);
          gl_FragColor=vec4(color,1.0);
        }
      `,
    }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -1.92;
  ocean.castShadow = ocean.receiveShadow = false;
  ocean.frustumCulled = false;
  scene.add(ocean);
  // The same smooth shoreline drives the ground, beach, trees and walking limit.
  // Its minimum radius leaves the existing town and all six entrances on dry land.
  const coastlineRadius = (angle: number) => 29.7
    + 3.1 * Math.sin(2 * angle + 0.35)
    + 1.9 * Math.cos(3 * angle - 0.9)
    + 1.05 * Math.sin(5 * angle + 1.4)
    + 6.0 * Math.exp(-Math.pow(Math.atan2(Math.sin(angle + Math.PI / 4), Math.cos(angle + Math.PI / 4)), 2) / (2 * 0.27 * 0.27));
  const streamPaths: [number, number][][] = [
    [[-27, 4], [-20, 5], [-14, 5], [-8, 6], [-3, 9], [3, 13], [12, 18], [25, 20]],
    [[-12, -25], [-7, -18], [-2, -11], [3, -5], [8, 1], [15, 5], [25, 7]],
  ];
  const hilltops = [
    { x: -15, z: 19, radius: 12, height: 3.0 },
    { x: -15, z: -10, radius: 11, height: 3.7 },
    { x: -1, z: -5, radius: 12, height: 2.7 },
    { x: 14, z: 0, radius: 12, height: 4.0 },
    { x: 8, z: 19, radius: 11, height: 3.1 },
    { x: 14, z: -19, radius: 12, height: 4.8 },
  ];
  const clamp01 = (value: number) => THREE.MathUtils.clamp(value, 0, 1);
  const ease = (value: number) => value * value * (3 - 2 * value);
  function baseTerrainHeight(x: number, z: number) {
    const radius = Math.hypot(x, z);
    const angle = Math.atan2(x, z);
    const edgeDistance = Math.max(0, coastlineRadius(angle) - 0.45 - radius);
    const edgeFade = ease(clamp01(edgeDistance / 3.6));
    let height = 0.35 + 0.7 * (1 - ease(clamp01(radius / 29)));
    for (const hill of hilltops) {
      const dx = (x - hill.x) * 0.92;
      const dz = (z - hill.z) * 1.08;
      const distance = Math.hypot(dx, dz);
      const terrace = ease(clamp01((hill.radius - distance) / (hill.radius * 0.42)));
      const hillHeight = 0.35 + hill.height * terrace;
      const blend = Math.max(0.8 - Math.abs(height - hillHeight), 0);
      height = Math.max(height, hillHeight) + blend * blend / 3.2;
    }
    const broadRoll = (Math.sin(x * 0.24 + z * 0.12) + Math.cos(z * 0.22 - x * 0.11)) * 0.11;
    // Keep a raised rocky rim above the ocean so the island retains a distinct,
    // stepped silhouette with a clean shoreline.
    return Math.max(0, 1.15 * (1 - edgeFade) + (height + broadRoll) * edgeFade);
  }
  function distanceToPath(x: number, z: number, points: [number, number][]) {
    let nearest = Infinity;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const dx = bx - ax, dz = bz - az;
      const t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
      nearest = Math.min(nearest, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return nearest;
  }
  function terrainHeight(x: number, z: number) {
    const channelDepth = Math.max(...streamPaths.map(path => {
      const distance = distanceToPath(x, z, path);
      return 0.52 * (1 - ease(clamp01((distance - 0.6) / 1.65)));
    }));
    return Math.max(0, baseTerrainHeight(x, z) - channelDepth);
  }
  function islandGeometry(top: number, bottom: number, height: number) {
    const geometry = new THREE.CylinderGeometry(top, bottom, height, 192);
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
  // The hidden upper shell must meet the cliff skirt at both ends. Its old
  // top radius extended 1.4 units past the skirt and left exposed gaps along
  // the island edge; these radii match the skirt's inner/outer seam.
  const shore = mesh(islandGeometry(27, 27.5, 1.8), mat('#ddcda8'));
  shore.position.y = -1;
  const meadowCanvas = document.createElement('canvas'); meadowCanvas.width = 512; meadowCanvas.height = 512;
  const meadowContext = meadowCanvas.getContext('2d')!;
  meadowContext.fillStyle = '#f8f5e8'; meadowContext.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 180; i++) {
    const x = (i * 173 + 31) % 512, y = (i * 271 + 97) % 512;
    meadowContext.beginPath(); meadowContext.ellipse(x, y, 8 + (i % 7) * 3, 5 + (i % 5) * 2, (i % 9) * 0.2, 0, Math.PI * 2);
    meadowContext.fillStyle = ['rgba(230,217,167,0.15)','rgba(114,158,126,0.18)','rgba(247,232,190,0.2)'][i % 3]; meadowContext.fill();
  }
  const meadowTexture = new THREE.CanvasTexture(meadowCanvas); meadowTexture.colorSpace = THREE.SRGBColorSpace;
  const terrainSegments = 192, terrainRings = 64;
  const terrainVertices: number[] = [], terrainColors: number[] = [], terrainUvs: number[] = [], terrainIndices: number[] = [];
  const lowland = new THREE.Color('#a5c47f'), hillside = new THREE.Color('#7da67b'), highland = new THREE.Color('#557d74'), exposedRock = new THREE.Color('#827967'), beachSand = new THREE.Color('#ddbf86');
  function addTerrainVertex(x: number, z: number) {
    const y = terrainHeight(x, z);
    terrainVertices.push(x, y, z);
    terrainUvs.push(x / 34 + 0.5, z / 34 + 0.5);
    const color = lowland.clone().lerp(hillside, clamp01(y / 2.1));
    if (y > 1.45) color.lerp(highland, clamp01((y - 1.45) / 1.8) * 0.72);
    const frontBeachDistance = Math.hypot(x / 18, (z - 20) / 8.5);
    const shellBeachDistance = Math.hypot((x + 15) / 8, (z - 17) / 6.5);
    const tentBeachDistance = Math.hypot((x - 19) / 8, (z - 17) / 6.5);
    const sand = Math.max(
      0.88 * (1 - ease(clamp01((frontBeachDistance - 0.65) / 0.45))),
      0.76 * (1 - ease(clamp01((shellBeachDistance - 0.55) / 0.55))),
      0.72 * (1 - ease(clamp01((tentBeachDistance - 0.55) / 0.55))),
    );
    color.lerp(beachSand, sand);
    const slopeX = (terrainHeight(x + 0.3, z) - terrainHeight(x - 0.3, z)) / 0.6;
    const slopeZ = (terrainHeight(x, z + 0.3) - terrainHeight(x, z - 0.3)) / 0.6;
    color.lerp(exposedRock, clamp01((Math.hypot(slopeX, slopeZ) - 0.34) / 0.54) * 0.72);
    terrainColors.push(color.r, color.g, color.b);
  }
  // Use one vertex at the center and a seam-closed ring around the perimeter.
  // Duplicating the center once per angular segment creates zero-area triangles;
  // those can produce unstable normals and the pinched/broken-looking ground seen in preview.
  addTerrainVertex(0, 0);
  for (let ring = 1; ring <= terrainRings; ring++) for (let segment = 0; segment <= terrainSegments; segment++) {
    const angle = segment / terrainSegments * Math.PI * 2;
    const radius = (coastlineRadius(angle) - 0.45) * ring / terrainRings;
    addTerrainVertex(Math.sin(angle) * radius, Math.cos(angle) * radius);
  }
  const ringSize = terrainSegments + 1;
  const ringVertex = (ring: number, segment: number) => 1 + (ring - 1) * ringSize + segment;
  for (let segment = 0; segment < terrainSegments; segment++) {
    // The angle increases clockwise when viewed from above; this order keeps
    // the triangle front faces and computed normals pointing upward.
    terrainIndices.push(0, ringVertex(1, segment), ringVertex(1, segment + 1));
  }
  for (let ring = 1; ring < terrainRings; ring++) for (let segment = 0; segment < terrainSegments; segment++) {
    const a = ringVertex(ring, segment), b = ringVertex(ring + 1, segment);
    const c = b + 1, d = a + 1;
    terrainIndices.push(a, b, c, a, c, d);
  }
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(terrainVertices, 3));
  terrainGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(terrainVertices.length), 3));
  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
  terrainGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(terrainUvs, 2));
  terrainGeometry.setIndex(terrainIndices); terrainGeometry.computeVertexNormals(); terrainGeometry.computeBoundingSphere();
  const land = mesh(terrainGeometry, new THREE.MeshStandardMaterial({ map: meadowTexture, vertexColors: true, roughness: 1 }));
  // The terrain is a single continuous receiver; self-shadowing its dense,
  // uneven triangles creates dark triangular acne that reads as torn faces.
  land.castShadow = false;
  const cliffRockMaterials = ['#828f86', '#a09b86', '#75877f', '#aaa28c'].map(color => mat(color));
  const cliffVertices: number[] = [], cliffColors: number[] = [], cliffIndices: number[] = [];
  const cliffPalette = ['#777f79', '#909184', '#687a75', '#a0967d'].map(color => new THREE.Color(color));
  const cliffSegments = 192;
  for (let segment = 0; segment <= cliffSegments; segment++) {
    const angle = segment / cliffSegments * Math.PI * 2;
    const innerRadius = coastlineRadius(angle) - 0.45;
    const outerRadius = coastlineRadius(angle) + 0.5;
    const innerX = Math.sin(angle) * innerRadius, innerZ = Math.cos(angle) * innerRadius;
    const outerX = Math.sin(angle) * outerRadius, outerZ = Math.cos(angle) * outerRadius;
    cliffVertices.push(innerX, terrainHeight(innerX, innerZ), innerZ, outerX, -1.88, outerZ);
    const tint = cliffPalette[segment % cliffPalette.length];
    cliffColors.push(tint.r, tint.g, tint.b, tint.r * 0.78, tint.g * 0.78, tint.b * 0.78);
    if (segment < cliffSegments) {
      const a = segment * 2, b = a + 1, c = a + 3, d = a + 2;
      cliffIndices.push(a, b, c, a, c, d);
    }
  }
  const cliffGeometry = new THREE.BufferGeometry();
  cliffGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cliffVertices, 3));
  cliffGeometry.setAttribute('color', new THREE.Float32BufferAttribute(cliffColors, 3));
  cliffGeometry.setIndex(cliffIndices); cliffGeometry.computeVertexNormals(); cliffGeometry.computeBoundingSphere();
  const islandCliff = mesh(cliffGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  islandCliff.castShadow = islandCliff.receiveShadow = true;
  for (let i = 0; i < 34; i++) {
    const angle = i * Math.PI * 2 / 34 + 0.07 + Math.sin(i * 4.1) * 0.07;
    // 礁石要坐在水线（海面 y=-1.92）上半浸入，而不是悬在半空：
    // 旧实现把岩心放在绝对 y≈-0.62，高出海面 1.3 个单位，一圈 34 块全在空中飘着。
    const rockRadius = 0.42 + (i % 5) * 0.15;
    const rockScaleY = 0.58 + (i % 4) * 0.08;
    const radius = coastlineRadius(angle) + 1.05 + Math.sin(i * 8.3) * 0.5;
    const rock = mesh(new THREE.IcosahedronGeometry(rockRadius, 0), cliffRockMaterials[i % cliffRockMaterials.length]);
    rock.position.set(Math.sin(angle) * radius, -1.92 + rockRadius * rockScaleY * 0.55, Math.cos(angle) * radius);
    rock.scale.set(0.72 + (i % 3) * 0.13, rockScaleY, 0.82 + (i % 2) * 0.18);
    rock.rotation.set((i % 3) * 0.18, angle + i * 0.24, (i % 4) * 0.11);
    rock.castShadow = rock.receiveShadow = false;
  }
  const buildings: Building[] = [];
  const collisionMeshes: THREE.Object3D[] = [];
  const obstacles: THREE.Box3[] = [];
  const modelGrayUniforms: { id: number; uniform: { value: number } }[] = [];
  const gltfLoader = new GLTFLoader();
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
  const pathCanvas = document.createElement('canvas'); pathCanvas.width = 256; pathCanvas.height = 256;
  const pathContext = pathCanvas.getContext('2d')!;
  pathContext.fillStyle = '#d4c39f'; pathContext.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
    const x = col * 53 + (row % 2) * 24 - 8, y = row * 38 - 5;
    pathContext.beginPath(); pathContext.roundRect(x + 2, y + 2, 48, 32, 7);
    pathContext.fillStyle = ['#e7d9bb','#e0d0ae','#efe1c4','#d9c9a7'][(row * 3 + col) % 4]; pathContext.fill();
    pathContext.strokeStyle = 'rgba(153,132,98,0.24)'; pathContext.lineWidth = 2; pathContext.stroke();
  }
  const pathTexture = new THREE.CanvasTexture(pathCanvas); pathTexture.colorSpace = THREE.SRGBColorSpace;
  const bridgeLevels: { x: number; z: number; y: number; yaw: number }[] = [];
  const walkwayPaths: [number, number][][] = [];
  function walkableHeight(x: number, z: number) {
    let height = terrainHeight(x, z);
    for (const bridge of bridgeLevels) {
      const dx = x - bridge.x, dz = z - bridge.z;
      const localX = dx * Math.cos(bridge.yaw) - dz * Math.sin(bridge.yaw);
      const localZ = dx * Math.sin(bridge.yaw) + dz * Math.cos(bridge.yaw);
      const outsideX = Math.max(0, Math.abs(localX) - 1.325);
      const outsideZ = Math.max(0, Math.abs(localZ) - 2.8);
      const outsideDistance = Math.hypot(outsideX, outsideZ);
      const ramp = 1 - ease(clamp01(outsideDistance / 2.1));
      height = Math.max(height, THREE.MathUtils.lerp(terrainHeight(x, z), bridge.y, ramp));
    }
    return height;
  }
  function lane(points: number[][], width = 2.4) {
    walkwayPaths.push(points.map(([x, z]) => [x, z] as [number, number]));
    const controls = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(controls, false, 'centripetal', 0.25);
    const length = controls.slice(1).reduce((sum, point, index) => sum + point.distanceTo(controls[index]), 0);
    const samples = curve.getPoints(Math.max(12, Math.ceil(length * 2.2)));
    const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
    let distance = 0;
    samples.forEach((point, index) => {
      if (index) distance += point.distanceTo(samples[index - 1]);
      const tangent = curve.getTangent(index / (samples.length - 1));
      const tangentLength = Math.max(Math.hypot(tangent.x, tangent.z), 0.001);
      const nx = tangent.z / tangentLength * width / 2, nz = -tangent.x / tangentLength * width / 2;
      const leftX = point.x + nx, leftZ = point.z + nz;
      const rightX = point.x - nx, rightZ = point.z - nz;
      vertices.push(leftX, walkableHeight(leftX, leftZ) + 0.12, leftZ, rightX, walkableHeight(rightX, rightZ) + 0.12, rightZ);
      uvs.push(0, distance * 0.28, 1, distance * 0.28);
      if (index < samples.length - 1) {
        const a = index * 2, b = a + 1, c = a + 2, d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const pavingTexture = pathTexture.clone(); pavingTexture.wrapS = pavingTexture.wrapT = THREE.RepeatWrapping;
    pavingTexture.repeat.set(width * 0.44, 1);
    const paving = mesh(geometry, new THREE.MeshStandardMaterial({ map: pavingTexture, roughness: 1, side: THREE.DoubleSide }));
    paving.castShadow = paving.receiveShadow = false;
  }
  function stream(points: [number, number][], width: number) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.12);
    const samples = curve.getPoints(96);
    const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
    samples.forEach((point, index) => {
      const tangent = curve.getTangent(index / (samples.length - 1));
      const length = Math.max(Math.hypot(tangent.x, tangent.z), 0.001);
      const nx = -tangent.z / length * width / 2, nz = tangent.x / length * width / 2;
      const wave = Math.sin(index * 0.73) * 0.014;
      const leftX = point.x + nx, leftZ = point.z + nz;
      const rightX = point.x - nx, rightZ = point.z - nz;
      // Follow the carved terrain independently along both banks. Using the
      // uncut base height here lifted the stream ribbon through hills and
      // exposed it as a floating strip above the ground.
      vertices.push(
        leftX, terrainHeight(leftX, leftZ) + 0.09 + wave, leftZ,
        rightX, terrainHeight(rightX, rightZ) + 0.09 - wave, rightZ,
      );
      uvs.push(0, index / (samples.length - 1) * 7, 1, index / (samples.length - 1) * 7);
      if (index < samples.length - 1) {
        const a = index * 2, b = a + 1, c = a + 2, d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: '#a5edf0', roughness: 0.25, metalness: 0.03, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const water = mesh(geometry, material);
    water.castShadow = water.receiveShadow = false;
  }
  function footbridge(x: number, z: number, yaw: number) {
    const group = new THREE.Group(); group.position.set(x, baseTerrainHeight(x, z) - 0.02, z); group.rotation.y = yaw; islandRoot.add(group);
    bridgeLevels.push({ x, z, y: group.position.y + 0.162, yaw });
    const wood = mat('#9a7353'), plankLight = mat('#bd9670'), rope = mat('#80664d');
    const deck = mesh(new THREE.BoxGeometry(2.65, 0.12, 5.6), wood, group); deck.position.y = 0.06;
    deck.castShadow = deck.receiveShadow = false;
    for (let i = 0; i < 9; i++) {
      const plank = mesh(new THREE.BoxGeometry(2.56, 0.055, 0.48), i % 2 ? plankLight : wood, group);
      plank.position.set(0, 0.135, -2.48 + i * 0.62);
      plank.castShadow = plank.receiveShadow = false;
    }
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const post = mesh(new THREE.CylinderGeometry(0.075, 0.105, 1, 7), rope, group);
        post.position.set(side * 1.22, 0.73, end * 2.55);
        post.castShadow = post.receiveShadow = false;
      }
      const railPath = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 1.22, 0.95, -2.55), new THREE.Vector3(side * 1.22, 0.72, -1.25),
        new THREE.Vector3(side * 1.22, 0.68, 0), new THREE.Vector3(side * 1.22, 0.72, 1.25), new THREE.Vector3(side * 1.22, 0.95, 2.55),
      ]);
      const rail = mesh(new THREE.TubeGeometry(railPath, 24, 0.055, 6, false), rope, group);
      rail.castShadow = rail.receiveShadow = false;
    }
  }
  stream(streamPaths[0], 1.45);
  stream(streamPaths[1], 1.25);
  // Coordinates follow the supplied island plan from the overview camera:
  // shell at the near left, snack bag upper left, studio in the back center,
  // album at the far end, treehouse to the right, and tent at the near right.
  const sites = [
    { x: -14, z: 16, yaw: 0, width: 7.8, depth: 6.2, height: 5.5 },
    { x: -15, z: -10, yaw: 0, width: 7, depth: 5.6, height: 6.8 },
    { x: -2, z: -5, yaw: 0, width: 7.2, depth: 6.1, height: 6 },
    { x: 12, z: 1, yaw: -Math.PI / 4, width: 6.8, depth: 6.1, height: 8 },
    { x: 10, z: 16, yaw: 0, width: 7.6, depth: 6.4, height: 5.2 },
    { x: 13, z: -19, yaw: 0, width: 8.8, depth: 7, height: 8.8 },
  ];
  // Register bridge walking height before laying the paths that lead onto them.
  footbridge(-7, 6.5, -Math.PI / 4);
  footbridge(7, 0, -Math.PI / 4);
  // The main path enters from the front-left dock, reaches a central fork,
  // then follows short branches to each building's front door.
  lane([[-17.67, 16.9], [-16, 19], [-14, 20.6], [-12, 17], [-10, 14], [-8, 11], [-7, 8.8], [-7, 6.5], [-5, 7], [-3, 6], [0, 4], [2, 2], [5, 1], [7, 1], [7, -1], [7, -4], [9, -7], [11, -9], [12, -12], [13, -14.25]], 2.25);
  lane([[-8, 11], [-11, 9], [-13, 6], [-14, 3], [-15, 0], [-15, -6]], 1.8);
  lane([[-3, 6], [-2, 4], [-2, 2], [-2, -0.7]], 1.8);
  lane([[7, 1], [9, 2], [9.5, 3.65]], 1.8);
  lane([[7, 1], [9, 6], [10, 11], [10, 16], [10, 20.7]], 1.8);
  // A short pier and landing mark the island entrance in the foreground left.
  const dockX = -18.5, dockZ = 18.5;
  const dock = new THREE.Group(); dock.position.set(dockX, terrainHeight(dockX, dockZ), dockZ); dock.rotation.y = -0.48; islandRoot.add(dock);
  const dockDeck = mesh(new THREE.BoxGeometry(4.5, 0.08, 8.2), mat('#9a7353'), dock); dockDeck.position.set(0, 0.04, 2.3);
  for (let i = 0; i < 10; i++) {
    const plank = mesh(new THREE.BoxGeometry(4.35, 0.035, 0.68), mat(i % 2 ? '#bd9670' : '#a9825d'), dock);
    plank.position.set(0, 0.08, -1.15 + i * 0.75);
  }
  const pierPostTop = 0, pierPostBottom = -1.9 - dock.position.y;
  const pierPostHeight = pierPostTop - pierPostBottom;
  for (const x of [-1.8, 1.8]) for (const z of [-0.8, 5.2]) {
    const post = mesh(new THREE.CylinderGeometry(0.13, 0.17, pierPostHeight, 7), mat('#80664d'), dock);
    post.position.set(x, (pierPostTop + pierPostBottom) / 2, z);
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
    const group = new THREE.Group(); group.position.copy(center); islandRoot.add(group);
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
      const targetHeight = height * ([1, 2, 5].includes(id) ? 1.16 : id === 4 || id === 6 ? 1.12 : 1.1);
      const scale = targetHeight / Math.max(rawSize.y, rawSize.x * 0.55, 0.001);
      model.scale.setScalar(scale);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      model.position.x -= (bounds.min.x + bounds.max.x) / 2;
      model.position.y -= bounds.min.y;
      model.position.z -= (bounds.min.z + bounds.max.z) / 2;
      model.rotation.y = Math.PI;
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const normal = object.geometry.getAttribute('normal');
        let repairNormals = !normal || normal.count !== object.geometry.getAttribute('position').count;
        if (normal && !repairNormals) {
          for (let vertex = 0; vertex < normal.count; vertex++) {
            const nx = normal.getX(vertex), ny = normal.getY(vertex), nz = normal.getZ(vertex);
            if (!Number.isFinite(nx + ny + nz) || nx * nx + ny * ny + nz * nz < 1e-8) { repairNormals = true; break; }
          }
        }
        if (repairNormals) object.geometry.computeVertexNormals();
        const originals = Array.isArray(object.material) ? object.material : [object.material];
        const cloned = originals.map(original => {
          const material = original.clone();
          material.side = THREE.DoubleSide;
          material.needsUpdate = true;
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
      // The art is already authored facing forward. The half-turn makes the
      // entrance face the local +Z door interaction point.
      group.add(model);
      walls.visible = roof.visible = door.visible = false;
      group.children.filter(child => child.userData.isBlockout).forEach(child => { child.visible = false; });
      collisionMeshes.push(model);
      scene.updateMatrixWorld(true);
      obstacles[obstacles.indexOf(box)].copy(new THREE.Box3().setFromObject(model).expandByScalar(0.42));
      console.info(`[MemoryIsland] Loaded chapter ${id} Tripo model`, { size: size.toArray(), scale });
      assetsSettled++; updateAssetStatus();
    }, undefined, error => { assetsSettled++; assetsFailed++; updateAssetStatus(); console.error(`[MemoryIsland] Could not load chapter ${id} model`, error); });
    const doorLocal = center.clone().addScaledVector(toCenter, site.depth / 2 + 1.5);
    const doorPosition = new THREE.Vector3(doorLocal.x * mapScaleX, doorLocal.y, doorLocal.z);
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
    label.position.copy(center).add(new THREE.Vector3(0, height + 2.8, 0)); label.scale.set(6.4 / mapScaleX, 1.6, 1); islandRoot.add(label); labels.push(label);
  }
  // Six concept buildings are the focal points; keep the gray blockout homes
  // out of this review scene so they do not mask the generated assets.
  // Sparse scenery stays outside the walking routes.
  for (let i = 0; i < 18; i++) {
    const angle = (i + 0.4) * Math.PI * 2 / 18;
    const radius = coastlineRadius(angle) - 2.15 + Math.sin(i * 7) * 0.45;
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.17, 1.5, 7), mat('#7d8974'));
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    trunk.position.set(x, terrainHeight(x, z) + 0.75, z);
    trunk.castShadow = trunk.receiveShadow = false;
    const blossomTree = angle > 0.75 && angle < 1.65;
    for (let leaf = 0; leaf < 3; leaf++) {
      const crown = mesh(new THREE.IcosahedronGeometry(0.72 + ((i + leaf) % 3) * 0.12, 1), mat(blossomTree ? (leaf % 2 ? '#e7a9c5' : '#f0bad0') : (leaf % 2 ? '#8eaa89' : '#769989')));
      const a = leaf * Math.PI * 2 / 3;
      crown.position.copy(trunk.position).add(new THREE.Vector3(Math.sin(a) * 0.48, 1.1 + (leaf % 2) * 0.32, Math.cos(a) * 0.48));
      crown.scale.set(1.08, 0.86 + (leaf % 2) * 0.12, 0.98);
      crown.castShadow = crown.receiveShadow = false;
    }
  }
  // A denser pink grove frames the fourth memory house while leaving the path open.
  for (const [x, z, tint] of [[11, -3, '#e7a9c5'], [17, -3, '#f0bad0'], [18, 3, '#e7a9c5'], [10, 3, '#f4c7d7']] as const) {
    const trunk = mesh(new THREE.CylinderGeometry(0.13, 0.19, 1.8, 7), mat('#806d62'));
    trunk.position.set(x, terrainHeight(x, z) + 0.9, z);
    for (let leaf = 0; leaf < 4; leaf++) {
      const crown = mesh(new THREE.IcosahedronGeometry(0.9 + (leaf % 2) * 0.14, 1), mat(tint));
      // 树冠必须挂在树干顶端而不是绝对高度：这片树丛坐在树屋山头上（地形高 3~4），
      // 旧实现把树冠放在绝对 y≈1.75，整冠埋进山体，只剩光杆戳出坡面，远看像破面。
      crown.position.set(
        x + Math.sin(leaf * Math.PI / 2) * 0.55,
        trunk.position.y + 0.85 + (leaf % 2) * 0.34,
        z + Math.cos(leaf * Math.PI / 2) * 0.55,
      );
      crown.scale.set(1.1, 0.9, 1);
    }
  }
  // Small ground-cover clusters fill the open grass without blocking doors,
  // bridges, creek banks, or the winding paths shown in the island plan.
  const groundCoverGeometry = new THREE.IcosahedronGeometry(0.38, 1);
  const flowerGeometry = new THREE.SphereGeometry(0.085, 8, 6);
  const groundCoverMats = ['#7e9f7e', '#93ae83', '#a2b985'].map(color => mat(color));
  const flowerMats = ['#f1d98d', '#f0b6c7', '#f4efe0'].map(color => mat(color));
  let groundCoverCount = 0;
  for (let i = 0; i < 90 && groundCoverCount < 38; i++) {
    const angle = i * 2.399963;
    const radius = 7.2 + (i * 7.13 % 17.5);
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    if (radius > coastlineRadius(angle) - 4.2) continue;
    if (sites.some(site => Math.hypot(x - site.x, z - site.z) < 5.6)) continue;
    if (streamPaths.some(path => distanceToPath(x, z, path) < 2.5)) continue;
    if (walkwayPaths.some(path => distanceToPath(x, z, path) < 2.65)) continue;
    groundCoverCount++;
    for (let tuft = 0; tuft < 3; tuft++) {
      const offsetX = Math.sin(tuft * 2.1 + angle) * 0.32;
      const offsetZ = Math.cos(tuft * 2.1 + angle) * 0.32;
      const bush = mesh(groundCoverGeometry, groundCoverMats[(i + tuft) % groundCoverMats.length]);
      bush.position.set(x + offsetX, terrainHeight(x + offsetX, z + offsetZ) + 0.22, z + offsetZ);
      bush.scale.set(0.9 + tuft * 0.14, 0.62 + (tuft % 2) * 0.12, 0.85 + (i % 3) * 0.08);
    }
    for (let bloom = 0; bloom < 3; bloom++) {
      const a = angle + bloom * Math.PI * 2 / 3;
      const flowerX = x + Math.sin(a) * 0.48, flowerZ = z + Math.cos(a) * 0.48;
      const flower = mesh(flowerGeometry, flowerMats[(i + bloom) % flowerMats.length]);
      flower.position.set(flowerX, terrainHeight(flowerX, flowerZ) + 0.22, flowerZ);
    }
  }
  const player = new THREE.Group(); scene.add(player); player.position.set(0, walkableHeight(0, 3), 3);
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
    idle: '/island-models/character-han-meimei-idle.glb',
    walk: '/island-models/character-han-meimei-walk.glb',
    run: '/island-models/character-han-meimei-run.glb',
    jump: '/island-models/character-han-meimei-jump.glb',
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
  gltfLoader.load('/island-models/character-han-meimei-h31.glb', gltf => {
    if (signal.aborted) { disposeGltf(gltf.scene); return; }
    const model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    model.scale.setScalar(2.05 / Math.max(size.y, size.x * 0.9, size.z * 0.9, 0.001));
    model.updateMatrixWorld(true);
    const scaledBounds = new THREE.Box3().setFromObject(model);
    model.position.set(-(scaledBounds.min.x + scaledBounds.max.x) / 2, -scaledBounds.min.y, -(scaledBounds.min.z + scaledBounds.max.z) / 2);
    model.rotation.y = Math.PI;
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
  let overviewFramed = false;
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
  const allowed = (worldX: number, z: number) => {
    const x = worldX / mapScaleX;
    return Math.hypot(x, z) < coastlineRadius(Math.atan2(x, z)) - 0.8
      && !obstacles.some(box => worldX > box.min.x && worldX < box.max.x && z > box.min.z && z < box.max.z);
  };
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
  const resize = () => {
    const { width, height } = root.getBoundingClientRect();
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix(); renderer.setSize(width, height);
    if (!overviewFramed) {
      const portraitScale = camera.aspect < 1.15 ? 1 + 1.36 * (1 - camera.aspect) : 1;
      controls.target.set(0, 0, -8);
      camera.position.copy(controls.target).addScaledVector(overviewDirection, overviewDistance * portraitScale);
      controls.update();
      overviewPosition.copy(camera.position); overviewTarget.copy(controls.target);
      overviewFramed = true;
    }
  };
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
    atmosphereUniforms.uTime.value = elapsed;
    oceanUniforms.uTime.value = elapsed;
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
        player.position.y = walkableHeight(player.position.x / mapScaleX, player.position.z);
        player.rotation.y = Math.atan2(dx / mapScaleX, dz);
      }
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
