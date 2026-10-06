/**
 * 探针：量记忆之岛角色贴地的三件事（只测量，不改 src/）。
 *
 *  1. 贴地校正的漂移不变量：逐帧采样
 *       - feetY（模型世界包围盒最低点，和游戏 tick 里同一个量）
 *       - model.position.y / userData.groundOffset / player.position.y
 *       - 复算 terrainY（不自己抄算式：页面里 import 仓库的
 *         /src/island/terrain.ts + /src/island/scatter.ts + /src/island/grounding.ts）
 *       - 额外：用 SkinnedMesh.applyBoneTransform 把「绑定姿态最低的 N 个顶点」
 *         真算成蒙皮后的世界 y，因为 Box3.setFromObject 看不见骨骼形变。
 *     检查 model.position.y 是不是绝对值写入（不累加）、player.position.y 是否漂移。
 *  2. 缩放 2.05 是否让比例失真：角色世界包围盒 vs 门 / 建筑 / 路面宽度。
 *  3. uIslandGray 灰化注入是否生效：读 uniform 值 + 从渲染器拿实际链接程序的片元源码，
 *     在三种进度下截图（空进度 / 预置 [1,2] / focusChapter=3）。
 *
 * 用法：node tools/probe-character-grounding.mjs
 */
import { chromium } from '/Users/simon/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5173';
const OUT = 'screenshots/island/character';
const PROGRESS_KEY = 'seek-life-memory-island-v1';
mkdirSync(OUT, { recursive: true });

const VIEW_FAST = { width: 900, height: 560 };   // 采样页：小一点，帧率高一点
const VIEW_SHOT = { width: 1280, height: 800 };  // 截图页

const report = { measuredAt: new Date().toISOString(), origin: ORIGIN, errors: [], pages: [], drift: {}, geometry: null, geometrySeeded: null, gray: [] };

const clampC = v => Math.min(Math.max(v, -0.08), 0.08);
const round = (v, d = 4) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(d)) : null);
const nanFree = v => (typeof v === 'number' ? (Number.isFinite(v) ? v : null) : v);

/* ────────────────────────── 页面里的测量代码 ────────────────────────── */

async function setupProbe(page, tag) {
  const info = await page.evaluate(async () => {
    const THREE = await import('/@id/three');
    const [terrain, scatter, grounding] = await Promise.all([
      import('/src/island/terrain.ts'),
      import('/src/island/scatter.ts'),
      import('/src/island/grounding.ts'),
    ]);
    const view = window.__islandView;
    if (!view) return { error: 'window.__islandView missing（debugView=1 未生效）' };
    window.__mods = { THREE, terrain, scatter, grounding };
    return {
      // 类身份必须与场景共用同一份 three，否则 instanceof / bbox 都没意义
      sharedThreeIdentity: Object.getPrototypeOf(view.scene.position) === THREE.Vector3.prototype,
      mapScaleX: terrain.MAP_SCALE_X,
      scatterExportsMapScale: typeof scatter.MAP_SCALE_X,
      terrainHeight_at_0_3: terrain.terrainHeight(0, 3),
      terrainHeightWorld_at_0_3: scatter.terrainHeightWorld(0, 3),
      reconstructedGroundAtSpawn: grounding.characterGroundHeight(0, 3, (x, z) => terrain.terrainHeight(x, z)),
      localStorageProgress: window.localStorage.getItem('seek-life-memory-island-v1'),
    };
  });
  report.pages.push({ tag, viewport: page.viewportSize(), ...info });
  return info;
}

async function startSampler(page) {
  return page.evaluate(() => {
    const { THREE, terrain, scatter, grounding } = window.__mods;
    const MS = terrain.MAP_SCALE_X;
    const view = window.__islandView;
    let model = null;
    view.scene.traverse(o => { if (o.userData && o.userData.isHanMeimeiModel === true) model = o; });
    if (!model) return { error: 'isHanMeimeiModel not found' };
    const player = model.parent;
    const groundOffset = Number(model.userData.groundOffset ?? 0);

    // 蒙皮最低点：绑定姿态里最低的顶点子集（Box3 看不到骨骼形变）
    const skinned = [];
    model.traverse(o => { if (o.isSkinnedMesh && o.geometry && o.geometry.getAttribute('position')) skinned.push(o); });
    const skinIdx = skinned.map(sm => {
      const pos = sm.geometry.getAttribute('position');
      const all = [];
      for (let i = 0; i < pos.count; i++) all.push([pos.getY(i), i]);
      all.sort((a, b) => a[0] - b[0]);
      const take = Math.min(200, all.length);
      return { mesh: sm, idx: all.slice(0, take).map(p => p[1]), vertexCount: pos.count, hasApplyBoneTransform: typeof sm.applyBoneTransform === 'function' || typeof sm.boneTransform === 'function' };
    });

    const S = { samples: [], phase: 'boot', running: true, t0: performance.now(), cap: 20000, overflow: 0 };
    window.__sampler = S;
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const v = new THREE.Vector3();
    const bridges = [{ x: -7, z: 6.5, yaw: -Math.PI / 4 }, { x: 7, z: 0, yaw: -Math.PI / 4 }];
    let prev = null;
    const tick = () => {
      if (!S.running) return;
      const px = player.position.x, py = player.position.y, pz = player.position.z;
      const localX = px / MS;
      const terrainOnly = grounding.characterGroundHeight(localX, pz, (x, z) => terrain.terrainHeight(x, z));
      // 游戏侧 terrainY 用的是含桥面的 walkableHeight（闭包私有），桥附近只能标出来
      let bridgeBlend = 0;
      for (const b of bridges) {
        const dx = localX - b.x, dz = pz - b.z;
        const bx = dx * Math.cos(b.yaw) - dz * Math.sin(b.yaw);
        const bz = dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw);
        const ox = Math.max(0, Math.abs(bx) - 1.325), oz = Math.max(0, Math.abs(bz) - 2.8);
        const u = Math.min(Math.max(Math.hypot(ox, oz) / 2.1, 0), 1);
        bridgeBlend = Math.max(bridgeBlend, 1 - u * u * (3 - 2 * u));
      }
      box.setFromObject(model);
      box.getSize(size);
      const feetY = box.min.y;
      const modelY = model.position.y;
      let skinMinY = NaN, skinSampled = 0;
      for (const entry of skinIdx) {
        const sm = entry.mesh;
        const fn = sm.applyBoneTransform ? 'applyBoneTransform' : (sm.boneTransform ? 'boneTransform' : null);
        if (!fn) continue;
        sm.updateWorldMatrix(false, false);
        for (const i of entry.idx) {
          v.fromBufferAttribute(sm.geometry.getAttribute('position'), i);
          sm[fn](i, v);
          v.applyMatrix4(sm.matrixWorld);
          if (!(v.y >= skinMinY)) skinMinY = v.y;
          skinSampled++;
        }
      }
      const tAbs = performance.now();
      const sample = {
        t: tAbs - S.t0,
        tAbs,
        phase: S.phase,
        px, py, pz,
        modelY, groundOffset, feetY, skinMinY, skinSampled,
        modelOffset: modelY - groundOffset,
        terrainOnly,
        bridge: bridgeBlend,
        localX,
        mode: (document.querySelector('.memory-island [data-mode]') || {}).textContent || '',
      };
      if (prev) {
        sample.dtMs = tAbs - prev.tAbs;
        sample.dPx = Math.abs(px - prev.px);
        sample.dPz = Math.abs(pz - prev.pz);
        sample.dPy = py - prev.py;
        sample.dModelY = modelY - prev.modelY;
        sample.dFeet = feetY - prev.feetY;
        sample.dSkin = skinMinY - prev.skinMinY;
        sample.dTerrain = terrainOnly - prev.terrainOnly;
      }
      prev = sample;
      if (S.samples.length < S.cap) S.samples.push(sample); else S.overflow++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return {
      ok: true, groundOffset,
      skinnedMeshes: skinIdx.map(e => ({ vertexCount: e.vertexCount, lowestSampled: e.idx.length, hasApplyBoneTransform: e.hasApplyBoneTransform })),
      charScale: model.scale.toArray(),
      playerStart: [player.position.x, player.position.y, player.position.z],
    };
  });
}

