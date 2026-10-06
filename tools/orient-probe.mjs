// 朝向探针：把一栋 GLB 放到「水平相机 + 地面网格」里，绕 Y 轴每 45° 拍一格。
//
// 为什么是水平相机：游戏里把模型绕 Y 转 presentation.yaw，使入口朝向 group 的
// 本地 +Z（门前交互点就在 +Z 方向）。本探针的相机固定在 +Z 轴上、水平看 -Z，
// 所以「入口正对相机」的那一格的 yaw 值，就是该模型需要的 presentation.yaw。
// 每格还会量一次「下半身正面亮度」（门板/门洞比墙暗），作为视觉之外的旁证。
//
// 静态建筑与蒙皮角色（character-*.glb）都适用；蒙皮模型每格会重新加载 GLB，
// 原因见循环体开头。
//
// 用法：node tools/orient-probe.mjs <glb 路径> [端口]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createServer as createViteServer } from 'vite';
const file = path.resolve(process.argv[2]);
const port = Number(process.argv[3] ?? 5222);
const vite = await createViteServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true }, appType: 'custom' });
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#d3e9ef;font:12px system-ui;overflow:hidden}canvas{display:block}.tag{position:fixed;background:#fffffff2;border:1px solid #a9c3c9;border-radius:4px;padding:2px 6px;font:12px/1.4 ui-monospace,monospace;color:#1d3a40}</style><body><script type="module" src="/main.js"></script>`;
const main = `
import * as THREE from '/node_modules/three/build/three.module.js';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js';
const W = 500, H = 470, COLS = 4, ROWS = 2;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#d3e9ef');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W * COLS, H * ROWS); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.autoClear = false;
document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#ffffff', '#7d8a7a', 2.0));
const key = new THREE.DirectionalLight('#fff3dd', 1.7); key.position.set(4, 9, 7); scene.add(key);
const fill = new THREE.DirectionalLight('#cfe4ff', 0.6); fill.position.set(-6, 4, -3); scene.add(fill);
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('/model');

// 门板亮度旁证用：把贴图烤进离屏 canvas，命中点按 UV 取色。
const scratch = document.createElement('canvas'); const sctx = scratch.getContext('2d', { willReadFrequently: true });
const cache = new Map();
function sampler(material) {
  const map = material && material.map;
  if (!map || !map.image) return null;
  if (!cache.has(map)) {
    try {
      const image = map.image;
      scratch.width = Math.min(image.width, 2048); scratch.height = Math.min(image.height, 2048);
      sctx.clearRect(0, 0, scratch.width, scratch.height);
      sctx.drawImage(image, 0, 0, scratch.width, scratch.height);
      cache.set(map, sctx.getImageData(0, 0, scratch.width, scratch.height).data);
    } catch (error) { cache.set(map, null); }
  }
  const data = cache.get(map);
  if (!data) return null;
  return uv => {
    const x = Math.floor(((uv.x % 1) + 1) % 1 * (scratch.width - 1));
    const y = Math.floor((1 - ((uv.y % 1) + 1) % 1) * (scratch.height - 1));
    const i = (y * scratch.width + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
  };
}

const angles = [0, 45, 90, 135, 180, 225, 270, 315];
const report = [];
const raycast = new THREE.Raycaster();
// 每一格都重新加载一份 GLB。蒙皮网格不能靠 clone() 或复用同一个节点来转角度：
// clone() 的骨骼仍指向原骨架（旋转对渲染无效，八格会长得一模一样），
// 复用节点则骨骼世界矩阵与 mesh 自身矩阵各转一次（实际转出双倍角度，
// 静态网格看不出来是因为它只走后一条）。重新加载是唯一能保证
// 「这一格标的 yaw = 真正渲染出来的朝向」的做法。
for (const [cell, deg] of angles.entries()) {
  const yaw = deg * Math.PI / 180;
  const gltf = await loader.loadAsync('/model');
  const root = gltf.scene;
  const holder = new THREE.Group(); holder.add(root);
  holder.rotation.y = yaw;
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -box.min.y, -center.z);
  holder.updateMatrixWorld(true);
  const span = Math.max(size.x, size.z, 0.001);
  const frame = Math.max(size.y, size.z) * 1.05;
  const distance = (frame / 2) / Math.tan(35 * Math.PI / 360) * 1.3;
  const cam = new THREE.PerspectiveCamera(35, W / H, 0.01, 400);
  cam.position.set(0, size.y * 0.52, distance); cam.lookAt(0, size.y * 0.45, 0);
  cam.updateMatrixWorld(true);
  // 地面网格让「立正 / 歪倒」一眼可见；坐标轴让 +X/+Z 可辨。
  const grid = new THREE.GridHelper(Math.max(span * 2, 2), 8, '#7f9aa0', '#a9c3c9');
  grid.position.y = 0; scene.add(grid);
  const axes = new THREE.AxesHelper(Math.max(span * 0.7, 1)); scene.add(axes);
  scene.add(holder);
  scene.updateMatrixWorld(true);
  // 下半身正面亮度：从相机平面往 -Z 打一排射线，取第一次命中。
  let sum = 0, dark = 0, hits = 0;
  for (let ix = 0; ix < 9; ix++) for (let iy = 0; iy < 7; iy++) {
    const x = (ix / 8 - 0.5) * size.x * 0.9;
    const y = size.y * (0.14 + (iy / 6) * 0.36);
    raycast.set(new THREE.Vector3(x, y, distance), new THREE.Vector3(0, 0, -1));
    raycast.far = distance * 2;
    const hit = raycast.intersectObject(holder, true).find(entry => entry.object && entry.object.isMesh);
    if (!hit) continue;
    const material = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material;
    const sample = sampler(material);
    const value = sample && hit.uv ? sample(hit.uv) : 0.5;
    hits++; sum += value; if (value < 0.34) dark++;
  }
  renderer.setViewport((cell % COLS) * W, (ROWS - 1 - Math.floor(cell / COLS)) * H, W, H);
  renderer.setScissor((cell % COLS) * W, (ROWS - 1 - Math.floor(cell / COLS)) * H, W, H);
  renderer.setScissorTest(true);
  renderer.render(scene, cam);
  scene.remove(holder); scene.remove(grid); scene.remove(axes);
  holder.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    materials.forEach(material => material.dispose());
  });
  const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = deg + '°  yaw=' + (yaw / Math.PI).toFixed(2) + 'π';
  tag.style.left = ((cell % COLS) * W + 8) + 'px'; tag.style.top = ((Math.floor(cell / COLS)) * H + 8) + 'px';
  document.body.append(tag);
  report.push({ deg, size: size.toArray().map(v => +v.toFixed(2)), minY: +box.min.y.toFixed(3), hits, frontLuma: hits ? +(sum / hits).toFixed(3) : null, darkShare: hits ? +(dark / hits).toFixed(2) : null });
}
window.report = report;
window.ready = true;
`;
const server = http.createServer(async (req, res) => {
  if (req.url === '/main.js') { res.setHeader('content-type', 'text/javascript'); res.end(main); return; }
  if (req.url === '/model') { res.setHeader('content-type', 'model/gltf-binary'); fs.createReadStream(file).pipe(res); return; }
  if (req.url === '/' || req.url === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
  vite.middlewares(req, res, () => { res.statusCode = 404; res.end('nf'); });
});
server.listen(port, '127.0.0.1', () => console.log('orient probe http://127.0.0.1:' + port + ' -> ' + file));
