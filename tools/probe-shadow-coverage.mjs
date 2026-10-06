/**
 * 阴影覆盖体检：算主光方向 + shadow camera 的视锥，量「岛屿有多少比例的顶点落在阴影视锥内」。
 *
 * 为什么需要这个：decisions/2026-10-05-island-hdr-lighting.md 把阴影视锥从 ±26 放到 ±38
 * 是为了罩住跨度 ±34 的岛。但视锥是不是真的生效，光看代码判断不了——three 的
 * WebGLShadowMap 会在首次阴影 pass 时调 updateProjectionMatrix，Object.assign 写的
 * 视锥能不能落到投影矩阵里，得实测。
 *
 * 判定：把岛上建筑/地形的代表点投到 shadow camera 的裁剪空间，看有多少落在 [-1,1]^3 内。
 *
 * 用法：node tools/probe-shadow-coverage.mjs
 */
import { DirectionalLight, OrthographicCamera, Vector3, Matrix4, Box3 } from 'three';

const ISLAND_EXTENT = 34;      // decisions 里记的岛屿跨度 ±34
const SHADOW_HALF = 38;        // MemoryIsland 里 sun.shadow.camera 的 left/right/top/bottom
const FAR = 120;
const SUN_POS = new Vector3(-57.7, 18.2, -20.9); // 实测（HDR 太阳转到 KEY_SUN_AZIMUTH 后的主光位置）

const light = new DirectionalLight('#ffe6c2', 2.8);
light.position.copy(SUN_POS);
light.updateMatrixWorld(true);
light.target.position.set(0, 0, 0);
light.target.updateMatrixWorld(true);

function coverage({ half, far, applyUpdate }) {
  const cam = new OrthographicCamera(-half, half, half, -half, 0.5, far);
  if (applyUpdate) cam.updateProjectionMatrix();
  cam.position.setFromMatrixPosition(light.matrixWorld);
  cam.lookAt(light.target.position);
  cam.updateMatrixWorld(true);
  const viewProj = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

  // 岛上的采样点：一圈半径 ISLAND_EXTENT 的点 + 建筑顶部
  const points = [];
  for (let i = 0; i < 360; i += 5) {
    const a = (i * Math.PI) / 180;
    points.push(new Vector3(Math.cos(a) * ISLAND_EXTENT, 0, Math.sin(a) * ISLAND_EXTENT));
    points.push(new Vector3(Math.cos(a) * ISLAND_EXTENT * 0.7, 6, Math.sin(a) * ISLAND_EXTENT * 0.7));
  }
  // 六栋建筑的顶部（粗略 8 单位高）
  for (let i = 0; i < 360; i += 30) {
    const a = (i * Math.PI) / 180;
    points.push(new Vector3(Math.cos(a) * ISLAND_EXTENT * 0.5, 8, Math.sin(a) * ISLAND_EXTENT * 0.5));
  }

  let inside = 0;
  const missed = [];
  for (const p of points) {
    const q = p.clone().applyMatrix4(viewProj);
    // 透视除法
    if (Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z >= -1 && q.z <= 1) inside++;
    else missed.push(p);
  }
  return { pct: ((inside / points.length) * 100).toFixed(1), total: points.length, inside, missed: missed.length };
}

console.log(`主光位置 ${SUN_POS.toArray().map(v => v.toFixed(1)).join(', ')}`);
console.log(`岛屿跨度 ±${ISLAND_EXTENT}\n`);

const withUpdate = coverage({ half: SHADOW_HALF, far: FAR, applyUpdate: true });
console.log(`视锥 ±${SHADOW_HALF} 且 updateProjectionMatrix(): 视锥内采样点 ${withUpdate.inside}/${withUpdate.total} = ${withUpdate.pct}%`);

const withoutUpdate = coverage({ half: SHADOW_HALF, far: FAR, applyUpdate: false });
console.log(`视锥 ±${SHADOW_HALF} 但不调 updateProjectionMatrix(): ${withoutUpdate.inside}/${withoutUpdate.total} = ${withoutUpdate.pct}%`);

const legacy = coverage({ half: 26, far: 80, applyUpdate: true });
console.log(`旧的 ±26/far80（若真生效）: ${legacy.inside}/${legacy.total} = ${legacy.pct}%  ← decisions 里说这就是「外圈不投影」的原因`);

const five = coverage({ half: 5, far: 500, applyUpdate: false });
console.log(`默认 ±5 且不调 update(): ${five.inside}/${five.total} = ${five.pct}%  ← 若 updateProjectionMatrix 没生效，实际就是这个结果\n`);

// 结论提示
const effective = Number(withUpdate.pct);
console.log(effective > 95
  ? '✓ ±38 视锥确实罩住了全岛（WebGLShadowMap 会补 updateProjectionMatrix，代码写法没问题）'
  : '✗ ±38 视锥罩不住，需要放宽或挪主光');