async function inspectFeetSource(page) {
  return page.evaluate(() => {
    const { THREE } = window.__mods;
    let model = null;
    window.__islandView.scene.traverse(o => { if (o.userData && o.userData.isHanMeimeiModel === true) model = o; });
    const out = [];
    model.traverse(o => {
      if (!o.isSkinnedMesh) return;
      out.push({
        name: o.name || '(unnamed)',
        boundingBoxIsCached: o.boundingBox !== null && o.boundingBox !== undefined,
        cachedBoundingBoxMinY: o.boundingBox ? o.boundingBox.min.y : null,
        cachedBoundingBoxMaxY: o.boundingBox ? o.boundingBox.max.y : null,
        geometryBoundingBoxMinY: o.geometry.boundingBox ? o.geometry.boundingBox.min.y : null,
        vertexCount: o.geometry.getAttribute('position').count,
      });
    });
    const m2 = model;
    return {
      threeRevision: THREE.REVISION,
      // Box3.setFromObject(precise=false) 对 SkinnedMesh 走 object.boundingBox，
      // 而该值是 computeBoundingBox() 首次调用时的瞬时姿态，之后缓存不再更新。
      skinnedMeshes: out,
      modelLocalFeetY: (() => { const b = new THREE.Box3().setFromObject(m2); return b.min.y; })(),
      playerYNow: model.parent.position.y,
      modelPosYNow: model.position.y,
    };
  });
}

async function measureGeometry(page) {
  return page.evaluate(() => {
    const { THREE, terrain } = window.__mods;
    const MS = terrain.MAP_SCALE_X;
    const view = window.__islandView;
    const scene = view.scene;
    const SITES = [
      { id: 1, x: -14, z: 16, yaw: 0, width: 7.8, depth: 6.2, height: 5.5 },
      { id: 2, x: -15, z: -10, yaw: 0, width: 7, depth: 5.6, height: 6.8 },
      { id: 3, x: -2, z: -5, yaw: 0, width: 7.2, depth: 6.1, height: 6 },
      { id: 4, x: 12, z: 1, yaw: -Math.PI / 4, width: 6.8, depth: 6.1, height: 8 },
      { id: 5, x: 10, z: 16, yaw: 0, width: 7.6, depth: 6.4, height: 5.2 },
      { id: 6, x: 13, z: -19, yaw: 0, width: 8.8, depth: 7, height: 8.8 },
    ];
    const islandRoot = scene.children.find(c => c.isGroup && Math.abs(c.scale.x - MS) < 1e-6) || null;
    let charModel = null;
    scene.traverse(o => { if (o.userData && o.userData.isHanMeimeiModel === true) charModel = o; });
    const charBox = new THREE.Box3().setFromObject(charModel);
    const charSize = charBox.getSize(new THREE.Vector3());
    const sizeOf = b => { const s = new THREE.Box3().copy(b).getSize(new THREE.Vector3()); return { x: s.x, y: s.y, z: s.z }; };
    const visibleBox = root => {
      const b = new THREE.Box3(), tmp = new THREE.Box3();
      root.traverse(o => {
        if (!o.isMesh) return;
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        o.updateWorldMatrix(false, false);
        tmp.setFromObject(o);
        b.union(tmp);
      });
      return b;
    };

    // 门：blockout 门板（几何参数 1.25 × 2.25 × 0.12）；GLB 载入后门板被隐藏，
    // 所以这量的是「设计门洞」而不是渲染出来的 GLB 门。（GLB 门无法从几何上单独分离，见报告。）
    const doors = [];
    scene.traverse(o => {
      if (!o.isMesh || !o.userData || o.userData.isBlockout !== true) return;
      const pm = o.geometry && o.geometry.parameters;
      if (pm && Math.abs(pm.width - 1.25) < 1e-6 && Math.abs(pm.height - 2.25) < 1e-6) {
        o.updateWorldMatrix(false, false);
        const b = new THREE.Box3().setFromObject(o);
        doors.push({ meshVisible: o.visible, worldBBox: sizeOf(b), minY: b.min.y, maxY: b.max.y, localSize: { width: pm.width, height: pm.height } });
      }
    });

    // 建筑：按 site 世界坐标定位 group，只量可见几何（排除隐藏的 blockout）
    const buildings = SITES.map(site => {
      const g = islandRoot ? islandRoot.children.find(c => c.isGroup
        && Math.abs(c.position.x - site.x) < 1e-3 && Math.abs(c.position.z - site.z) < 1e-3) : null;
      if (!g) return { id: site.id, error: 'group not found' };
      const vis = visibleBox(g);
      const toCenter = new THREE.Vector3(Math.sin(site.yaw), 0, Math.cos(site.yaw));
      const doorLocal = new THREE.Vector3(site.x, terrain.terrainHeight(site.x, site.z), site.z).addScaledVector(toCenter, site.depth / 2 + 1.5);
      return {
        id: site.id, blockoutSiteHeight: site.height,
        visibleBBox: sizeOf(vis), visibleGroundY: vis.min.y, visibleTopY: vis.max.y,
        doorWorld: [doorLocal.x * MS, doorLocal.y, doorLocal.z],
      };
    });

    // 路面：lane() 的铺装（CanvasTexture + uv + 顶点成对 left/right），按世界坐标量条带宽度
    const lanes = [];
    if (islandRoot) islandRoot.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material) || !o.material) return;
      const map = o.material.map;
      if (!map || !map.isCanvasTexture) return;
      const pos = o.geometry && o.geometry.getAttribute && o.geometry.getAttribute('position');
      if (!pos || !o.geometry.getAttribute('uv') || pos.count < 4 || pos.count % 2 !== 0) return;
      o.updateWorldMatrix(false, false);
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      const widths = [];
      for (let i = 0; i < pos.count; i += 2) {
        a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld);
        widths.push(a.distanceTo(b));
      }
      widths.sort((x, y) => x - y);
      const bb = new THREE.Box3().setFromObject(o);
      lanes.push({
        pairs: widths.length,
        widthMin: widths[0], widthMedian: widths[Math.floor(widths.length / 2)], widthMax: widths[widths.length - 1],
        spanZ: sizeOf(bb).z, spanX: sizeOf(bb).x,
      });
    });

    const player = charModel.parent;
    const doorDistances = buildings.filter(b => !b.error).map(b => ({
      id: b.id,
      distance: Math.hypot(player.position.x - b.doorWorld[0], player.position.z - b.doorWorld[2]),
    })).sort((a, b) => a.distance - b.distance);

    return {
      mapScaleX: MS,
      character: {
        scale: charModel.scale.toArray(),
        worldBBox: { x: charSize.x, y: charSize.y, z: charSize.z },
        worldMinY: charBox.min.y, worldMaxY: charBox.max.y,
        groundOffset: charModel.userData.groundOffset,
        parentType: charModel.parent ? charModel.parent.type : null,
        parentScale: charModel.parent ? charModel.parent.scale.toArray() : null,
      },
      doors,
      buildings,
      lanes,
      playerNow: [player.position.x, player.position.y, player.position.z],
      doorDistances,
      labelSpriteScales: (() => { const s = []; scene.traverse(o => { if (o.isSprite) s.push([o.scale.x, o.scale.y]); }); return s.slice(0, 6); })(),
    };
  });
}

