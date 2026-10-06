import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { chapterState, completedChapters } from './Progress';
import { showAlbumUI, type AlbumHandle } from '../ui/AlbumUI';
import { characterGroundHeight } from './grounding';
import { checkScatter, planScatter, type ScatterContext } from './scatter';
import type { Placement } from './clipping';
import { MAP_SCALE_X, coastlineRadius, distanceToPath, streamPaths, terrainHeight } from './terrain';

type Options = { justCompleted?: number; completionSaved?: boolean; onHome: () => void; onChapter: (chapter: number) => void };
type Building = { id: number; door: THREE.Vector3; box: THREE.Box3; materials: THREE.MeshStandardMaterial[]; colors: THREE.Color[] };

/** Self-contained Three.js view. The returned cleanup also releases all GPU resources. */
export function mountMemoryIsland(options: Options): () => void {
  const root = document.createElement('section');
  root.className = 'memory-island';
  root.innerHTML = `<style>
    .memory-island{position:fixed;inset:0;z-index:1100;background:#080d2d;color:#eef2ff;font-family:system-ui,"Microsoft YaHei",sans-serif;overflow:hidden}
    .memory-island canvas{display:block;width:100%;height:100%;touch-action:none}
    .memory-island.is-art-preview{background:#87b9c5}
    .memory-island.is-art-preview .hud{display:none}
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
    .memory-island .chapter-picker strong{color:#31493f}
    .memory-island .chapter-entry{background:#f7f5eadd;border-color:#c7b998aa;box-shadow:0 4px 14px #163b3d18}
    .memory-island .chapter-entry:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 7px 18px #163b3d26}
    .memory-island .chapter-entry:disabled{opacity:.62}
    .memory-island.is-art-preview .asset-status{display:none}
    .memory-island.is-art-preview .chapter-picker,.memory-island.is-art-preview footer{display:none}
    .memory-island .chapter-picker strong{display:block;margin-bottom:10px;font-size:14px;letter-spacing:.08em}
    .memory-island .chapter-list{display:grid;gap:8px}
    .memory-island .chapter-entry{display:grid;grid-template-columns:34px 1fr;align-items:center;gap:10px;width:100%;padding:10px 13px;border-radius:13px;text-align:left}
    .memory-island .chapter-entry span:first-child{font:18px/1 Georgia,serif;color:#906f45}
    .memory-island .chapter-entry b{display:block;font-size:13px;font-weight:650}
    .memory-island .chapter-entry small{display:block;margin-top:3px;color:#60766f;font-size:11px}
    .memory-island .chapter-entry:disabled{cursor:default;opacity:.52;background:#dfe4ded8}
    .memory-island .nearby{position:absolute;left:50%;bottom:125px;transform:translateX(-50%);text-align:center;min-width:240px;pointer-events:auto}
    .memory-island .nearby p{margin:0 0 8px;font-size:14px;font-weight:650;color:#31493f}
    .memory-island .nearby small{display:block;margin:0 0 12px;color:#667970;font-size:12px}
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
  const polishedPreview = new URLSearchParams(window.location.search).get('islandPreview') === '1';
  root.classList.toggle('is-art-preview', forceColorPreview || polishedPreview);
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
  const mapScaleX = MAP_SCALE_X;
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
  // Neutral (Khronos PBR neutral) keeps the pastel palette while rolling off
  // highlights; ACES desaturated the greens and went muddy at this exposure.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.32;
  root.prepend(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);
  camera.position.set(0, 55, 70);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -8);
  const overviewDirection = camera.position.clone().sub(controls.target).normalize();
  const overviewDistance = camera.position.distanceTo(controls.target);
  let overviewZoomScale = 1;
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 27;
  controls.maxDistance = 180;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI / 2.45;
  controls.update();
  scene.add(camera);
  // The HDR environment now carries the ambient sky/ground bounce, so the analytic
  // lights are down to a key sun (form + cast shadows) plus a very weak fill. The
  // hemisphere is only a floor against pitch-black shadow interiors.
  // Horizontal direction the key light should come from. The island's cameras look from
  // +Z, so a sun on the -X side throws its shadows to the right of frame where a player
  // actually sees them; only the azimuth is chosen here, the elevation comes from the HDR.
  const KEY_SUN_AZIMUTH = new THREE.Vector3(-0.94, 0, -0.34).normalize();
  const UP_AXIS = new THREE.Vector3(0, 1, 0);
  scene.add(new THREE.HemisphereLight('#cfe0ff', '#41563f', 0.16));
  const sun = new THREE.DirectionalLight('#ffe6c2', 2.8);
  sun.position.set(-30, 42, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // The island spans roughly ±34 world units around the origin. The old ±26 map cut
  // the outer landmarks out of the shadow frustum entirely, so half of them could not
  // cast anything; ±38 with a 120 far plane covers the whole terrain from this angle.
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, far: 120 });
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2.4;
  scene.add(sun);
  // Weak cool fill from the opposite side so shaded faces keep their form instead of
  // going muddy now that the hemisphere no longer carries most of the light.
  const fill = new THREE.DirectionalLight('#bcd9ff', 0.24);
  fill.position.set(22, 14, -20);
  scene.add(fill);
  // Image-based lighting. The scene used to run on a hemisphere + one directional
  // light, which is why every surface read as the same flat brightness. The HDR drives
  // ambient sky/ground bounce and the specular response; the key light sits on the
  // HDR's own sun, so the shading and the sky stay one consistent light source.
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environmentTarget: THREE.WebGLRenderTarget | undefined;
  new HDRLoader().load('/env/sky-sunny.hdr', texture => {
    if (signal.aborted) { texture.dispose(); pmrem.dispose(); return; }
    texture.mapping = THREE.EquirectangularReflectionMapping;
    environmentTarget = pmrem.fromEquirectangular(texture);
    scene.environment = environmentTarget.texture;
    // A sunny HDR carries enormous dynamic range, so at full strength its irradiance
    // dwarfs the DirectionalLight and flattens the scene back out. Keep it as the
    // ambient/specular source and let the sun do the directional work.
    scene.environmentIntensity = 0.45;
    // This HDR's own sun sits at azimuth 54.5° / elevation 16.5°, i.e. near the horizon
    // and roughly behind the island's cameras, so form and cast shadows did not read.
    // Swing the whole environment - baked sun included - to KEY_SUN_AZIMUTH and put the
    // key light on the same direction: one sun, placed where the cameras can see it.
    const bakedSun = brightestDirection(texture);
    if (bakedSun) {
      const delta = Math.atan2(KEY_SUN_AZIMUTH.x, KEY_SUN_AZIMUTH.z) - Math.atan2(bakedSun.x, bakedSun.z);
      scene.environmentRotation = new THREE.Euler(0, delta, 0);
      sun.position.copy(bakedSun).applyAxisAngle(UP_AXIS, delta).multiplyScalar(64);
    }
    texture.dispose();
    pmrem.dispose();
  }, undefined, error => { pmrem.dispose(); console.error('[MemoryIsland] Could not load the HDR environment', error); });
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
  // Local helpers still used by the terrain shading, the stream ribbon and the
  // bridge ramps. The height functions themselves are in ./terrain.
  const clamp01 = (value: number) => THREE.MathUtils.clamp(value, 0, 1);
  const ease = (value: number) => value * value * (3 - 2 * value);
  // The terrain functions now live in ./terrain so the scatter planner, the
  // clipping audit and the probes all read the same heights as the renderer.
  // Copying these formulas into a probe is how "the audit passes but the island
  // still clips" happens.
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
  // 岛上的 glb 经 tools/optimize-island-models.mjs 用 meshopt 压过（46.7MB → 4.0MB）。
  // 不挂这个解码器，所有模型都会静默加载失败，岛上只剩灰盒方块。
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const modelPaths = [
    '/island-models/ch01-shell-house.glb',
    '/island-models/ch02-snack-shop.glb',
    '/island-models/ch03-dog-studio.glb',
    '/island-models/ch04-purple-treehouse.glb',
    '/island-models/ch05-beach-tent.glb',
    '/island-models/ch06-album-house.glb',
  ];
  const chapterFiveCandidate = new URLSearchParams(window.location.search).get('ch05Candidate') === '1';
  const modelCount = modelPaths.length + (chapterFiveCandidate ? 1 : 0);
  if (chapterFiveCandidate) modelPaths.push('/island-models-candidates/ch05-tent/ch05-tent-p2-clean.glb');
  const chapterNames = ['贝壳屋', '辣条包装屋', '江南画室', '粉紫树屋', '海边帐篷', '相册书屋'];
  const chapterThemes = ['童年的贝壳记忆', '学生时代的辣条记忆', '成年后的画室记忆', '树屋里的成长记忆', '海边露营的记忆', '写进相册的人生记忆'];
  // Per-asset fitting is intentionally explicit: generated objects have very
  // different authored proportions, but must not dominate or spill from the
  // reviewed landmark footprints.
  //
  // yaw: all six Tripo GLBs were generated from the same three-view sheet layout
  // and came out with their entrance facing the model's local +X. The group's
  // local +Z is the reviewed door/interaction direction, so every model needs
  // -π/2 to turn +X onto +Z (R_y(-π/2) maps +X to +Z). Measured, not guessed:
  // `node tools/orient-probe.mjs public/island-models/ch0N-*.glb` renders the
  // eight 45° compass cells, and all six buildings show their entrance dead-on
  // in the 270° cell. The earlier Math.PI value left the door on the -X side,
  // i.e. perpendicular to the interaction point.
  const buildingPresentation = [
    { scale: 0.92, width: 7.8, depth: 6.2, height: 5.5, yaw: -Math.PI / 2 },
    { scale: 0.96, width: 7, depth: 5.6, height: 6.8, yaw: -Math.PI / 2 },
    { scale: 0.94, width: 7.2, depth: 6.1, height: 6, yaw: -Math.PI / 2 },
    { scale: 0.92, width: 6.8, depth: 6.1, height: 8, yaw: -Math.PI / 2 },
    { scale: 0.94, width: 7.6, depth: 6.4, height: 5.2, yaw: -Math.PI / 2 },
    { scale: 0.92, width: 8.8, depth: 7, height: 8.8, yaw: -Math.PI / 2 },
  ];
  const updateAssetStatus = () => { assetStatus.textContent = `3D 模型 ${assetsSettled}/${modelCount + 5} 已载入${forceColorPreview ? ' · 彩色美术预览' : ''}${assetsFailed ? ` · ${assetsFailed} 个失败` : ''}`; };
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
  const bridgeLevels: { x: number; z: number; y: number; yaw: number; surfaceAt?: (localZ: number) => number }[] = [];
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
      if (ramp <= 0) continue;
      // 桥面现在沿 z 随地形倾斜，所以走上去的高度也要按同一条曲线取，
      // 不能再用桥中心那一处的固定高度（否则玩家会踩在看不见的平面上）。
      const surface = bridge.surfaceAt ? bridge.surfaceAt(localZ) : bridge.y;
      height = Math.max(height, THREE.MathUtils.lerp(terrainHeight(x, z), surface, ramp));
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
  // 桥面是块平板，但地形沿桥跨方向起伏（实测 ±0.7）。旧实现把整块板钉在桥中心
  // 一处的高度上，于是两端一头埋进土里、一头悬在半空——决策文档里那条「栈桥桥面
  // 在半空断掉」。现在桥面沿 z 逐段取两岸地形高度：桥头贴岸、桥中略微架高过溪，
  // deck 用同样的分段高度摆放，走上去才不会出现「踩空/陷进坡里」。
  function footbridge(x: number, z: number, yaw: number) {
    const halfLength = 2.8;
    // 桥面沿 z 逐点贴地。不能只取两岸两个端点再线性插值：地形中间有溪流下切
    // 和山头隆起，直线会插过地形（实测桥中悬空 0.38），所以沿桥跨密集采样取真实地形，
    // 再在采样点之间线性插值——既贴合又保持桥面平滑。
    const sampleAt = (localZ: number) => {
      const px = x + Math.cos(yaw) * localZ, pz = z - Math.sin(yaw) * localZ;
      return terrainHeight(px, pz);
    };
    const bridgeSamples = 12;
    const profile = Array.from({ length: bridgeSamples + 1 }, (_, i) => {
      const t = -halfLength + (i * halfLength * 2) / bridgeSamples;
      return { z: t, y: sampleAt(t) };
    });
    const nearY = profile[0].y, farY = profile[profile.length - 1].y;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    islandRoot.add(group);
    // deck 顶点按 localZ 线性插值两岸高度，比固定高度贴合得多
    // 桥面顶相对地形的抬升：两岸压进地面一点（≤ MAX_SINK，让桥头与岸线严丝合缝、
    // 不出现踩空台阶），跨溪中段抬到桥板厚度（桥要架在水面之上，这是对的）。
    const surfaceAt = (localZ: number) => {
      const u = THREE.MathUtils.clamp((localZ + halfLength) / (halfLength * 2), 0, 1);
      const scaled = u * bridgeSamples;
      const index = Math.min(Math.floor(scaled), bridgeSamples - 1);
      const ground = THREE.MathUtils.lerp(profile[index].y, profile[index + 1].y, scaled - index);
      // 15% 处开始抬：桥头 15% 压进岸里（严丝合缝），过了岸线才架起来
      const lift = THREE.MathUtils.lerp(-0.06, 0.12, ease(clamp01((u - 0.15) / 0.2)) * ease(clamp01((0.85 - u) / 0.2)));
      return ground + lift;
    };
    // 供 walkableHeight 复用同一条桥面曲线；bridge.y 仍作为无曲线时的兜底
    bridgeLevels.push({ x, z, y: surfaceAt(0), yaw, surfaceAt });
    const wood = mat('#9a7353'), plankLight = mat('#bd9670'), rope = mat('#80664d');
    // 桥面拆成分段，每一段坐到自己那段地形上（而不是整块钉在桥中心的高度）
    const segments = 9;
    for (let i = 0; i < segments; i++) {
      const z0 = -halfLength + (i * halfLength * 2 / segments);
      const z1 = z0 + halfLength * 2 / segments;
      const y0 = surfaceAt(z0), y1 = surfaceAt(z1);
      const midZ = (z0 + z1) / 2;
      const midY = (y0 + y1) / 2;
      const span = Math.hypot(z1 - z0, y1 - y0);
      const segment = mesh(new THREE.BoxGeometry(2.65, 0.12, span), wood, group);
      segment.position.set(0, midY, midZ);
      // 让每段绕 x 轴倾斜，贴合两岸高差（桥面沿 z 走，旋转轴是组本地 x）
      segment.rotation.x = Math.atan2(y1 - y0, z1 - z0);
      segment.castShadow = segment.receiveShadow = false;
      const plank = mesh(new THREE.BoxGeometry(2.56, 0.055, span * 0.85), i % 2 ? plankLight : wood, group);
      plank.position.set(0, midY + 0.035, midZ);
      plank.rotation.x = segment.rotation.x;
      plank.castShadow = plank.receiveShadow = false;
    }
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const post = mesh(new THREE.CylinderGeometry(0.075, 0.105, 1, 7), rope, group);
        post.position.set(side * 1.22, surfaceAt(end * 2.55) + 0.61, end * 2.55);
        post.castShadow = post.receiveShadow = false;
      }
      const railPath = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 1.22, surfaceAt(-2.55) + 0.83, -2.55), new THREE.Vector3(side * 1.22, surfaceAt(-1.25) + 0.60, -1.25),
        new THREE.Vector3(side * 1.22, surfaceAt(0) + 0.56, 0), new THREE.Vector3(side * 1.22, surfaceAt(1.25) + 0.60, 1.25), new THREE.Vector3(side * 1.22, surfaceAt(2.55) + 0.83, 2.55),
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
  for (let i = 0; i < modelPaths.length; i++) {
    const isCandidate = i >= 6;
    const buildingIndex = isCandidate ? 4 : i;
    const id = buildingIndex + 1;
    const site = sites[buildingIndex];
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
      const presentation = buildingPresentation[buildingIndex];
      const targetHeight = presentation.height * 1.1 * presentation.scale;
      const scale = targetHeight / Math.max(rawSize.y, 0.001);
      model.scale.setScalar(scale);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      model.position.x -= (bounds.min.x + bounds.max.x) / 2;
      model.position.y -= bounds.min.y;
      model.position.z -= (bounds.min.z + bounds.max.z) / 2;
      model.rotation.y = presentation.yaw;
      model.updateMatrixWorld(true);
      const centeredBounds = new THREE.Box3().setFromObject(model);
      const actualSize = centeredBounds.getSize(new THREE.Vector3());
      const fitXZ = Math.min(presentation.width / Math.max(actualSize.x, 0.001), presentation.depth / Math.max(actualSize.z, 0.001), 1);
      const fittedHeight = targetHeight * fitXZ;
      model.scale.multiplyScalar(fitXZ);
      model.updateMatrixWorld(true);
      const fittedSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
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
      // presentation.yaw turns the authored entrance (+X) onto the group-local
      // +Z where the door blockout and its interaction point live.
      if (isCandidate) {
        model.traverse(object => { object.userData.ch05Candidate = true; });
        const tint = new THREE.Color('#e4d3b5');
        model.traverse(object => {
          if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
            object.material.color.copy(tint);
            object.material.roughness = 0.96;
            object.material.metalness = 0;
          }
        });
      }
      group.add(model);
      if (isCandidate) {
        const currentBounds = new THREE.Box3().setFromObject(model);
        const currentCenter = currentBounds.getCenter(new THREE.Vector3());
        const targetCenter = group.position.clone().add(new THREE.Vector3(0, 0, -4.2));
        model.position.x += targetCenter.x - currentCenter.x;
        model.position.z += targetCenter.z - currentCenter.z;
        model.position.y += targetCenter.y - currentBounds.min.y;
        model.updateMatrixWorld(true);
      }
      walls.visible = roof.visible = door.visible = false;
      group.children.filter(child => child.userData.isBlockout).forEach(child => { child.visible = false; });
      if (!isCandidate) collisionMeshes.push(model);
      scene.updateMatrixWorld(true);
      // A Tripo export keeps its own origin and the reset above drops the base
      // alignment, so seat the finished model on the real terrain. Measure once
      // the model is parented, and use the highest terrain sample under the
      // footprint so a building on a slope never sinks into the hill.
      const seatedBounds = new THREE.Box3().setFromObject(model);
      const halfSampleX = fittedSize.x / 2 * 0.9, halfSampleZ = fittedSize.z / 2 * 0.9;
      const footprintGround: number[] = [];
      for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
        footprintGround.push(terrainHeight(site.x + sx * halfSampleX / mapScaleX, site.z + sz * halfSampleZ));
      }
      const baseGround = Math.max(...footprintGround);
      model.position.y += baseGround - seatedBounds.min.y;
      model.updateMatrixWorld(true);
      // Movement collision is a conservative ground footprint, not the full
      // canopy/roof/overhang bounds: keep the approach point and walk-around clear.
      if (!isCandidate) {
        const footprint = obstacles[obstacles.indexOf(box)];
        const halfW = Math.min(site.width * mapScaleX, fittedSize.x * mapScaleX) / 2 + 0.42;
        const halfD = Math.min(site.depth, fittedSize.z) / 2 + 0.42;
        footprint.min.set(center.x * mapScaleX - halfW, -Infinity, center.z - halfD);
        footprint.max.set(center.x * mapScaleX + halfW, Infinity, center.z + halfD);
      }
      const worldBounds = new THREE.Box3().setFromObject(model);
      const materialSummary: string[] = [];
      model.traverse(object => {
        const mesh = object as unknown as { isMesh?: boolean; material?: THREE.Material | THREE.Material[] };
        if (!mesh.isMesh) return;
        const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const entry of list) materialSummary.push(`${entry.type}${(entry as THREE.MeshStandardMaterial).map ? '+map' : ''}`);
      });
      console.info(`[MemoryIsland] Loaded chapter ${id}${isCandidate ? ' candidate' : ''} Tripo model`, {
        rawSize: size.toArray(), fittedSize: fittedSize.toArray(), targetHeight: fittedHeight, scale, fitXZ,
        siteGround: Number(center.y.toFixed(3)),
        baseGround: Number(baseGround.toFixed(3)),
        worldMinY: Number(worldBounds.min.y.toFixed(3)),
        worldMaxY: Number(worldBounds.max.y.toFixed(3)),
        materialSummary,
        footprintGround: footprintGround.map(value => Number(value.toFixed(2))),
      });
      assetsSettled++; updateAssetStatus();
    }, undefined, error => { assetsSettled++; assetsFailed++; updateAssetStatus(); console.error(`[MemoryIsland] Could not load chapter ${id} model`, error); });
    if (isCandidate) {
      group.visible = false;
      const candidateToggle = document.createElement('button');
      candidateToggle.type = 'button';
      candidateToggle.textContent = 'CH05 候选';
      candidateToggle.style.cssText = 'position:fixed;left:28px;top:205px;z-index:2;pointer-events:auto;display:none';
      if (chapterFiveCandidate) {
        get('.hud').append(candidateToggle);
        candidateToggle.addEventListener('click', () => { group.visible = !group.visible; candidateToggle.textContent = group.visible ? '隐藏候选' : '显示候选'; }, { signal });
        const previewCandidate = new URLSearchParams(window.location.search).get('ch05Show') === '1';
        group.visible = previewCandidate;
        candidateToggle.textContent = previewCandidate ? '隐藏候选' : '显示候选';
        candidateToggle.style.display = 'block';
      }
    }
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
    ctx.fillText(`${String(id).padStart(2, '0')}  ${chapterNames[i]}`, 320, 65);
    ctx.font = '29px sans-serif';
    ctx.fillText(completed ? '记忆已点亮' : chapterState(id) === 'available' ? chapterThemes[i] : '等待前一段记忆', 320, 118);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    if (!isCandidate) {
      label.position.copy(center).add(new THREE.Vector3(0, height + 2.8, 0)); label.scale.set(6.4 / mapScaleX, 1.6, 1); islandRoot.add(label); labels.push(label);
    }
  }
  // Scenery is now placed by the clipping-aware planner instead of hand-tuned
  // loops. Every candidate point goes through `canPlace`; a rejected point is
  // dropped (never nudged), which is what keeps the "no clipping" rule true by
  // construction rather than by eyeballing screenshots.
  // `walkwayPaths` holds island-local coordinates, but the planner compares in
  // world space (worldX = x * mapScaleX), so convert once here.
  const walkwaysInWorld = walkwayPaths.map(path => path.map(([x, z]) => [x * mapScaleX, z] as [number, number]));
  const scatterFootprints = obstacles.map(box => ({
    minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z,
  }));
  const scatterKeepClear = buildings.map(building => ({
    x: building.door.x, z: building.door.z, radius: 1.8, label: `${chapterNames[building.id - 1]}门前`,
  }));
  const scatterContext: ScatterContext = {
    footprints: scatterFootprints,
    keepClear: scatterKeepClear,
    walkwayPaths: walkwaysInWorld,
  };
  /** ScatterItem → clipping 的 Placement，两处判定共用同一个形状。 */
  const toPlacements = (items: { id: string; x: number; z: number; radius: number; groundY: number }[]) =>
    items.map(item => ({ id: item.id, x: item.x, z: item.z, radius: item.radius, baseY: item.groundY, groundY: item.groundY }));

  const placedPlacements: Placement[] = [
    ...obstacles.map((box, index) => ({
      id: `obstacle#${index}`,
      x: (box.min.x + box.max.x) / 2,
      z: (box.min.z + box.max.z) / 2,
      // 建筑占地盒当大半径的占位圆：盒的半对角 ≥ 半宽，所以更保守
      radius: Math.max((box.max.x - box.min.x) / 2, (box.max.z - box.min.z) / 2),
      baseY: 0,
      groundY: 0,
    })),
  ];
  // A ring of shoreline trees. Gone is the old "18 fixed angles" loop, which put
  // every tree on a perfect circle and happily grew one into a building corner.
  const trees = planScatter({
    kind: 'tree', idPrefix: 'tree', seed: 20261005, count: 18,
    radius: 0.78, targetHeight: null, modelHeight: 1,
    context: scatterContext, placed: placedPlacements,
    rules: { shoreMargin: 2.15 * mapScaleX, maxRadius: 27 },
  });
  for (const tree of trees) {
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.17, 1.5, 7), mat('#7d8974'));
    trunk.position.set(tree.x / mapScaleX, tree.groundY + 0.75, tree.z);
    trunk.castShadow = trunk.receiveShadow = false;
    const blossomTree = Math.abs(Math.hypot(tree.x / mapScaleX, tree.z) - 24) < 6 && tree.z < 0;
    for (let leaf = 0; leaf < 3; leaf++) {
      const crown = mesh(new THREE.IcosahedronGeometry(0.72 + ((tree.id.length + leaf) % 3) * 0.12, 1), mat(blossomTree ? (leaf % 2 ? '#e7a9c5' : '#f0bad0') : (leaf % 2 ? '#8eaa89' : '#769989')));
      const a = leaf * Math.PI * 2 / 3;
      crown.position.copy(trunk.position).add(new THREE.Vector3(Math.sin(a) * 0.48, 1.1 + (leaf % 2) * 0.32, Math.cos(a) * 0.48));
      crown.scale.set(1.08, 0.86 + (leaf % 2) * 0.12, 0.98);
      crown.castShadow = crown.receiveShadow = false;
    }
  }
  // A denser pink grove frames the fourth memory house while leaving the path open.
  // It sits well inside the shoreline, so it only needs the default shore margin.
  const grove = planScatter({
    kind: 'tree', idPrefix: 'grove', seed: 20261006, count: 4,
    radius: 1.05, targetHeight: null, modelHeight: 1,
    context: scatterContext, placed: placedPlacements,
    rules: { maxRadius: 27 },
  });
  for (const item of grove) {
    const trunk = mesh(new THREE.CylinderGeometry(0.13, 0.19, 1.8, 7), mat('#806d62'));
    trunk.position.set(item.x / mapScaleX, item.groundY + 0.9, item.z);
    for (let leaf = 0; leaf < 4; leaf++) {
      const crown = mesh(new THREE.IcosahedronGeometry(0.9 + (leaf % 2) * 0.14, 1), mat(leaf % 2 ? '#e7a9c5' : '#f0bad0'));
      // 树冠挂在树干顶端而不是绝对高度：这片树丛坐在树屋山头上（地形高 3~4），
      // 旧实现把树冠放在绝对 y≈1.75，整冠埋进山体，只剩光杆戳出坡面，远看像破面。
      crown.position.set(
        item.x / mapScaleX + Math.sin(leaf * Math.PI / 2) * 0.55,
        trunk.position.y + 0.85 + (leaf % 2) * 0.34,
        item.z + Math.cos(leaf * Math.PI / 2) * 0.55,
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
  // cover is planned last, so it must see the trees/grove that are already down.
  // Planning it against only the obstacles is exactly the "one rule while placing,
  // another while auditing" failure the clipping module exists to prevent.
  const cover = planScatter({
    kind: 'groundCover', idPrefix: 'cover', seed: 20261007, count: 38,
    radius: 0.55, targetHeight: null, modelHeight: 1,
    context: scatterContext, placed: [...placedPlacements, ...toPlacements([...trees, ...grove])],
    rules: { shoreMargin: 4.2 * mapScaleX, maxRadius: 24, pathMargin: 2.65 },
  });
  cover.forEach((item, index) => {
    placedPlacements.push({ id: item.id, x: item.x, z: item.z, radius: item.radius, baseY: item.groundY, groundY: item.groundY });
    for (let tuft = 0; tuft < 3; tuft++) {
      const offsetX = Math.sin(tuft * 2.1 + index) * 0.32;
      const offsetZ = Math.cos(tuft * 2.1 + index) * 0.32;
      const bush = mesh(groundCoverGeometry, groundCoverMats[(index + tuft) % groundCoverMats.length]);
      bush.position.set(item.x / mapScaleX + offsetX, terrainHeight(item.x / mapScaleX + offsetX, item.z + offsetZ) + 0.22, item.z + offsetZ);
      bush.scale.set(0.9 + tuft * 0.14, 0.62 + (tuft % 2) * 0.12, 0.85 + (index % 3) * 0.08);
    }
    for (let bloom = 0; bloom < 3; bloom++) {
      const a = index * 2.399963 + bloom * Math.PI * 2 / 3;
      const flowerX = item.x / mapScaleX + Math.sin(a) * 0.48, flowerZ = item.z + Math.cos(a) * 0.48;
      const flower = mesh(flowerGeometry, flowerMats[(index + bloom) % flowerMats.length]);
      flower.position.set(flowerX, terrainHeight(flowerX, flowerZ) + 0.22, flowerZ);
    }
  });
  // Full audit after everything is placed: an empty result is the only way the
  // "no clipping" rule can be considered satisfied.
  const scatterIssues = checkScatter([...trees, ...grove, ...cover], scatterContext);
  if (scatterIssues.length) console.error('[MemoryIsland] 散布穿模审计未通过', scatterIssues);
  else console.info('[MemoryIsland] 散布穿模审计通过', { trees: trees.length, grove: grove.length, cover: cover.length });
  const player = new THREE.Group(); scene.add(player); player.position.set(0, characterGroundHeight(0, 3, walkableHeight), 3);
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
  // Eight Tripo props (rocks, coral, palm, blossom, bush, flowers, broadleaf,
  // rock-outcrop) from public/island-models/props/. They are placed by the same
  // planner as the scenery, so they obey the same no-clipping rule.
  const propAssets = [
    { file: 'rock', targetHeight: 1.6, radius: 1.0, count: 5 },
    { file: 'rock-outcrop', targetHeight: 2.0, radius: 1.2, count: 4 },
    { file: 'coral', targetHeight: 1.1, radius: 0.7, count: 4 },
    { file: 'palm', targetHeight: 3.4, radius: 1.1, count: 5 },
    { file: 'blossom', targetHeight: 2.6, radius: 0.9, count: 4 },
    { file: 'broadleaf', targetHeight: 3.0, radius: 1.0, count: 4 },
    { file: 'bush', targetHeight: 1.2, radius: 0.6, count: 5 },
    { file: 'flower-clump', targetHeight: 0.8, radius: 0.5, count: 5 },
  ] as const;
  const propModels = new Map<string, { height: number; object: THREE.Group }>();
  const propSpots = propAssets.flatMap((asset, index) => planScatter({
    kind: 'prop', idPrefix: asset.file, seed: 20261008 + index * 7, count: asset.count,
    radius: asset.radius, targetHeight: asset.targetHeight, modelHeight: 1,
    context: scatterContext, placed: placedPlacements,
    rules: { shoreMargin: 2.4, maxRadius: 25 },
  }));
  // Load each prop once and instance it at its planned spots, so eight assets
  // cover ~36 placements without paying the load cost 36 times.
  Promise.all(propAssets.map(async asset => {
    const url = `/island-models/props/${asset.file}.glb`;
    const gltf = await gltfLoader.loadAsync(url);
    if (signal.aborted) { disposeGltf(gltf.scene); return; }
    gltf.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const height = bounds.getSize(new THREE.Vector3()).y;
    gltf.scene.traverse(object => {
      if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    propModels.set(asset.file, { height: Math.max(height, 0.001), object: gltf.scene });
  })).then(() => {
    if (signal.aborted) return;
    for (const spot of propSpots) {
      const entry = propModels.get(spot.id.split('#')[0]);
      if (!entry) continue;
      const instance = entry.object.clone(true);
      // 底面贴地：模型原点在几何中心，先按目标高度缩放，再把 clone 的最低点
      // 抬到地形高度——否则一半埋进土里（这正是 decisions 里那条「建筑底座陷沙」的同款错误）。
      const scale = spot.scale;
      instance.scale.setScalar(scale);
      instance.updateMatrixWorld(true);
      instance.position.set(spot.x, 0, spot.z);
      instance.updateMatrixWorld(true);
      const landed = new THREE.Box3().setFromObject(instance);
      instance.position.y += spot.groundY - landed.min.y;
      instance.updateMatrixWorld(true);
      islandRoot.add(instance);
    }
  }).catch(error => console.error('[MemoryIsland] 散布道具加载失败', error));

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
    // Scale by authored height only: using width/depth as competing denominators
    // shrinks unusually slender poses and made the feet look detached from terrain.
    model.scale.setScalar(2.05 / Math.max(size.y, size.x * 0.9, size.z * 0.9, 0.001));
    model.updateMatrixWorld(true);
    const scaledBounds = new THREE.Box3().setFromObject(model);
    // Align the model's actual lowest vertex to the player's ground anchor. The
    // source GLB may have a non-zero origin and the animated rig can bob above it.
    model.position.set(-(scaledBounds.min.x + scaledBounds.max.x) / 2, -scaledBounds.min.y, -(scaledBounds.min.z + scaledBounds.max.z) / 2);
    model.rotation.y = -Math.PI / 2;
    // 作者朝向是 +X（与六栋建筑同一套 Tripo 流程）：`player.rotation.y` 已把
    // 「移动方向」写成组本地 +Z，所以模型只需再转 -π/2 把 +X 摆到 +Z。
    // 原来的 π 让角色始终侧身横走：探针罗盘在 270° 格看得到正脸，
    // 岛内按 W/S 实走时却只看到左右侧脸，两者结合才能定下来。
    // Preserve this bind-pose offset. Animation clips may animate root nodes, so
    // per-frame corrections must be measured against the original ground anchor.
    model.updateMatrixWorld(true);
    const groundedBounds = new THREE.Box3().setFromObject(model);
    const modelGroundOffset = -groundedBounds.min.y;
    model.position.y += modelGroundOffset;
    model.userData.groundOffset = modelGroundOffset;
    model.updateMatrixWorld(true);
    model.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    model.userData.isHanMeimeiModel = true;
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
  // Temporary review hook: ?focusChapter=N frames one landmark so each Tripo
  // asset can be inspected up close instead of judged from the whole-island view.
  const focusChapter = Number(new URLSearchParams(window.location.search).get('focusChapter'));
  // ?focusFrom=door makes the landmark review shot look like a player walking up to the
  // door: camera sits on the site's outward door direction, at eye height above the
  // terrain there, looking back at the facade. ?focusDist=N sets that distance.
  const focusFromDoor = new URLSearchParams(window.location.search).get('focusFrom') === 'door';
  const focusDistance = Number(new URLSearchParams(window.location.search).get('focusDist')) || 6.5;
  let yaw = 0, pitch = 0.24;
  let cameraDistance = 5.6;
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
  function setMode(next: typeof mode) {    keys.clear();
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
    const deltaX = event.clientX - lastX, deltaY = event.clientY - lastY;
    yaw -= deltaX * 0.005;
    pitch = THREE.MathUtils.clamp(pitch + deltaY * 0.004, -0.08, 0.8);
    lastX = event.clientX; lastY = event.clientY;
  }, { signal });
  renderer.domElement.addEventListener('lostpointercapture', () => { dragging = undefined; }, { signal });
  renderer.domElement.addEventListener('pointerup', () => { dragging = undefined; }, { signal });
  const allowed = (worldX: number, z: number) => {
    const x = worldX / mapScaleX;
    const insideIsland = Math.hypot(x, z) < coastlineRadius(Math.atan2(x, z)) - 0.8;
    if (!insideIsland) return false;
    const insideBridge = bridgeLevels.some(bridge => {
      const dx = x - bridge.x, dz = z - bridge.z;
      const localX = dx * Math.cos(bridge.yaw) - dz * Math.sin(bridge.yaw);
      const localZ = dx * Math.sin(bridge.yaw) + dz * Math.cos(bridge.yaw);
      return Math.abs(localX) <= 1.1 && Math.abs(localZ) <= 2.55;
    });
    return insideBridge || !obstacles.some(box => worldX > box.min.x && worldX < box.max.x && z > box.min.z && z < box.max.z);
  };
  function updateCamera(blend: number) {
    focus.copy(player.position).add(new THREE.Vector3(0, 1.55, 0));
    desired.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(cameraDistance).add(focus);
    direction.copy(desired).sub(focus).normalize(); ray.set(focus, direction); ray.far = cameraDistance;
    const hit = ray.intersectObjects(collisionMeshes, true)[0];
    if (hit) desired.copy(focus).addScaledVector(direction, Math.max(0.45, hit.distance - 0.55));
    desired.y = Math.max(desired.y, 0.35);
    camera.position.lerp(desired, blend);
    followFocus.lerp(focus, blend);
    camera.lookAt(followFocus);
  }
  renderer.domElement.addEventListener('wheel', event => {
    if (mode !== 'overview') return;
    event.preventDefault();
    overviewZoomScale = THREE.MathUtils.clamp(overviewZoomScale * Math.exp(event.deltaY * 0.001), 0.65, 2.4);
    const portraitScale = camera.aspect < 1.15 ? 1 + 1.36 * (1 - camera.aspect) : 1;
    camera.position.copy(controls.target).addScaledVector(overviewDirection, overviewDistance * portraitScale * overviewZoomScale);
    controls.update();
    overviewPosition.copy(camera.position); overviewTarget.copy(controls.target);
  }, { signal, passive: false });
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
      camera.position.copy(controls.target).addScaledVector(overviewDirection, overviewDistance * portraitScale * overviewZoomScale);
      if (Number.isInteger(focusChapter) && focusChapter >= 1 && focusChapter <= 6) {
        const site = sites[focusChapter - 1];
        controls.target.set(site.x * mapScaleX, site.height * 0.45, site.z);
        if (focusFromDoor) {
          const outwardX = Math.sin(site.yaw), outwardZ = Math.cos(site.yaw);
          const away = site.depth / 2 + 1.5 + focusDistance;
          const doorX = site.x + outwardX * away, doorZ = site.z + outwardZ * away;
          camera.position.set(
            doorX * mapScaleX,
            terrainHeight(doorX, doorZ) + site.height * 0.42,
            doorZ,
          );
        } else {
          camera.position.copy(controls.target).add(new THREE.Vector3(9, 7.5, 11));
        }
        controls.update();
      }
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
    if (characterMixer) {
      // Imported clips can animate the rig root vertically. Restore its bind-pose
      // ground offset after each mixer tick so feet remain planted on the terrain.
      const model = player.children.find(child => child.userData.isHanMeimeiModel);
      if (model) {
        player.updateMatrixWorld(true);
        model.position.y = Number(model.userData.groundOffset ?? 0);
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const feetY = bounds.min.y;
        const terrainY = characterGroundHeight(player.position.x / mapScaleX, player.position.z, walkableHeight);
        const feetError = terrainY - feetY;
        // Apply one absolute correction to the stored bind-pose offset. Do not
        // integrate corrections frame-to-frame; that would accumulate drift.
        const correction = THREE.MathUtils.clamp(feetError, -0.08, 0.08);
        model.position.y = Number(model.userData.groundOffset ?? 0) + correction;
        if (Math.abs(feetError) > 0.08) player.position.y += feetError - correction;
      }
    }
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
        player.position.y = characterGroundHeight(player.position.x / mapScaleX, player.position.z, walkableHeight);
        player.rotation.y = Math.atan2(dx / mapScaleX, dz);
      }
      legs.forEach((leg, index) => { leg.rotation.x = length ? Math.sin(elapsed * 11 + index * Math.PI) * 0.5 : 0; });
      // Dampen both camera position and aim so the third-person view trails the player smoothly.
      cameraDistance = Math.min(9.5, cameraDistance + dt * 0.65);
      updateCamera(1 - Math.exp(-5 * dt));
      nearby = buildings.find(b => b.door.distanceTo(player.position) < 2.8);
      nearbyPanel.hidden = !nearby;
      if (nearby) {
        const state = chapterState(nearby.id);
        const name = chapterNames[nearby.id - 1];
        nearbyPanel.querySelector('p')!.textContent = `${name} · ${state === 'completed' ? '记忆已点亮' : state === 'available' ? '新的记忆在等你' : '尚未解锁'}`;
        const oldDetail = nearbyPanel.querySelector('small');
        if (oldDetail) oldDetail.remove();
        const detail = document.createElement('small');
        detail.textContent = chapterThemes[nearby.id - 1];
        nearbyPanel.querySelector('p')!.after(detail);
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
    environmentTarget?.dispose();
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

/** Half-float (IEEE 754 binary16) -> number, for reading an HDR's texel data on the CPU. */
function halfToFloat(value: number): number {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const mantissa = value & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (mantissa / 1024);
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

/**
 * Direction of the brightest texel of an equirectangular HDR, i.e. where its sun is.
 *
 * three samples an equirect environment as u = atan2(z, x) / 2π + 0.5 and
 * v = asin(y) / π + 0.5. The loader stores the image flipped, so which sign of v is
 * "up" cannot be read off the file: build both candidates and keep the one that
 * lands above the horizon (a daylight HDR always has its sun in the sky).
 */
function brightestDirection(texture: THREE.DataTexture): THREE.Vector3 | null {
  const image = texture.image as { data?: Uint16Array; width?: number; height?: number } | undefined;
  const data = image?.data, width = image?.width, height = image?.height;
  if (!data || !width || !height) return null;
  let best = -1, bestX = 0, bestY = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      const luminance = 0.2126 * halfToFloat(data[index]) + 0.7152 * halfToFloat(data[index + 1]) + 0.0722 * halfToFloat(data[index + 2]);
      if (luminance > best) { best = luminance; bestX = x; bestY = y; }
    }
  }
  const toDirection = (v: number) => {
    const phi = ((bestX + 0.5) / width - 0.5) * Math.PI * 2;
    const theta = (v - 0.5) * Math.PI;
    return new THREE.Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi));
  };
  const direct = toDirection((bestY + 0.5) / height);
  const flipped = toDirection(1 - (bestY + 0.5) / height);
  return direct.y >= flipped.y ? direct : flipped;
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
