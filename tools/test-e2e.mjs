import fs from 'node:fs';

const CDP_PORT = 9333;
const GAME_URL = process.env.GAME_URL ?? 'http://localhost:5173';

/**
 * 关卡真源模块的文件名片段：脚本优先从运行中的页面动态 import 它，
 * 直接读 `src/scenes/ForestScene.ts` 顶部导出的 `LAYOUT`（唯一真源，改布局不会让本脚本失真）。
 */
const FOREST_MODULE_HINT = 'ForestScene.ts';

/**
 * ⚠️ 唯一可改处（兜底镜像）：与 `src/scenes/ForestScene.ts` 的 `LAYOUT` 对应。
 * 只有动态 import 失败（dev server 不在 / 模块路径变了）时才会用到；正常路径读的是真源。
 * 真源可读时脚本会按「本脚本真正依赖的坐标」逐项比对两者，不一致会打警告提醒同步
 *（标签文案等非坐标字段变动不算漂移）。
 */
const MIRRORED_LAYOUT = {
  startBeach: { left: 0, right: 280, top: 440 },
  reefs: [
    { standCenter: 420, top: 430, scale: 0.14, label: '初级低礁', role: 'warmup-low' },
    { standCenter: 620, top: 320, scale: 0.165, label: '耸立高礁', role: 'warmup-tall' },
    { standCenter: 830, top: 375, scale: 0.14, label: '低位平礁', role: 'warmup-flat' },
    { standCenter: 1040, top: 235, scale: 0.185, label: '▲ 起跳高台', role: 'gull-launch' },
    { standCenter: 1620, top: 360, scale: 0.17, label: '海心落脚礁', role: 'gull-landing' },
    { standCenter: 1750, top: 300, scale: 0.15, label: '▲ 浪前爬升礁', role: 'wave-climb' },
    { standCenter: 1850, top: 405, scale: 0.24, label: '浪前冲刺礁', role: 'wave-sprint' },
    { standCenter: 2590, top: 360, scale: 0.18, label: '浪后落脚礁', role: 'wave-landing' },
  ],
  gull: { fromX: 1100, toX: 1460, fromY: 145, toY: 165, speed: 95 },
  waves: [
    { id: 'W1', ridgeCenter: 2000, top: 392, amplitude: 12, periodMs: 3200, rollSpeed: 56, rollDistance: 360 }
  ],
  key: { x: 2680, y: 196 },
  landing: { left: 2660, right: 2930, top: 440 },
  door: { openingCenterX: 2680 },
};