async function measureGray(page, { forceAllPrograms = true } = {}) {
  return page.evaluate((force) => {
    const { THREE } = window.__mods;
    const view = window.__islandView;
    const renderer = view.renderer;
    const scene = view.scene;
    const gl = renderer.getContext();
    let charModel = null;
    scene.traverse(o => { if (o.userData && o.userData.isHanMeimeiModel === true) charModel = o; });
    const isUnder = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
    // 广角俯视渲一帧，逼所有材质编译程序（不影响下一帧，游戏自己会重渲）
    let forcedRender = null;
    if (force) {
      try {
        const cam = new THREE.PerspectiveCamera(70, 1, 1, 600);
        cam.position.set(0, 200, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
        renderer.render(scene, cam);
        forcedRender = 'ok';
      } catch (e) { forcedRender = 'error:' + String(e.message).slice(0, 80); }
    }
    const SITES = [
      { id: 1, x: -14, z: 16 }, { id: 2, x: -15, z: -10 }, { id: 3, x: -2, z: -5 },
      { id: 4, x: 12, z: 1 }, { id: 5, x: 10, z: 16 }, { id: 6, x: 13, z: -19 },
    ];
    // group.position 用的是岛本地坐标（site.x），islandRoot.scale.x 才是 MAP_SCALE_X 拉伸
    const buildingOf = o => {
      for (let p = o; p; p = p.parent) {
        if (p.userData && p.userData.isHanMeimeiModel) return 'character';
        for (const s of SITES) if (Math.abs(p.position.x - s.x) < 1e-3 && Math.abs(p.position.z - s.z) < 1e-3) return 'building#' + s.id;
        if (p === scene) break;
      }
      return 'other';
    };
    const out = [];
    const seen = new Set();
    scene.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        const hooked = typeof m.customProgramCacheKey === 'function' && m.customProgramCacheKey() === 'memory-island-grayscale-v1';
        let uniformValueRead = null, programUniform = null, fragmentInjection = null, programNote = null;
        if (hooked) {
          // onBeforeCompile 把闭包里的 uniform 对象挂到 shader.uniforms 上；用假 shader 再跑一次，
          // 拿到的是同一个对象的 .value（不依赖渲染时机）。
          const fake = { uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <color_fragment>' };
          try { m.onBeforeCompile(fake, renderer); uniformValueRead = fake.uniforms.uIslandGray ? fake.uniforms.uIslandGray.value : 'missing'; }
          catch (e) { uniformValueRead = 'error:' + String(e.message).slice(0, 80); }
          try {
            const props = renderer.properties.get(m);
            const prog = props && props.currentProgram;
            if (prog && prog.program) {
              const uniforms = prog.getUniforms ? prog.getUniforms() : null;
              programUniform = uniforms && uniforms.map ? Object.keys(uniforms.map).includes('uIslandGray') : null;
              const shaders = gl.getAttachedShaders(prog.program) || [];
              const src = shaders.map(s => (gl.getShaderSource(s) || '')).join('\n');
              fragmentInjection = src ? src.includes('islandLuminance') : null;
              programNote = src ? 'sourceReadable(' + src.length + ')' : 'shaderSourceUnavailable';
            } else programNote = 'noCurrentProgram';
          } catch (e) { programNote = 'error:' + String(e.message).slice(0, 60); }
        }
        out.push({
          hooked, uniformValueRead, programUniform, fragmentInjection, programNote,
          materialType: m.type, building: buildingOf(o), underChar: isUnder(o, charModel),
          color: m.color ? '#' + m.color.getHexString() : null, hasMap: !!m.map,
        });
      }
    });
    const hooked = out.filter(e => e.hooked);
    const byBuilding = {};
    for (const e of hooked) (byBuilding[e.building] = byBuilding[e.building] || []).push(e.uniformValueRead);
    const charMats = out.filter(e => e.underChar);
    return {
      totalMaterials: out.length,
      hookedCount: hooked.length,
      hookedValuesByBuilding: byBuilding,
      hookedValueSet: [...new Set(hooked.map(e => e.uniformValueRead))],
      hookedMaterials: hooked.map(e => ({ building: e.building, value: e.uniformValueRead, type: e.materialType, hasMap: e.hasMap, color: e.color, programUniform: e.programUniform, fragmentInjection: e.fragmentInjection, programNote: e.programNote })),
      programLevel: {
        hooked: hooked.length,
        uniformInProgram: hooked.filter(e => e.programUniform === true).length,
        fragmentInjectionPresent: hooked.filter(e => e.fragmentInjection === true).length,
        noProgramReached: hooked.filter(e => e.programNote === 'noCurrentProgram').length,
      },
      forcedRender,
      characterMaterials: { count: charMats.length, hooked: charMats.filter(e => e.hooked).length, types: [...new Set(charMats.map(e => e.materialType))] },
      nonBuildingHooked: hooked.filter(e => !/^building#/.test(e.building)).length,
      localStorageProgress: window.localStorage.getItem('seek-life-memory-island-v1'),
      domTitle: (document.querySelector('.memory-island h1, .memory-island strong') || {}).textContent || null,
    };
  }, forceAllPrograms);
}

/* ────────────────────────── Node 侧驱动 ────────────────────────── */

async function waitForReady(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.memory-island .asset-status');
    const m = /3D 模型 (\d+)\/(\d+)/.exec(el ? el.textContent || '' : '');
    return !!m && m[1] === m[2];
  }, null, { timeout: 180_000 });
}

async function holdKeys(page, keys, ms, phase, marks) {
  for (const k of keys) await page.keyboard.down(k);
  await mark(page, marks, phase);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
  await mark(page, marks, 'settle-' + phase);
  await page.waitForTimeout(400);
}

// 阶段用**页面绝对时钟**打点（performance.now()），不依赖注入到 window 的任何东西：
// 即使中途丢了 window.*，阶段划分也不会静默错位。
async function mark(page, marks, name) {
  const t = await page.evaluate(() => performance.now());
  marks.push({ t, phase: name });
}

function labelPhases(samples, marks) {
  const sorted = [...marks].sort((a, b) => a.t - b.t);
  const out = {};
  for (const s of samples) {
    let name = 'before-first-mark';
    for (const m of sorted) { if (m.t <= s.tAbs) name = m.phase; else break; }
    (out[name] = out[name] || []).push(s);
  }
  return out;
}

const maxAbs = a => (a.length ? Math.max(...a.map(Math.abs)) : null);