async function run() {
  // 1. Get or create target tab
  const tabsRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const tabs = await tabsRes.json();
  const pageTabs = tabs.filter(t => t.type === 'page');
  let target = pageTabs[0];
  if (!target) {
    const newRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`${GAME_URL}/?scene=forest`)}`);
    target = await newRes.json();
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let id = 1;
  const pending = new Map();
  const consoleMessages = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      consoleMessages.push(msg.params);
      const text = msg.params.args?.map(a => a.value ?? a.description ?? '').join(' ');
      if (msg.params.type === 'error') {
        console.error(' [BROWSER ERROR]', text);
      }
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error(' [BROWSER EXCEPTION]', msg.params.exceptionDetails?.text, msg.params.exceptionDetails?.exception?.description);
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = id++;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await new Promise(r => ws.onopen = r);

  await send('Runtime.enable');
  await send('Page.enable');

  // 执行 JS 并拿返回值
  const evalJs = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(`JS Exception: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
    }
    return res.result?.value;
  };

  // 截图辅助
  const captureScreenshot = async (name) => {
    if (process.env.SKIP_E2E_SCREENSHOTS === '1') {
      console.log(` ⏭ 截图跳过: ${name}`);
      return;
    }
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync('screenshots', { recursive: true });
    fs.writeFileSync(`screenshots/${name}.png`, Buffer.from(data, 'base64'));
    console.log(` 📸 截图已保存: screenshots/${name}.png`);
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /** 关卡场景引用（每次求值都取一次，避免 HMR 换场景后拿到旧实例） */
  const sceneJs = `window.__game.scene.getScene('forest')`;

  /**
   * 泛化轮询：表达式必须返回 `{ ok: boolean, ...观测 }`，ok 为真即通过；
   * 超时抛出最后一次观测（含异常信息），失败原因一眼可见。
   */
  const waitFor = async (expression, { label, timeoutMs = 6000, intervalMs = 60 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        last = await evalJs(expression);
        if (last && last.ok) return last;
      } catch (error) {
        lastError = error;
      }
      await sleep(intervalMs);
    }
    throw new Error(
      `等待超时（${timeoutMs}ms）: ${label || expression}\n最后观测: ${JSON.stringify(last)}` +
      (lastError ? `\n最后异常: ${lastError.message}` : ''),
    );
  };

  console.log('--- 1. 导航到森林场景并读取关卡真源 ForestScene.LAYOUT ---');
  /** 等待场景加载完成且 player 创建完毕 */
  const waitReady = async () => {
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        const isReady = await evalJs(`Boolean(window.__game?.scene?.getScene('forest')?.player?.sprite)`);
        if (isReady) return true;
      } catch (e) {
        // 等待执行上下文就绪
      }
    }
    return false;
  };

  await send('Page.navigate', { url: `${GAME_URL}/?scene=forest` });
  await sleep(1000);
  if (!await waitReady()) throw new Error('场景加载超时！');

  // 第一关进度会存档（seek-life-chapter-one*）：把「钥匙/门」两项改回未完成再重载，
  // 保证是「全新一轮」——否则上一轮留下的 forestKeyCollected=true 会让门楣钥匙 / 开门步骤假通过。
  // 只改第一关字段，房间解谜进度/分数照旧保留。
  const restored = await evalJs(`(() => {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith('seek-life-chapter-one') || k.startsWith('seek-chapter-one-room'));
    if (!keys.length) return [];
    const changed = [];
    for (const key of keys) {
      let data;
      try {
        data = JSON.parse(localStorage.getItem(key));
      } catch (error) {
        changed.push({ key, invalid: true });
        continue;
      }
      if (!data || typeof data !== 'object') {
        changed.push({ key, invalid: true });
        continue;
      }
      const before = { forestKeyCollected: data.forestKeyCollected, forestDoorEntered: data.forestDoorEntered, lives: data.lives };
      data.forestKeyCollected = false;
      data.forestDoorEntered = false;
      if (!(typeof data.lives === 'number' && data.lives >= 2)) data.lives = 3;
      localStorage.setItem(key, JSON.stringify(data));
      changed.push({ key, before, after: { forestKeyCollected: false, forestDoorEntered: false, lives: data.lives } });
    }
    return changed;
  })()`);
  if (Array.isArray(restored) && restored.length) {
    for (const item of restored) {
      if (!item.invalid) {
        console.log(` 存档「${item.key}」已把第一关两项改回未完成: ${JSON.stringify(item.before)} → ${JSON.stringify(item.after)}`);
      }
    }
  }
  // 无论如何都重载一次：确保上面的修正对当前页面生效
  await send('Page.navigate', { url: `${GAME_URL}/?scene=forest` });
  await sleep(1000);
  if (!await waitReady()) throw new Error('场景重载超时！');

  // 从页面里动态 import 已加载的 ForestScene 模块，拿关卡真源 LAYOUT
  const layoutProbe = await evalJs(`(async () => {
    const urls = (performance.getEntriesByType('resource') || []).map((e) => e.name);
    const url = urls.find((n) => n.includes(${JSON.stringify(FOREST_MODULE_HINT)})) || '/src/scenes/ForestScene.ts';
    try {
      const mod = await import(url);
      if (!mod || !mod.LAYOUT) return { source: url, error: '模块未导出 LAYOUT' };
      return { source: url, layout: JSON.parse(JSON.stringify(mod.LAYOUT)) };
    } catch (error) {
      return { source: url, error: String((error && error.message) || error) };
    }
  })()`);

  /** 只比对本脚本真正依赖的坐标/数值（标签等文案变动不算漂移） */
  const layoutProjection = (l) => JSON.stringify({
    startBeach: [l.startBeach.left, l.startBeach.right, l.startBeach.top],
    reefs: l.reefs.map((r) => [r.role, r.standCenter, r.top, r.scale]),
    gull: [l.gull.fromX, l.gull.toX, l.gull.fromY, l.gull.toY, l.gull.speed],
    waves: l.waves.map((w) => [w.id, w.ridgeCenter, w.top, w.amplitude, w.periodMs, w.rollSpeed, w.rollDistance]),
    key: [l.key.x, l.key.y],
    landing: [l.landing.left, l.landing.right, l.landing.top],
    door: [l.door.openingCenterX],
  });

  let LAYOUT = layoutProbe?.layout ?? null;
  if (LAYOUT) {
    console.log(` 关卡真源: 浏览器内 import("${layoutProbe.source}") 成功`);
    if (layoutProjection(LAYOUT) !== layoutProjection(MIRRORED_LAYOUT)) {
      console.warn(' ⚠️ 文件内镜像 LAYOUT 与真源坐标不一致 → 仅影响兜底路径，请同步 tools/test-e2e.mjs 的 MIRRORED_LAYOUT');
      console.warn(`    真源: ${layoutProjection(LAYOUT)}`);
      console.warn(`    镜像: ${layoutProjection(MIRRORED_LAYOUT)}`);
    }
  } else {
    LAYOUT = MIRRORED_LAYOUT;
    console.warn(` ⚠️ 无法读取 ForestScene.LAYOUT（${layoutProbe?.error}）→ 回退文件内镜像常量`);
  }

  /** 按 role 查礁石（禁止数组下标：布局增删时下标会错位） */
  const reef = (role) => {
    const found = LAYOUT.reefs.find((r) => r.role === role);
    if (!found) throw new Error(`LAYOUT.reefs 缺少 role=${role}`);
    return found;
  };
  /** 按 id 查浪 */
  const wave = (id) => {
    const found = LAYOUT.waves.find((w) => w.id === id);
    if (!found) throw new Error(`LAYOUT.waves 缺少 id=${id}`);
    return found;
  };

  // —— 阶段 3 布局自检（真源里必须成立的硬事实）——
  const launchReef = reef('gull-launch');
  const seaReef = reef('gull-landing');
  const climbReef = reef('wave-climb');
  const sprintReef = reef('wave-sprint');
  const waveLandingReef = reef('wave-landing');
  const runResumeReef = reef('warmup-low');
  // 验证滚浪将角色送到反馈指定的浪后实体礁石。
  const waveEscapeReef = waveLandingReef;
  const W1 = wave('W1');
  if (LAYOUT.waves.length !== 1) {
    throw new Error(`阶段 3 期望仅有一朵滚浪，LAYOUT.waves 长度=${LAYOUT.waves.length}`);
  }
  if (climbReef.top >= seaReef.top) {
    throw new Error(`浪前爬升礁未高于海心落脚礁（${climbReef.top} vs ${seaReef.top}），阶段 3 的加难爬升段缺失`);
  }
  // 钥匙必须钉在门楣（门上方）：与门开口中心 x 对齐，且明显高于右岸地面
  if (Math.abs(LAYOUT.key.x - LAYOUT.door.openingCenterX) > 40) {
    throw new Error(`钥匙不在门楣上：key.x=${LAYOUT.key.x} 与 door.openingCenterX=${LAYOUT.door.openingCenterX} 偏差过大`);
  }
  if (LAYOUT.key.y > LAYOUT.landing.top - 120) {
    throw new Error(`钥匙高度 ${LAYOUT.key.y} 未明显高于右岸地面 ${LAYOUT.landing.top}，站着就能拿到`);
  }
  console.log(` 布局: 世界右缘 ${LAYOUT.landing.right} · 礁石 ${LAYOUT.reefs.length} 块 · 滚浪 ${LAYOUT.waves.map(w => `${w.id}@${w.ridgeCenter}(top ${w.top}, roll ${w.rollDistance}px)`) .join(' / ')}`);
  console.log(` 门楣金钥匙: (${LAYOUT.key.x}, ${LAYOUT.key.y}) · 石门开口中心 ${LAYOUT.door.openingCenterX}`);

  console.log('--- 2. 验证年年角色出生在第一块低礁并进入待机 ---');
  // 起始点直接在第一块礁石上方 45px，等物理落地后验证站立面和横坐标。
  const startReef = reef('warmup-low');
  const idleState = await waitFor(`(() => {
    const s = ${sceneJs};
    const expectedX = ${startReef.standCenter};
    const expectedY = ${startReef.top - 36};
    return {
      ok: s.player.state === 'idle' && s.player.body.onFloor()
        && Math.abs(s.player.view.x - expectedX) < 8
        && Math.abs(s.player.view.y - expectedY) < 14,
      state: s.player.state,
      x: Math.round(s.player.view.x),
      expectedX,
      y: Math.round(s.player.view.y),
      expectedY,
      onFloor: s.player.body.onFloor(),
    };
  })()`, { label: '韩梅梅出生并站在第一块低礁上', timeoutMs: 3000 });
  console.log('开场状态:', JSON.stringify(idleState));
  const textureInfo = await evalJs(`(() => {
    const g = window.__game;
    const s = g.scene.getScene('forest');
    const range = (key) => {
      const anim = s.anims.get(key);
      if (!anim) return null;
      const nums = anim.frames.map((f) => Number(f.frame.name)).sort((a, b) => a - b);
      return { key, min: nums[0], max: nums[nums.length - 1] };
    };
    return {
      runTextureExists: s.textures.exists('char-niannian-run'),
      jumpTextureExists: s.textures.exists('char-niannian-jump'),
      grabTextureExists: s.textures.exists('char-niannian-grab'),
      runAnimExists: s.anims.exists('niannian-run'),
      grabReachAnimExists: s.anims.exists('niannian-grab-reach'),
      grabHangAnimExists: s.anims.exists('niannian-grab-hang'),
      reachRange: range('niannian-grab-reach'),
      hangRange: range('niannian-grab-hang'),
      idleSheet: s.player.view.list[1].texture.key,
      idleFrame: s.player.view.list[1].frame.name,
      playerState: s.player.state,
      activeTexture: s.player.sprite.texture.key,
      frameWidth: s.player.sprite.width,
      frameHeight: s.player.sprite.height,
      boxWidth: s.player.body.width,
      boxHeight: s.player.body.height,
    };
  })()`);
  console.log('纹理与规格信息:', JSON.stringify(textureInfo, null, 2));

  if (!textureInfo.runTextureExists || !textureInfo.jumpTextureExists || !textureInfo.grabTextureExists) {
    throw new Error('年年三套 16 帧纹理未全量加载！');
  }
  if (!textureInfo.runAnimExists || !textureInfo.grabReachAnimExists || !textureInfo.grabHangAnimExists) {
    throw new Error('年年角色动画未正确注册！');
  }
  if (textureInfo.playerState !== 'idle') {
    throw new Error(`场景开场角色应处于 idle，当前: ${textureInfo.playerState}`);
  }

  await captureScreenshot('test-niannian-idle-verified');

  console.log('--- 3. 验证奔跑状态与动画循环播放 ---');
  const runInfo = await evalJs(`new Promise(resolve => {
    const s = ${sceneJs};
    // 起始礁较窄，先放到宽岸面做纯动画采样，避免测试本身跑出平台触发 fall。
    s.player.teleportTo(${LAYOUT.startBeach.left + 140}, ${LAYOUT.startBeach.top - 36});
    setTimeout(() => s.player.setTouchMove(1), 80);
    setTimeout(() => {
      resolve({
        isPlaying: s.player.sprite.anims.isPlaying,
        currentAnim: s.player.sprite.anims.currentAnim?.key,
        frameName: s.player.sprite.frame.name,
        state: s.player.state,
        onFloor: s.player.body.onFloor(),
        playerX: Math.round(s.player.view.x),
        vx: s.player.body.velocity.x,
      });
    }, 230);
  })`);
  console.log('奔跑动画状态:', JSON.stringify(runInfo, null, 2));
  if (!runInfo.isPlaying || runInfo.currentAnim !== 'niannian-run') {
    throw new Error('奔跑动画未能正常循环播放！');
  }
  if (runInfo.state !== 'run') {
    throw new Error(`按住方向键时 Player.state 应为 run，当前: ${runInfo.state}`);
  }
  if (!runInfo.onFloor) {
    throw new Error(`奔跑动画采样窗口不应长到让角色跑出出生礁：${JSON.stringify(runInfo)}`);
  }
  await captureScreenshot('test-niannian-run-verified');

  console.log('--- 4. 验证跳跃空中姿势与上升/下落分段 ---');
  // 上升段必须走「真实跳跃输入」：直接 body.setVelocityY(-550) 绕过了 Player 的起跳通路，
  // 既不会置 airFromJump，也会被 dropFrame（走落取帧）接管 → 帧号落在 9~11，断言失真。
  const jumpInfo = await evalJs(`new Promise(resolve => {
    const s = ${sceneJs};
    s.player.setTouchMove(0);
    s.player.teleportTo(${LAYOUT.startBeach.left + 120}, ${LAYOUT.startBeach.top - 40});
    setTimeout(() => {
      s.player.pressTouchJump(true);
      setTimeout(() => {
        const p = s.player;
        const sample = {
          onFloor: p.body.onFloor(),
          vy: Math.round(p.body.velocity.y),
          state: p.state,
          airFromJump: Boolean(p.airFromJump),
          textureKey: p.sprite.texture.key,
          frameName: p.sprite.frame.name,
        };
        p.pressTouchJump(false);
        resolve(sample);
      }, 60);
    }, 150);
  })`);
  console.log('跳跃上升姿势状态:', JSON.stringify(jumpInfo, null, 2));
  if (jumpInfo.state !== 'jump') {
    throw new Error(`上升中 Player.state 应为 jump，当前: ${jumpInfo.state}`);
  }
  if (!jumpInfo.airFromJump) {
    throw new Error('起跳未走 Player 的跳跃通路（airFromJump=false）：请用跳跃输入而不是直接注入速度');
  }
  if (jumpInfo.textureKey !== 'char-niannian-jump' || Number(jumpInfo.frameName) < 4 || Number(jumpInfo.frameName) > 8) {
    throw new Error(`跳跃上升帧未落在 4~8 帧（蹬地→上升→顶点）！当前帧: ${jumpInfo.frameName}`);
  }
  await captureScreenshot('test-niannian-jump-rising-verified');

  // 下落段同样走真实跳跃：同一次起跳里一直等到「下落且已加速」再采样
  const fallInfo = await evalJs(`new Promise(resolve => {
    const s = ${sceneJs};
    s.player.setTouchMove(0);
    s.player.teleportTo(${LAYOUT.startBeach.left + 120}, ${LAYOUT.startBeach.top - 40});
    setTimeout(() => {
      s.player.pressTouchJump(true);
      const t0 = Date.now();
      const tick = () => {
        const p = s.player;
        if ((p.state === 'fall' && p.body.velocity.y > 150) || Date.now() - t0 > 3000) {
          const sample = {
            onFloor: p.body.onFloor(),
            vy: Math.round(p.body.velocity.y),
            state: p.state,
            airFromJump: Boolean(p.airFromJump),
            textureKey: p.sprite.texture.key,
            frameName: p.sprite.frame.name,
          };
          p.pressTouchJump(false);
          resolve(sample);
          return;
        }
        setTimeout(tick, 8);
      };
      setTimeout(tick, 40);
    }, 150);
  })`);
  console.log('跳跃下落姿势状态:', JSON.stringify(fallInfo, null, 2));
  if (fallInfo.state !== 'fall') {
    throw new Error(`下落中 Player.state 应为 fall，当前: ${fallInfo.state}`);
  }
  // 下落段用同一次跳跃的惯性，airFromJump 仍为 true → 走 airFrame 取帧（9~11 与 dropFrame 同区间）
  if (!fallInfo.airFromJump) {
    throw new Error('下落姿势应来自同一次起跳（airFromJump=true）');
  }
  if (fallInfo.textureKey !== 'char-niannian-jump' || Number(fallInfo.frameName) < 9 || Number(fallInfo.frameName) > 11) {
    throw new Error(`跳跃下落帧未落在 9~11 帧（下落→伸脚）！当前帧: ${fallInfo.frameName}`);
  }
  await captureScreenshot('test-niannian-jump-falling-verified');

  console.log(`--- 5. 验证登上起跳高台 (${launchReef.label}, x=${launchReef.standCenter}, top=${launchReef.top}) ---`);
  const perchInfo = await waitFor(`(() => {
    const s = ${sceneJs};
    s.player.setTouchMove(0);
    if (Math.abs(s.player.view.x - ${launchReef.standCenter}) > 6) {
      s.player.teleportTo(${launchReef.standCenter}, ${launchReef.top - 40});
    }
    return {
      ok: s.player.body.onFloor() && s.player.state === 'idle',
      playerX: Math.round(s.player.view.x),
      playerY: Math.round(s.player.view.y),
      checkpoint: Math.round(s.checkpoint.x),
      gullFeetX: Math.round(s.gullFeetX),
      gullFeetY: Math.round(s.gullFeetY),
      expectedY: ${launchReef.top - 36},
    };
  })()`, { label: '角色站上起跳高台' });
  console.log('高台状态:', JSON.stringify(perchInfo, null, 2));
  if (Math.abs(perchInfo.playerY - perchInfo.expectedY) > 10) {
    throw new Error(`未站在高台顶面上：y=${perchInfo.playerY} 期望 ≈${perchInfo.expectedY}`);
  }
  if (perchInfo.checkpoint !== launchReef.standCenter) {
    throw new Error(`安全点未推进到起跳高台：checkpoint=${perchInfo.checkpoint} 期望 ${launchReef.standCenter}`);
  }
  await captureScreenshot('test-niannian-on-high-cliff');

  console.log('--- 6. 验证跳起触碰海鸥自动抓牢 (char-niannian-grab 悬挂动画) ---');
  const grabInfo = await evalJs(`new Promise(resolve => {
    const s = ${sceneJs};
    s.player.teleportTo(s.gullFeetX, s.gullFeetY + 10);
    const t0 = performance.now();
    const tick = () => {
      if (s.player.attached) {
        resolve({
          attached: true,
          textureKey: s.player.sprite.texture.key,
          frameName: Number(s.player.sprite.frame.name),
          animKey: s.player.sprite.anims.currentAnim?.key ?? null,
          gullPrompt: s.gullPrompt.text,
          status: s.statusText.text,
        });
        return;
      }
      if (performance.now() - t0 > 2000) {
        resolve({ attached: false, animKey: null, frameName: null, textureKey: null });
        return;
      }
      setTimeout(tick, 6);
    };
    tick();
  })`);
  console.log('海鸥抓取状态:', JSON.stringify(grabInfo, null, 2));
  if (!grabInfo.attached || grabInfo.textureKey !== 'char-niannian-grab') {
    throw new Error('海鸥触碰未触发自动抓牢或未切换抓取姿势！');
  }
  if (!grabInfo.status.includes('抓住海鸥') || !grabInfo.status.includes('按空格甩出')) {
    throw new Error(`抓牢后应明确提示已抓住及如何甩出：${grabInfo.status}`);
  }
  // 上伸帧区间从运行中的动画注册里读（不再写死帧号，改动 GRAB_REACH/HANG 常量不会让断言失真）
  const { reachRange, hangRange } = textureInfo;
  if (grabInfo.animKey !== reachRange.key) {
    throw new Error(`抓牢瞬间应播「上伸」动画 ${reachRange.key}，当前: ${grabInfo.animKey}`);
  }
  if (grabInfo.frameName < reachRange.min || grabInfo.frameName > reachRange.max) {
    throw new Error(`抓牢瞬间帧应落在上伸区间 ${reachRange.min}~${reachRange.max}！当前帧: ${grabInfo.frameName}`);
  }
  await captureScreenshot('test-niannian-grab-seagull-verified');

  // 上伸序列播完应自动转入悬挂摆动循环
  const hangInfo = await waitFor(`(() => {
    const s = ${sceneJs};
    return {
      ok: s.player.sprite.anims.currentAnim?.key === ${JSON.stringify(hangRange.key)} && s.player.sprite.anims.isPlaying,
      animKey: s.player.sprite.anims.currentAnim?.key ?? null,
      frameName: Number(s.player.sprite.frame.name),
      isPlaying: s.player.sprite.anims.isPlaying,
      gripY: s.player.sprite.originY.toFixed(3),
    };
  })()`, { label: '抓牢后转入悬挂循环', timeoutMs: 3000, intervalMs: 50 });
  console.log('悬挂循环状态:', JSON.stringify(hangInfo, null, 2));
  if (hangInfo.frameName < hangRange.min || hangInfo.frameName > hangRange.max) {
    throw new Error(`悬挂循环帧应落在 ${hangRange.min}~${hangRange.max}！当前帧: ${hangInfo.frameName}`);
  }

  console.log(`--- 7. 验证飞渡大洋松手降落至海心落脚礁 (${seaReef.label}, x=${seaReef.standCenter}) ---`);
  const releaseInfo = await waitFor(`(() => {
    const s = ${sceneJs};
    s.player.releaseVine();
    s.player.setTouchMove(0);
    if (Math.abs(s.player.view.x - ${seaReef.standCenter}) > 6) {
      s.player.teleportTo(${seaReef.standCenter}, ${seaReef.top - 40});
    }
    return {
      ok: s.player.body.onFloor() && !s.player.attached,
      playerX: Math.round(s.player.view.x),
      playerY: Math.round(s.player.view.y),
      attached: Boolean(s.player.attached),
      checkpoint: Math.round(s.checkpoint.x),
      expectedY: ${seaReef.top - 36},
    };
  })()`, { label: '松手后落到海心落脚礁' });
  console.log('海心着陆状态:', JSON.stringify(releaseInfo, null, 2));
  if (Math.abs(releaseInfo.playerY - releaseInfo.expectedY) > 10) {
    throw new Error(`未落在海心落脚礁顶面上：y=${releaseInfo.playerY} 期望 ≈${releaseInfo.expectedY}`);
  }
  await captureScreenshot('test-niannian-midsea-landing');

  // 回归：抓住海鸥（循环动画在播）之后再回地面，必须能恢复跑步动画与 run 状态。
  // 旧实现用 sprite.play(key, true)（ignoreIfPlaying），在已有循环动画在播时会被整段
  // 忽略，而 currentAnim 已写成 'niannian-run' → 角色卡在抓取帧上原地滑行（"不动了/不流畅"）。
  // 注意：Phaser 的 anims.stop() 不会清空 anims.currentAnim，断言必须读 Player.currentAnim
  // 与 sprite.texture.key；落点取前段低礁（远离右侧石门触发区）避免被门区状态机干扰。
  console.log(`--- 8. 验证松手回地面恢复跑步不回归（${runResumeReef.label} ${runResumeReef.standCenter}） ---`);
  const resumeInfo = await evalJs(`new Promise(resolve => {
    const s = ${sceneJs};
    const p = s.player;
    p.teleportTo(${runResumeReef.standCenter}, ${runResumeReef.top - 40});
    p.setTouchMove(1);
    const t0 = Date.now();
    const tick = () => {
      const onFloor = p.body.onFloor();
      const moving = Math.abs(p.body.velocity.x) > 150;
      const timedOut = Date.now() - t0 > 5000;
      if ((onFloor && moving) || timedOut) {
        p.setTouchMove(0);
        resolve({
          onFloor, moving, timedOut,
          attached: p.attached !== null,
          playerState: p.state,
          currentAnim: p.currentAnim,
          textureKey: p.sprite.texture.key,
          frameName: p.sprite.frame.name,
          animPlaying: p.sprite.anims.isPlaying,
        });
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  })`);
  console.log('松手后恢复跑步状态:', JSON.stringify(resumeInfo, null, 2));
  if (resumeInfo.attached) {
    throw new Error('松手后仍处于挂藤状态！');
  }
  if (resumeInfo.currentAnim !== 'niannian-run' || !resumeInfo.animPlaying) {
    throw new Error(`松手回地面后未恢复跑步动画（卡帧回归）！当前: ${resumeInfo.currentAnim} playing=${resumeInfo.animPlaying}`);
  }
  if (resumeInfo.textureKey !== 'char-niannian-run' || resumeInfo.playerState !== 'run') {
    throw new Error(`松手回地面后未回到 run 状态/贴图！当前: ${resumeInfo.textureKey} / ${resumeInfo.playerState}`);
  }
  await captureScreenshot('test-niannian-run-resumed-after-grab');

  console.log(`--- 9. 验证浪前攀爬段与浪后实体落脚礁 (${climbReef.label} ${climbReef.standCenter} → ${sprintReef.label} ${sprintReef.standCenter} → ${waveLandingReef.standCenter}) ---`);
  for (const target of [climbReef, sprintReef]) {
    const stand = await waitFor(`(() => {
      const s = ${sceneJs};
      s.player.setTouchMove(0);
      if (Math.abs(s.player.view.x - ${target.standCenter}) > 6) {
        s.player.teleportTo(${target.standCenter}, ${target.top - 40});
      }
      return {
        ok: s.player.body.onFloor() && s.player.state === 'idle',
        role: ${JSON.stringify(target.role)},
        playerX: Math.round(s.player.view.x),
        playerY: Math.round(s.player.view.y),
        expectedX: ${target.standCenter},
        expectedY: ${target.top - 36},
        checkpoint: Math.round(s.checkpoint.x),
        status: s.statusText.text,
      };
    })()`, { label: `站上 ${target.role} 礁石` });
    console.log(`  ${stand.role}:`, JSON.stringify(stand));
    if (Math.abs(stand.playerY - stand.expectedY) > 10) {
      throw new Error(`${target.role} 顶面站位不对：y=${stand.playerY} 期望 ≈${stand.expectedY}`);
    }
    // 安全点由 LAYOUT 派生的站位序列递进（阶段 3 新写法：filter(standCenter <= x + 40).pop()）
    if (stand.checkpoint !== target.standCenter) {
      throw new Error(`${target.role} 未推进安全点：checkpoint=${stand.checkpoint} 期望 ${target.standCenter}`);
    }
  }
  const climbDelta = seaReef.top - climbReef.top;
  console.log(` 浪前爬升段落差: 海心落脚礁 ${seaReef.top} → 爬升礁 ${climbReef.top}（${climbDelta}px）`);
  if (climbDelta < 60) {
    throw new Error(`浪前爬升落差只有 ${climbDelta}px，未体现「再加一点难度、要爬一下」`);
  }
  await captureScreenshot('test-niannian-wave-climb');

  console.log(`--- 10. 验证滚浪限时平台 (${W1.id}@${W1.ridgeCenter})：踩上被托着前移 → 撤到 ${waveEscapeReef.label} → 浪散不扣命 ---`);
  // 浪实体契约自检：阶段 3 的浪必须有 state 状态机（idle/rolling/dissolving/gone）
  const waveContract = await evalJs(`(() => {
    const s = ${sceneJs};
    const list = s.waves || [];
    return {
      count: list.length,
      hasState: list.every((w) => typeof w.state === 'string'),
      states: list.map((w) => w.state ?? null),
      centers: list.map((w) => Math.round(w.body.x + w.body.width / 2)),
      halfWidths: list.map((w) => w.body.width / 2),
    };
  })()`);
  console.log('浪实体契约:', JSON.stringify(waveContract));
  if (waveContract.count !== LAYOUT.waves.length) {
    throw new Error(`浪实体数量 ${waveContract.count} 与 LAYOUT.waves 长度 ${LAYOUT.waves.length} 不一致`);
  }
  if (!waveContract.hasState) {
    throw new Error('海浪实体缺少 state 字段（阶段 3 契约: idle/rolling/dissolving/gone）');
  }
  if (waveContract.states.some((s) => s !== 'idle')) {
    throw new Error(`未接触前所有浪应处于 idle，当前: ${JSON.stringify(waveContract.states)}`);
  }
  const [w1Center] = waveContract.centers;
  if (Math.abs(w1Center - W1.ridgeCenter) > 3) {
    throw new Error(`浪体中心 ${JSON.stringify(waveContract.centers)} 与 LAYOUT ${W1.ridgeCenter} 不符`);
  }

  const w1Index = await evalJs(`(() => {
    const s = ${sceneJs};
    const list = s.waves || [];
    let index = list.findIndex((w) => w.id === ${JSON.stringify(W1.id)});
    if (index < 0) index = list.findIndex((w) => Math.abs(w.body.x + w.body.width / 2 - ${W1.ridgeCenter}) < 12);
    return index;
  })()`);
  if (w1Index < 0) throw new Error(`未能在 s.waves 里定位 ${W1.id}`);

  // 落点用浪体“当前”中心（滚动中会右移）：离浪 >30px 或高于浪面 60px 才重新放一次，
  // 避免轮询把被托着前移的角色反复传送回起点
  const rideState = await waitFor(`(() => {
    const s = ${sceneJs};
    const w = s.waves[${w1Index}];
    const center = w.body.x + w.body.width / 2;
    s.player.setTouchMove(0);
    if (Math.abs(s.player.view.x - center) > 30 || s.player.view.y < w.body.y - 60) {
      s.player.teleportTo(center, w.body.y - 40);
    }
    return {
      ok: w.state === 'rolling' && s.player.body.onFloor(),
      waveState: w.state,
      onFloor: s.player.body.onFloor(),
      playerX: Math.round(s.player.view.x),
      waveCenter: Math.round(center),
      playerY: Math.round(s.player.view.y),
      expectedY: ${W1.top - 36},
      lives: s.progress.lives,
      status: s.statusText.text,
    };
  })()`, { label: `${W1.id} 进入 rolling 且角色站在浪上`, timeoutMs: 4000 });
  console.log('踩浪状态:', JSON.stringify(rideState, null, 2));
  if (Math.abs(rideState.playerY - rideState.expectedY) > 26) {
    throw new Error(`未站在浪脊上：y=${rideState.playerY} 期望 ≈${rideState.expectedY}`);
  }

  // 浪体前移会把角色一起托走：500ms 内位移应接近 rollSpeed × 0.5s。
  const carryInfo = await evalJs(`new Promise(resolve => {
    const s = ${sceneJs};
    const w = s.waves[${w1Index}];
    const x0 = s.player.view.x;
    const samples = [];
    const timer = setInterval(() => samples.push({
      onFloor: s.player.body.onFloor(),
      state: s.player.state,
      gap: s.player.view.body.bottom - w.body.y,
      playerY: s.player.view.y,
      waveY: w.body.y,
    }), 16);
    setTimeout(() => {
      clearInterval(timer);
      resolve({
        dx: s.player.view.x - x0,
        onFloor: s.player.body.onFloor(),
        waveState: w.state,
        lives: s.progress.lives,
        samples: samples.length,
        airborneSamples: samples.filter(sample => !sample.onFloor).length,
        airborneStates: samples.filter(sample => sample.state === 'jump' || sample.state === 'fall').length,
        maxAbsGap: Math.max(0, ...samples.map(sample => Math.abs(sample.gap))),
        playerYRange: Math.max(...samples.map(sample => sample.playerY)) - Math.min(...samples.map(sample => sample.playerY)),
        waveYRange: Math.max(...samples.map(sample => sample.waveY)) - Math.min(...samples.map(sample => sample.waveY)),
      });
    }, 500);
  })`);
  console.log('滚浪托举状态:', JSON.stringify(carryInfo, null, 2));
  if (carryInfo.waveState !== 'rolling') {
    throw new Error(`托举期间滚浪应保持 rolling：state=${carryInfo.waveState}`);
  }
  if (carryInfo.dx < 5 || carryInfo.dx > 45) {
    throw new Error(`滚浪未把角色托着前移（500ms 位移 ${carryInfo.dx.toFixed(1)}px，期望 ≈${W1.rollSpeed * 0.5}px）`);
  }
  // 接触浪面的首个物理帧允许一次落地过渡；连续抖动才是回归（旧实现 18/31 帧离地）。
  if (carryInfo.airborneSamples > 1 || carryInfo.airborneStates > 1) {
    throw new Error(`角色骑浪期间不应反复离地/切跳跃帧：${JSON.stringify(carryInfo)}`);
  }
  if (carryInfo.playerYRange > 2 || carryInfo.waveYRange > 1 || carryInfo.maxAbsGap > 8) {
    throw new Error(`滚动浪面与角色脚底应保持稳定贴合：${JSON.stringify(carryInfo)}`);
  }
  await captureScreenshot('test-niannian-wave-ride');

  // 基准取「已经骑上浪之后」的血量：骑浪靠 teleport 反复摆位，摆位过程本身可能先掉一次海，
  // 用骑浪前的血量当基准会把「摆位时掉了一次」误报成「撤离失败仍被扣命」
  const livesAfterRide = carryInfo.lives;

  // 在消散前撤离到浪后实体落脚礁：浪继续滚完 → gone，且全程不扣命。
  // 关键：撤离后不要每帧再 teleport 到陆地，否则角色永远不在浪上，浪不会继续滚。
  const escapeInfo = await evalJs(`new Promise(resolve => {
    const s = ${sceneJs};
    const w = s.waves[${w1Index}];
    s.player.setTouchMove(0);
    s.player.teleportTo(${waveEscapeReef.standCenter}, ${waveEscapeReef.top - 40});
    // W1 完整周期约 6.43s(滚动) + 0.9s(消散)；再留 700ms 缓冲。
    // 注意：当玩家已回到浪左后方时，gone 会被 resetWavesLeftBehind() 立即复位到 idle。
    setTimeout(() => {
      resolve({
        ok: s.player.body.onFloor() && s.progress.lives === ${livesAfterRide} && (w.state === 'gone' || w.state === 'idle'),
        waveState: w.state,
        onFloor: s.player.body.onFloor(),
        lives: s.progress.lives,
        expectedLives: ${livesAfterRide},
        rolled: Number(w.rolled ?? 0),
        expectedRoll: ${W1.rollDistance},
        levelClockMs: Number(s.levelClockMs ?? -1),
        modalOpen: Boolean(s.gameHud?.isModalOpen?.()),
        helpOpen: Boolean(s.helpModal),
        playerX: Math.round(s.player.view.x),
        playerY: Math.round(s.player.view.y),
      });
    }, 8000);
  })`);
  console.log('撤离后浪体状态:', JSON.stringify(escapeInfo, null, 2));
  if (!escapeInfo.ok) {
    throw new Error(`${W1.id} 撤离校验失败: ${JSON.stringify(escapeInfo)}`);
  }
  if (escapeInfo.lives !== livesAfterRide) {
    throw new Error(`撤离成功仍被扣命：${livesAfterRide} → ${escapeInfo.lives}`);
  }
  await captureScreenshot('test-niannian-wave-landing-reef');

  console.log(`--- 11. 验证踩浪不跳 → 浪散落水重生（${W1.id}@${W1.ridgeCenter}） ---`);
  // 生命数归一化到 3：保证走的是普通扣命分支（1 命时会是「生命耗尽」文案，属另一条线）
  const preDissolve = await evalJs(`(() => {
    const s = ${sceneJs};
    if (s.progress.lives !== 3) s.applyProgressEvent({ type: 'lives-changed', lives: 3 });
    return { lives: s.progress.lives, checkpointX: Math.round(s.checkpoint.x) };
  })()`);
  console.log('浪散测试前置:', JSON.stringify(preDissolve));

  const dissolveRide = await waitFor(`(() => {
    const s = ${sceneJs};
    const w = s.waves[${w1Index}];
    if (w.state === 'gone') s.resetWaves();
    const center = w.body.x + w.body.width / 2;
    s.player.setTouchMove(0);
    if (w.state === 'idle' && (Math.abs(s.player.view.x - center) > 30 || s.player.view.y < w.body.y - 60)) {
      s.player.teleportTo(center, w.body.y - 40);
    }
    return {
      ok: w.state === 'rolling' && s.player.body.onFloor(),
      waveState: w.state,
      onFloor: s.player.body.onFloor(),
      playerX: Math.round(s.player.view.x),
      waveCenter: Math.round(center),
      lives: s.progress.lives,
    };
  })()`, { label: `${W1.id} 再次进入 rolling 且角色站在浪上`, timeoutMs: 4000 });
  console.log('再次踩唯一滚浪状态:', JSON.stringify(dissolveRide, null, 2));

  // 浪滚到尽头开始消散 —— 这一刻截图（浪花粒子 + alpha 淡出）
  const dissolving = await waitFor(`(() => {
    const s = ${sceneJs};
    const w = s.waves[${w1Index}];
    return { ok: w.state === 'dissolving', waveState: w.state, playerY: Math.round(s.player.view.y) };
  })()`, { label: `${W1.id} 进入 dissolving`, timeoutMs: 7500 });
  console.log('浪体消散状态:', JSON.stringify(dissolving, null, 2));
  await captureScreenshot('test-niannian-wave-dissolve');

  // 以真正站上第二次滚浪后的生命数为准；摆位 teleport 可能先触发一次落水重生。
  const livesAtWave = dissolveRide.lives;
  const expectedLives = livesAtWave - 1 <= 0 ? 3 : livesAtWave - 1;
  const dissolved = await waitFor(`(() => {
    const s = ${sceneJs};
    return {
      ok: s.progress.lives === ${expectedLives} && s.statusText.text.includes('浪散了'),
      lives: s.progress.lives,
      expectedLives: ${expectedLives},
      status: s.statusText.text,
      playerY: Math.round(s.player.view.y),
      w1State: s.waves[${w1Index}].state,
      onFloor: s.player.body.onFloor(),
    };
  })()`, { label: `浪散落水后重生（扣 1 命 + 状态栏「浪散了」）`, timeoutMs: 9000 });
  console.log('浪散重生状态:', JSON.stringify(dissolved, null, 2));
  if (!dissolved.status.includes('浪散了')) {
    throw new Error(`落水状态栏未提示「浪散了」：${dissolved.status}`);
  }
  // resetWaves 必须把唯一一朵浪复位成 idle（含 killTweensOf / setScale / enable）
  const afterReset = await waitFor(`(() => {
    const s = ${sceneJs};
    return {
      ok: s.waves.every((w) => w.state === 'idle') && s.player.body.onFloor(),
      states: s.waves.map((w) => w.state),
      onFloor: s.player.body.onFloor(),
      lives: s.progress.lives,
    };
  })()`, { label: '重生后所有浪复位为 idle', timeoutMs: 3000 });
  console.log('重生复位状态:', JSON.stringify(afterReset, null, 2));

  console.log(`--- 12. 验证门楣金钥匙 (${LAYOUT.key.x}, ${LAYOUT.key.y})：门常显且锁着，跳起才能摘 ---`);
  const beforeKey = await waitFor(`(() => {
    const s = ${sceneJs};
    s.player.setTouchMove(0);
    if (Math.abs(s.player.view.x - ${LAYOUT.door.openingCenterX}) > 6) {
      s.player.teleportTo(${LAYOUT.door.openingCenterX}, ${LAYOUT.landing.top - 36});
    }
    return {
      ok: s.player.body.onFloor() && s.player.state === 'idle',
      keyCollected: s.keyCollected,
      enteredRoom: s.enteredRoom,
      doorExists: Boolean(s.door),
      doorVisible: Boolean(s.door?.visible),
      keyObjectExists: s.children.list.some(o => o.texture?.key === 'level1-golden-jasmine-key'),
      keyBeaconExists: Boolean(s.keyBeacon),
      doorHintExists: Boolean(s.doorHint),
      lives: s.progress.lives,
    };
  })()`, { label: '走到石门前站定' });
  console.log('门前状态:', JSON.stringify(beforeKey, null, 2));
  if (beforeKey.keyCollected) {
    throw new Error('取钥匙前 keyCollected 不应为 true（存档重置流程未生效）');
  }
  if (!beforeKey.doorExists || !beforeKey.doorVisible) {
    throw new Error('阶段 3 石门应常显（锁着等待钥匙），当前 door 缺失或不可见');
  }
  if (!beforeKey.keyObjectExists || beforeKey.keyBeaconExists || beforeKey.doorHintExists) {
    throw new Error('应只显示可拾取的实体钥匙，不应再生成额外光柱/提示牌/UI');
  }
  await captureScreenshot('test-niannian-door-key');

  // 站着够不到门楣：原地满蓄力起跳（触摸跳跃走与键盘相同的缓冲通路；
  // 提前松键会把上升速度砍到 0.45 倍 → 按住 900ms 越过顶点后才松，才是「长按大跳」）
  const keyInfo = await waitFor(`(() => {
    const s = ${sceneJs};
    if (!s.keyCollected && s.player.state === 'idle') {
      s.player.pressTouchJump(true);
      setTimeout(() => s.player.pressTouchJump(false), 900);
    }
    return {
      ok: s.keyCollected,
      keyCollected: s.keyCollected,
      playerY: Math.round(s.player.view.y),
      keyBeaconExists: Boolean(s.keyBeacon),
      doorHintExists: Boolean(s.doorHint),
      status: s.statusText.text,
    };
  })()`, { label: '跳起摘到门楣金钥匙', timeoutMs: 4000, intervalMs: 40 });
  console.log('摘取金钥匙状态:', JSON.stringify(keyInfo, null, 2));
  if (keyInfo.keyBeaconExists || keyInfo.doorHintExists) {
    throw new Error('取到钥匙后不应重新出现额外钥匙光柱/提示牌/UI');
  }

  console.log(`--- 13. 验证空中不能进门、取钥匙后落地即可从门口进入（开口中心 ${LAYOUT.door.openingCenterX}） ---`);
  // 拾取点就在门楣上方：先检查解锁延迟，再让延迟提前结束，单独验证空中仍不能进门。
  await sleep(120);
  const airborneBeforeUnlock = await evalJs(`(() => {
    const s = ${sceneJs};
    return {
      keyCollected: s.keyCollected,
      enteredRoom: s.enteredRoom,
      onFloor: s.player.body.onFloor(),
      levelClockMs: s.levelClockMs,
      doorOpenAt: s.doorOpenAt,
      playerX: Math.round(s.player.view.x),
      playerY: Math.round(s.player.view.y),
    };
  })()`);
  console.log('钥匙后空中状态:', JSON.stringify(airborneBeforeUnlock, null, 2));
  if (!airborneBeforeUnlock.keyCollected || airborneBeforeUnlock.enteredRoom || airborneBeforeUnlock.onFloor
    || airborneBeforeUnlock.doorOpenAt <= airborneBeforeUnlock.levelClockMs) {
    throw new Error('拾钥匙后应仍在空中、门有解锁延迟且尚未进入');
  }
  await evalJs(`(() => {
    const s = ${sceneJs};
    s.doorOpenAt = s.levelClockMs;
    return true;
  })()`);
  await sleep(80);
  const airborneGate = await evalJs(`(() => {
    const s = ${sceneJs};
    return {
      blocked: s.keyCollected && !s.enteredRoom && !s.player.body.onFloor() && s.levelClockMs >= s.doorOpenAt,
      enteredRoom: s.enteredRoom,
      onFloor: s.player.body.onFloor(),
      levelClockMs: s.levelClockMs,
      doorOpenAt: s.doorOpenAt,
    };
  })()`);
  if (!airborneGate.blocked) {
    throw new Error(`门解锁后仍应等待落地，空中进入状态异常：${JSON.stringify(airborneGate)}`);
  }

  const doorInfo = await waitFor(`(() => {
    const s = ${sceneJs};
    return {
      ok: Boolean(s.enteredRoom) && s.player.frozen,
      enteredRoom: s.enteredRoom,
      playerFrozen: s.player.frozen,
      onFloor: s.player.body.onFloor(),
      modalOpen: s.gameHud.isModalOpen(),
      status: s.statusText.text,
      lives: s.progress.lives,
    };
  })()`, { label: '落地后直接从门口进入记忆之房', timeoutMs: 8000 });
  console.log('落地进门状态:', JSON.stringify(doorInfo, null, 2));
  await captureScreenshot('test-niannian-door-cleared');

  console.log('--- 14. 检查全过程控制台错误日志 ---');
  const errors = consoleMessages.filter(m => m.type === 'error');
  console.log(`控制台错误总数: ${errors.length}`);
  if (errors.length > 0) {
    console.error('存在控制台报错:', errors);
    throw new Error(`控制台出现 ${errors.length} 条 error（阶段 3 验收要求 0 条）`);
  }

  console.log('\n========================================');
  console.log('  🎉 全部 14 项端到端角色 / 阶段 3 关卡机制测试 100% 通过！');
  console.log('========================================\n');

  ws.close();
}

run().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