function globalStats(samples) {
  const withDt = samples.filter(s => typeof s.dtMs === 'number');
  const moving = withDt.filter(s => (s.dPx + s.dPz) > 1e-4);
  const stationary = withDt.filter(s => (s.dPx + s.dPz) <= 1e-4);
  const gap = samples.map(s => s.feetY - s.terrainOnly);
  const eG = samples.map(s => s.modelOffset - (s.feetY - s.terrainOnly));
  const residual = samples.map((s, i) => s.modelOffset - clampC(eG[i]));
  const offsets = samples.map(s => s.modelOffset);
  const skinGap = samples.map(s => s.skinMinY - s.terrainOnly).filter(Number.isFinite);
  const skinVsPy = samples.map(s => s.skinMinY - s.py).filter(Number.isFinite);
  const pyAllMoving = moving.map(s => s.py - s.terrainOnly);
  const pyStationary = stationary.map(s => s.py - s.terrainOnly);
  const movingOffBridge = moving.filter(s => s.bridge < 1e-6);
  const movingOnBridge = moving.filter(s => s.bridge >= 1e-6);
  const terrainMinusPyOnBridge = movingOnBridge.map(s => s.terrainOnly - s.py);
  const terrains = samples.map(s => s.terrainOnly).filter(Number.isFinite);
  const bridgeLocal = s => [
    (s.localX + 7) * Math.cos(-Math.PI / 4) - (s.pz - 6.5) * Math.sin(-Math.PI / 4),
    (s.localX + 7) * Math.sin(-Math.PI / 4) + (s.pz - 6.5) * Math.cos(-Math.PI / 4),
  ];
  const row = s => ({
    phase: s.phase, x: round(s.px), z: round(s.pz), y: round(s.py), terrain: round(s.terrainOnly),
    pyMinusTerrain: round(s.py - s.terrainOnly, 6), modelOffset: round(s.modelOffset, 6),
    feetMinusPy: round(s.feetY - s.py, 9), skinMinusPy: round(s.skinMinY - s.py, 4), bridge: round(s.bridge, 3),
    bridgeLocalFromBridgeA: s.bridge > 1e-6 ? bridgeLocal(s).map(v => round(v, 2)) : undefined,
    condition: typeof s.dtMs === 'number' ? ((s.dPx + s.dPz) > 1e-4 ? 'moving' : 'stationary') : 'first',
  });
  return {
    samples: samples.length,
    feetGap_bboxMinusTerrain_maxAbs: round(maxAbs(gap), 12),
    gameFeetError_maxAbs: round(maxAbs(eG), 12),
    modelOffset: {
      distinctValues: [...new Set(samples.map(s => round(s.modelOffset, 12)))],
      maxAbs: round(maxAbs(offsets), 12),
      framesAtClamp: samples.filter((s, i) => Math.abs(Math.abs(offsets[i]) - 0.08) < 1e-9).length,
    },
    // 这条不是「不变量被破坏」：我把地形差按**帧末**的 py 反推，而游戏是在**帧首**测的，
    // 两者差一个「本帧 py 变化量」。非零帧应当等于 dPy。
    reconstructionResidual_maxAbs: round(maxAbs(residual), 12),
    localFeetMin_distinctValues: [...new Set(samples.map(s => round(s.feetY - s.py, 12)))],
    maxFrameStep_modelY: round(maxAbs(withDt.map(s => s.dModelY)), 12),
    playerY: {
      stationaryFrames: stationary.length,
      movingFrames: moving.length,
      maxStep_stationary: round(maxAbs(stationary.map(s => s.dPy)), 12),
      maxStep_moving: round(maxAbs(moving.map(s => s.dPy)), 6),
      maxStepPerSecond: round(maxAbs(withDt.map(s => s.dPy / Math.max(s.dtMs / 1000, 1e-4))), 4),
      framesWithStepOver0_02: withDt.filter(s => Math.abs(s.dPy) > 0.02).length,
      everyStationaryStepIsZero: stationary.every(s => s.dPy === 0),
      netDelta: round(samples[samples.length - 1].py - samples[0].py, 6),
      firstPy: round(samples[0].py), lastPy: round(samples[samples.length - 1].py),
    },
    pyVsRecomputedTerrain: {
      moving_offBridge: { frames: movingOffBridge.length, maxAbs: round(maxAbs(movingOffBridge.map(s => s.py - s.terrainOnly)), 12), framesOver1e_6: movingOffBridge.filter(s => Math.abs(s.py - s.terrainOnly) > 1e-6).length },
      moving_onBridgeFlag: { frames: movingOnBridge.length, min: round(Math.min(...terrainMinusPyOnBridge), 6), max: round(Math.max(...terrainMinusPyOnBridge), 6), framesOver1e_6: movingOnBridge.filter(s => Math.abs(s.py - s.terrainOnly) > 1e-6).length },
      stationary: { frames: stationary.length, maxAbs: round(maxAbs(pyStationary), 12), framesOver1e_6: pyStationary.filter(v => Math.abs(v) > 1e-6).length },
      allMoving: { frames: pyAllMoving.length, maxAbs: round(maxAbs(pyAllMoving), 12), framesOver1e_6: pyAllMoving.filter(v => Math.abs(v) > 1e-6).length },
    },
    skinMinVsTerrain: {
      n: skinGap.length, min: round(Math.min(...skinGap)), max: round(Math.max(...skinGap)),
      framesOver0_08: skinGap.filter(v => Math.abs(v) > 0.08).length,
      framesOver0_02: skinGap.filter(v => Math.abs(v) > 0.02).length,
      maxFrameStep: round(maxAbs(withDt.map(s => s.dSkin)), 6),
    },
    // 与「当时踩的那块地面」（游戏自己的 walkableHeight，即 py）对比，比与裸地形对比更准
    skinMinVsPlayerGround: {
      n: skinVsPy.length, min: round(Math.min(...skinVsPy)), max: round(Math.max(...skinVsPy)),
      framesOver0_08: skinVsPy.filter(v => Math.abs(v) > 0.08).length,
      framesBelow_minus0_02: skinVsPy.filter(v => v < -0.02).length,
      framesBelow_minus0_08: skinVsPy.filter(v => v < -0.08).length,
    },
    terrainReliefCovered: { min: round(Math.min(...terrains)), max: round(Math.max(...terrains)), range: round(Math.max(...terrains) - Math.min(...terrains)), maxFrameStep: round(maxAbs(withDt.map(s => s.dTerrain)), 6) },
    bridgeFlaggedFrames: samples.filter(s => s.bridge > 1e-6).length,
    anomalies: {
      modelOffsetNonZeroCount: samples.filter(s => Math.abs(s.modelOffset) > 1e-9).length,
      modelOffsetNonZero: samples.filter(s => Math.abs(s.modelOffset) > 1e-9).map(row).slice(0, 20),
      pyDiffersFromTerrainCount: samples.filter(s => Math.abs(s.py - s.terrainOnly) > 1e-6).length,
      pyDiffersFromTerrain: samples.filter(s => Math.abs(s.py - s.terrainOnly) > 1e-6).map(row).slice(0, 15),
      feetMinDiffersFromPyCount: samples.filter(s => Math.abs(s.feetY - s.py) > 1e-6).length,
      feetMinDiffersFromPy: samples.filter(s => Math.abs(s.feetY - s.py) > 1e-6).map(row).slice(0, 8),
      skinBelowGroundOver2cmCount: samples.filter(s => (s.skinMinY - s.py) < -0.02).length,
      skinBelowGroundOver2cm: samples.filter(s => (s.skinMinY - s.py) < -0.02).map(row).slice(0, 8),
    },
  };
}

function phaseStats(list) {
  if (!list.length) return { n: 0 };
  const withDt = list.filter(s => typeof s.dtMs === 'number');
  const moving = withDt.filter(s => (s.dPx + s.dPz) > 1e-4);
  const stationary = withDt.filter(s => (s.dPx + s.dPz) <= 1e-4);
  const gaps = list.map(s => s.feetY - s.terrainOnly);
  const eGame = list.map(s => s.modelOffset - (s.feetY - s.terrainOnly));
  const offsets = list.map(s => s.modelOffset);
  const invErr = list.map((s, i) => s.modelOffset - clampC(eGame[i]));
  const pys = list.map(s => s.py);
  const dtMaxMs = withDt.length ? Math.max(...withDt.map(s => s.dtMs)) : null;
  const span = (list[list.length - 1].t - list[0].t) / 1000;
  const moveErr = moving.filter(s => s.bridge < 1e-6).map(s => s.py - s.terrainOnly);
  const terrains = list.map(s => s.terrainOnly).filter(Number.isFinite);
  const skinGaps = list.map(s => s.skinMinY - s.terrainOnly).filter(Number.isFinite);
  const skinVsPy = list.map(s => s.skinMinY - s.py).filter(Number.isFinite);
  return {
    n: list.length,
    spanSeconds: round(span, 2),
    fps: span > 0 ? round(list.length / span, 1) : null,
    dtMaxMs: round(dtMaxMs, 1),
    feetGap_bboxMinusTerrain: { min: round(Math.min(...gaps)), max: round(Math.max(...gaps)), maxAbs: round(maxAbs(gaps)) },
    skinMinusTerrain: { min: round(Math.min(...skinGaps)), max: round(Math.max(...skinGaps)), n: skinGaps.length },
    gameFeetError: { min: round(Math.min(...eGame)), max: round(Math.max(...eGame)), maxAbs: round(maxAbs(eGame), 12) },
    modelOffset: { min: round(Math.min(...offsets)), max: round(Math.max(...offsets)), maxAbs: round(maxAbs(offsets), 12) },
    invariantResidual_modelYEqualsClamp: { maxAbs: round(maxAbs(invErr), 12), framesOff: invErr.filter(v => Math.abs(v) > 1e-9).length },
    playerY: {
      first: round(pys[0]), last: round(pys[pys.length - 1]), delta: round(pys[pys.length - 1] - pys[0]),
      maxStepStationary: round(maxAbs(stationary.map(s => s.dPy)), 6),
      maxStepMoving: round(maxAbs(moving.map(s => s.dPy)), 6),
      maxStepPerSecond: round(maxAbs(withDt.map(s => s.dPy / Math.max(s.dtMs / 1000, 1e-4))), 4),
      signSummary: { up: withDt.filter(s => s.dPy > 1e-6).length, down: withDt.filter(s => s.dPy < -1e-6).length, flat: withDt.filter(s => Math.abs(s.dPy) <= 1e-6).length },
    },
    modelY: { maxStep: round(maxAbs(withDt.map(s => s.dModelY)), 12), up: withDt.filter(s => s.dModelY > 1e-9).length, down: withDt.filter(s => s.dModelY < -1e-9).length },
    feetY: { maxStep: round(maxAbs(withDt.map(s => s.dFeet)), 6) },
    skinMinY: { maxStep: round(maxAbs(withDt.map(s => s.dSkin)), 6), distinctValues: [...new Set(list.map(s => round(s.skinMinY, 6)))].length,
      vsTerrain: { min: round(Math.min(...skinGaps)), max: round(Math.max(...skinGaps)) },
      vsPlayerGround: { min: round(Math.min(...skinVsPy)), max: round(Math.max(...skinVsPy)), framesOver0_08: skinVsPy.filter(v => Math.abs(v) > 0.08).length } },
    path: {
      movingFrames: moving.length, stationaryFrames: stationary.length,
      bridgeFrames: moving.filter(s => s.bridge > 1e-6).length,
      terrainRange: terrains.length ? round(Math.max(...terrains) - Math.min(...terrains)) : null,
      maxFrameTerrainStep: round(maxAbs(withDt.map(s => s.dTerrain)), 6),
      pyVsRecomputedTerrain_offBridge: { frames: moveErr.length, maxAbs: moveErr.length ? round(maxAbs(moveErr), 12) : null, framesOver1e_6: moveErr.filter(v => Math.abs(v) > 1e-6).length },
      xStart: round(list[0].px), xEnd: round(list[list.length - 1].px), zStart: round(list[0].pz), zEnd: round(list[list.length - 1].pz),
    },
  };
}

async function newPage(browser, tag, search, seedProgress, viewport) {
  const context = await browser.newContext({ viewport });
  if (seedProgress) {
    await context.addInitScript(([key, value]) => { try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ } }, [PROGRESS_KEY, seedProgress]);
  }
  const page = await context.newPage();
  const consoleTail = [];
  page.on('console', m => {
    consoleTail.push(`${Math.round(Date.now() % 100000)} ${m.type()}: ${m.text().slice(0, 140)}`);
    if (consoleTail.length > 40) consoleTail.shift();
    if (m.type() === 'error') report.errors.push(`[${tag}] console: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', e => report.errors.push(`[${tag}] pageerror: ${String(e).slice(0, 160)}`));
  page.on('crash', () => report.errors.push(`[${tag}] PAGE CRASHED`));
  // Vite dev 偶发会把整页 reload（依赖重优化 / HMR），一 reload 注入的探针全局就会丢。
  // 允许第一次（goto），之后的主动导航直接 abort，并把尝试记下来。
  let documentRequests = 0;
  const navigations = [];
  await page.route('**/*', route => {
    const request = route.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentRequests++;
      if (documentRequests > 1) {
        navigations.push({ at: new Date().toISOString(), url: request.url().slice(0, 100), action: 'aborted' });
        report.errors.push(`[${tag}] BLOCKED unexpected page reload (${request.url().slice(0, 80)})`);
        return route.abort();
      }
    }
    return route.continue();
  });
  page.on('framenavigated', f => { if (f === page.mainFrame()) navigations.push({ at: new Date().toISOString(), url: f.url().slice(0, 100), action: 'navigated' }); });
  await page.goto(`${ORIGIN}/?scene=island&debugView=1${search}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  page.probeState = { consoleTail, navigations, documentRequests };
  return page;
}

/** 记录阶段切换时的关键状态，用来定位「player.position.y 什么时候变的」。 */
async function stage(page, label) {
  const s = await page.evaluate(() => {
    const view = window.__islandView;
    if (!view) return { error: 'no __islandView' };
    let model = null;
    view.scene.traverse(o => { if (o.userData && o.userData.isHanMeimeiModel === true) model = o; });
    if (!model) return { model: false, t: Math.round(performance.now()) };
    let localFeet = null;
    if (window.__mods && window.__mods.THREE) {
      const b = new window.__mods.THREE.Box3().setFromObject(model);
      localFeet = b.min.y - model.parent.position.y;
    }
    const el = document.querySelector('.memory-island [data-mode]');
    return { t: Math.round(performance.now()), py: model.parent.position.y, modelY: model.position.y, localFeet, mode: el ? el.textContent : null };
  }).catch(e => ({ error: String(e).slice(0, 80) }));
  page.probeState.stages.push({ label, ...s });
  return s;
}

/* ────────────────────────── 主流程 ────────────────────────── */

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });

try {
  /* —— 页面 A：空进度（1 解锁 / 2-6 锁），focusChapter=1 —— */
  const pageA = await newPage(browser, 'A-fresh-focusCh1', '&focusChapter=1', null, VIEW_FAST);
  pageA.probeState.stages = [];
  report.drift.stages = pageA.probeState.stages;
  await stage(pageA, 'after-ready');
  await setupProbe(pageA, 'A-fresh-focusCh1');
  await stage(pageA, 'after-setupProbe');
  await pageA.waitForTimeout(1200);
  report.gray.push({ tag: 'A 空进度（ch1 解锁 / ch2-6 未解锁）', data: await measureGray(pageA) });
  await stage(pageA, 'after-measureGray');

  await pageA.click('.memory-island [data-switch]');
  await pageA.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await pageA.waitForTimeout(800);
  await stage(pageA, 'after-click-switch');
  report.drift.inputCheck = await pageA.evaluate(() => (document.querySelector('.memory-island [data-mode]') || {}).textContent);
  const sampler = await startSampler(pageA);
  report.drift.sampler = sampler;
  const marks = [];
  await stage(pageA, 'after-startSampler');

  if (sampler && sampler.ok) {
    await mark(pageA, marks, 'idle-baseline');
    report.drift.globalsAtBaseline = await pageA.evaluate(() => ({ mark: typeof window.__mark, sampler: typeof window.__sampler, mods: typeof window.__mods, clock: Math.round(performance.now()) }));
    await pageA.waitForTimeout(1500);
    await pageA.screenshot({ path: `${OUT}/play-third-person-spawn.png` });
    await pageA.waitForTimeout(3500);
    report.drift.globalsBeforeWalk = await pageA.evaluate(() => ({ mark: typeof window.__mark, sampler: typeof window.__sampler, mods: typeof window.__mods, clock: Math.round(performance.now()) }));

    await holdKeys(pageA, ['a'], 20_000, 'walk-west-free', marks);
    await holdKeys(pageA, ['d'], 20_000, 'walk-east-back', marks);

    await holdKeys(pageA, ['w'], 10_000, 'walk-to-door', marks);

    await holdKeys(pageA, ['d'], 12_000, 'push-hill-blocked', marks);

    await mark(pageA, marks, 'idle-standstill');
    await pageA.waitForTimeout(20_000);

    for (let i = 1; i <= 3; i++) {
      await pageA.keyboard.press(' ');
      await mark(pageA, marks, 'jump-' + i);
      await pageA.waitForTimeout(11_000);
    }
    await mark(pageA, marks, 'settle-jumps');
    await pageA.waitForTimeout(1500);

    await holdKeys(pageA, ['Shift', 'a'], 10_000, 'run-west', marks);

    // 跑到 03 号楼门前：等「nearby」面板弹出（它只在 door 距离 < 2.8 时显示），
    // 截图后继续往东跑，把山体起伏也走一遍。
    await pageA.keyboard.down('d');
    await pageA.keyboard.down('Shift');
    await mark(pageA, marks, 'walk-to-door3');
    await pageA.waitForFunction(() => {
      const el = document.querySelector('.memory-island .nearby');
      return !!el && !el.hidden;
    }, null, { timeout: 60_000 }).catch(() => report.errors.push('nearby 面板在 60s 内未出现（未走到门前）'));
    report.drift.nearbyPanelAtDoor = await pageA.evaluate(() => {
      const el = document.querySelector('.memory-island .nearby');
      return { hidden: el.hidden, text: (el.textContent || '').trim().slice(0, 80) };
    });
    report.drift.lastSampleAtDoor = (await pageA.evaluate(() => (window.__sampler ? window.__sampler.samples.slice(-1)[0] : null)));
    await pageA.screenshot({ path: `${OUT}/play-character-at-door.png` });
    await mark(pageA, marks, 'run-east-slope');
    await pageA.waitForTimeout(18_000);
    await pageA.keyboard.up('Shift');
    await pageA.keyboard.up('d');
    await mark(pageA, marks, 'settle-run-east-slope');
    await pageA.waitForTimeout(500);

    await pageA.evaluate(() => { if (window.__sampler) window.__sampler.running = false; });
    const samples = await pageA.evaluate(() => (window.__sampler ? window.__sampler.samples : null));
    if (!samples) report.errors.push('window.__sampler 在读取前消失（页面重载 / 执行上下文换过）');
    report.drift.marks = marks.map(m => ({ t: round(m.t, 1), phase: m.phase }));
    report.drift.markMonotonic = marks.every((m, i) => i === 0 || m.t > marks[i - 1].t);
    report.drift.sampleCount = samples ? samples.length : 0;
    report.drift.sampleWindow = samples && samples.length ? [round(samples[0].tAbs, 1), round(samples[samples.length - 1].tAbs, 1)] : null;
    const phases = samples ? labelPhases(samples, marks) : {};
    if (samples && samples.length) report.drift.global = globalStats(samples);
    report.drift.feetSource = await inspectFeetSource(pageA);
    report.drift.phases = Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, phaseStats(v)]));
    report.drift.overflow = await pageA.evaluate(() => (window.__sampler ? window.__sampler.overflow : 'lost'));
    const firstWalk = (phases['walk-west-free'] || [])[0];
    const lastBack = (phases['walk-east-back'] || []).slice(-1)[0];
    report.drift.outAndBack = firstWalk && lastBack ? {
      start: { x: round(firstWalk.px), z: round(firstWalk.pz), playerY: round(firstWalk.py), recomputedTerrain: round(firstWalk.terrainOnly), modelY: round(firstWalk.modelY), feetY: round(firstWalk.feetY) },
      end: { x: round(lastBack.px), z: round(lastBack.pz), playerY: round(lastBack.py), recomputedTerrain: round(lastBack.terrainOnly), modelY: round(lastBack.modelY), feetY: round(lastBack.feetY) },
      playerYDelta: round(lastBack.py - firstWalk.py, 9),
      terrainDelta: round(lastBack.terrainOnly - firstWalk.terrainOnly, 9),
      xzDelta: round(Math.hypot(lastBack.px - firstWalk.px, lastBack.pz - firstWalk.pz), 6),
    } : null;
    report.geometry = await measureGeometry(pageA);
    await pageA.screenshot({ path: `${OUT}/play-third-person-near-door.png` });
  } else {
    report.errors.push('sampler did not start');
  }
  report.gray.push({ tag: 'A 二次读取（同页）', data: await measureGray(pageA) });
  report.pageHealth = report.pageHealth || {};
  report.pageHealth.A = { navigations: pageA.probeState.navigations, documentRequests: pageA.probeState.documentRequests, consoleTail: pageA.probeState.consoleTail.slice(-25) };
  await pageA.context().close();

  /* —— 页面 B：focusChapter=3（未解锁章节），大视口截图 —— */
  const pageB = await newPage(browser, 'B-fresh-focusCh3', '&focusChapter=3', null, VIEW_SHOT);
  await setupProbe(pageB, 'B-fresh-focusCh3');
  await pageB.waitForTimeout(1500);
  report.gray.push({ tag: 'B 空进度 focusChapter=3', data: await measureGray(pageB) });
  await pageB.screenshot({ path: `${OUT}/gray-locked-chapter3.png` });
  await pageB.context().close();

  /* —— 页面 C：预置进度 [1,2]（ch1/ch2 已完成）—— */
  const pageC = await newPage(browser, 'C-seeded-1-2', '', JSON.stringify([1, 2]), VIEW_SHOT);
  await setupProbe(pageC, 'C-seeded-1-2');
  await pageC.waitForTimeout(1500);
  report.gray.push({ tag: 'C 预置 [1,2]（ch1/ch2 已完成）', data: await measureGray(pageC) });
  await pageC.screenshot({ path: `${OUT}/gray-mixed-chapters-1-2-done.png` });
  report.geometrySeeded = await measureGeometry(pageC);
  await pageC.context().close();

  /* —— 页面 D：focusChapter=1 大视口截图（和 B 同机位、不同进度）—— */
  const pageD = await newPage(browser, 'D-fresh-focusCh1-shot', '&focusChapter=1', null, VIEW_SHOT);
  await setupProbe(pageD, 'D-fresh-focusCh1-shot');
  await pageD.waitForTimeout(1500);
  report.gray.push({ tag: 'D 空进度 focusChapter=1', data: await measureGray(pageD) });
  await pageD.screenshot({ path: `${OUT}/gray-unlocked-chapter1.png` });
  report.pageHealth = {
    D: { navigations: pageD.probeState.navigations, documentRequests: pageD.probeState.documentRequests, consoleTail: pageD.probeState.consoleTail.slice(-15) },
  };
  await pageD.context().close();
} catch (error) {
  report.errors.push('fatal: ' + String(error && error.stack ? error.stack : error));
} finally {
  await browser.close();
}

writeFileSync(`${OUT}/character-grounding-report.json`, JSON.stringify(report, null, 2));

/* ────────────────────────── 打印 ────────────────────────── */
const p = (...a) => console.log(...a);
p('=== pages ===');
for (const pg of report.pages) p(' ', pg.tag, JSON.stringify(pg));
p('\n=== sampler ===', JSON.stringify(report.drift.sampler));
p('input mode:', JSON.stringify(report.drift.inputCheck), 'samples:', report.drift.sampleCount, 'overflow:', report.drift.overflow);
p('marks monotonic:', report.drift.markMonotonic, 'window globals:', JSON.stringify(report.drift.globalsAtBaseline), JSON.stringify(report.drift.globalsBeforeWalk));
p('\n=== drift phases ===');
for (const [name, st] of Object.entries(report.drift.phases || {})) {
  p(' ', name.padEnd(24), JSON.stringify({ n: st.n, span: st.spanSeconds, fps: st.fps, gap: st.feetGap_bboxMinusTerrain, skinGap: st.skinMinusTerrain, eGame: st.gameFeetError, offset: st.modelOffset, residual: st.invariantResidual_modelYEqualsClamp, py: st.playerY, modelY: st.modelY, path: st.path }));
}
p('\n=== 阶段状态（py 什么时候变的）===');
for (const s of (report.drift.stages || [])) p(' ', JSON.stringify(s));
p('\n=== page health ===', JSON.stringify(report.pageHealth, null, 1));
p('\n=== global (所有样本) ===');
const g = report.drift.global || {};
p(JSON.stringify({
  samples: g.samples, feetGap_bboxMinusTerrain_maxAbs: g.feetGap_bboxMinusTerrain_maxAbs, gameFeetError_maxAbs: g.gameFeetError_maxAbs,
  modelOffset: g.modelOffset, reconstructionResidual_maxAbs: g.reconstructionResidual_maxAbs,
  localFeetMin_distinctValues: g.localFeetMin_distinctValues, maxFrameStep_modelY: g.maxFrameStep_modelY,
  playerY: g.playerY, pyVsRecomputedTerrain: g.pyVsRecomputedTerrain,
  skinMinVsTerrain: g.skinMinVsTerrain, skinMinVsPlayerGround: g.skinMinVsPlayerGround,
  terrainReliefCovered: g.terrainReliefCovered, bridgeFlaggedFrames: g.bridgeFlaggedFrames,
}, null, 1));
const an = g.anomalies || {};
p('anomaly counts:', JSON.stringify(Object.fromEntries(Object.entries(an).filter(([k]) => k.endsWith('Count')))));
p('anomaly rows (前几行):');
for (const k of ['modelOffsetNonZero', 'pyDiffersFromTerrain', 'feetMinDiffersFromPy', 'skinBelowGroundOver2cm']) {
  const rows = an[k] || [];
  p(' ', k, rows.length);
  for (const r of rows.slice(0, 6)) p('   ', JSON.stringify(r));
}
p('\n=== 脚底信号来源 ===', JSON.stringify(report.drift.feetSource, null, 1));
p('\n=== nearby 面板 / 门前样本 ===', JSON.stringify(report.drift.nearbyPanelAtDoor), JSON.stringify(report.drift.lastSampleAtDoor && { x: round(report.drift.lastSampleAtDoor.px), z: round(report.drift.lastSampleAtDoor.pz), py: round(report.drift.lastSampleAtDoor.py), terrain: round(report.drift.lastSampleAtDoor.terrainOnly), gap: round(report.drift.lastSampleAtDoor.feetY - report.drift.lastSampleAtDoor.terrainOnly) }));
p('\n=== out and back ===', JSON.stringify(report.drift.outAndBack));
p('\n=== geometry (page A) ===', JSON.stringify(report.geometry, null, 1));
p('\n=== geometry (page C seeded) ===', JSON.stringify(report.geometrySeeded && { character: report.geometrySeeded.character, doors: report.geometrySeeded.doors, lanes: report.geometrySeeded.lanes }, null, 1));
p('\n=== gray ===');
for (const g of report.gray) {
  p(' ', g.tag, JSON.stringify(g.data && {
    totalMaterials: g.data.totalMaterials, hookedCount: g.data.hookedCount,
    hookedValuesByBuilding: g.data.hookedValuesByBuilding, programLevel: g.data.programLevel,
    forcedRender: g.data.forcedRender, characterMaterials: g.data.characterMaterials,
    nonBuildingHooked: g.data.nonBuildingHooked, storage: g.data.localStorageProgress,
  }));
}
p('\n=== errors ===', report.errors.length);
for (const e of report.errors.slice(0, 12)) p(' ', e);
p('\nreport:', `${OUT}/character-grounding-report.json`);
