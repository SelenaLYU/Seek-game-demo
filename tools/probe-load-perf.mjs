/**
 * 加载性能探针：量「首屏可交互」与「第一关/记忆之房进入就绪」的真实时间与字节数。
 *
 * 为什么需要它（不要再靠"感觉变快了"验收）：
 *  · WebP 化（tools/optimize-images.py）+ HUD 去重这些改动都是**不可见**的，
 *    单测与 e2e 全绿也不能说明加载变快，只能说明功能没坏。
 *  · 这里量三个可判定的数字：场景 ready 时刻、ready 前传输字节数、ready 前主线程长任务。
 *    任一项变差都能在 commit 前发现。
 *
 * 用法：node tools/probe-load-perf.mjs
 * 依赖：dev server 在 localhost:5173、Chrome CDP 在 127.0.0.1:9333。
 */
const CDP_PORT = 9333;
/** 默认量 dev server；量生产产物时用 `ORIGIN=http://localhost:4173 npm run ...` 覆盖。 */
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5173';
/** 每个场景重复几次取中位数：dev server 冷启动波动很大，单次数字不可当结论。 */
const RUNS = Number(process.argv.find(a => a.startsWith('--runs='))?.slice(7) ?? 3);

/** 中位数（偶数个取中间两值均值），用来压掉单次抖动 */
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const readJson = async (path) => (await fetch(`http://127.0.0.1:${CDP_PORT}${path}`)).json();

async function openTarget(url) {
  const created = await readJson(`/json/new?${encodeURIComponent(url)}`);
  return created;
}

async function main() {
  const tabs = (await readJson('/json/list')).filter(t => t.type === 'page');
  const target = tabs[0] ?? await openTarget(`${ORIGIN}/`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const failures = [];
  let id = 1;
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Network.loadingFailed') failures.push(msg.params);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  await new Promise(r => { ws.onopen = r; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = id++;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  const evalJs = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  };

  await send('Network.enable');
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true }); // 每次都量冷加载

  /** 一个场景：从导航到「场景已可用」的毫秒数 / 传输字节 / 长任务 */
  const probeScene = async (scene, readyExpr, label, bgmKey) => {
    failures.length = 0;
    await evalJs(`1`).catch(() => {});
    await send('Page.navigate', { url: `${ORIGIN}/?scene=${scene}` });
    const t0 = Date.now();
    const ready = await (async () => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        try {
          if (await evalJs(readyExpr)) return Date.now() - t0;
        } catch { /* 页面还在导航，忽略 */ }
        await new Promise(r => setTimeout(r, 50));
      }
      throw new Error(`${label} 30s 内没就绪`);
    })();
    const stats = await evalJs(`(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const res = performance.getEntriesByType('resource');
      const byType = {};
      let total = 0;
      for (const e of res) {
        const t = e.initiatorType || 'other';
        byType[t] = (byType[t] || 0) + (e.transferSize || 0);
        total += e.transferSize || 0;
      }
      const longTasks = (performance.getEntriesByType('longtask') || [])
        .map(t => ({ name: t.name, dur: Math.round(t.duration) }))
        .filter(t => t.dur > 60);
      return {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        firstPaint: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0),
        resourceCount: res.length,
        transferKB: Math.round(total / 1024),
        byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, Math.round(v / 1024)])),
        longTaskCount: longTasks.length,
        longTaskMs: longTasks.reduce((s, t) => s + t.dur, 0),
        webp: res.filter(e => /[.]webp([?]|$)/.test(e.name)).length,
        png: res.filter(e => /[.]png([?]|$)/.test(e.name)).length,
      };
    })()`);
    return { label, readyMs: ready, ...stats, requestFailures: failures.length };
  };

  /**
   * 验证「后台加载的音频最终真的到了，并且真能播」。
   * 只量"不再阻塞"是不够的——那可能只是把音频彻底弄丢了。
   * 先模拟一次点击解浏览器 autoplay 锁（headless 里 sound.locked 默认是 true），
   * 再等音频 key 进 cache，最后看它是不是在播。
   */
  const audioCheck = async (scene, key, since) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 480, y: 300, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 480, y: 300, button: 'left', clickCount: 1 });
    const deadline = Date.now() + 30000;
    let last = null;
    while (Date.now() < deadline) {
      last = await evalJs(`(() => {
        const g = window.__game;
        const s = g.scene.getScene(${JSON.stringify(scene)});
        const sounds = (s && s.sound && s.sound.sounds) || [];
        const mine = sounds.filter(x => x.key === ${JSON.stringify(key)});
        return {
          cached: g.cache.audio.exists(${JSON.stringify(key)}),
          instances: mine.length,
          playing: mine.some(x => x.isPlaying),
          locked: s ? Boolean(s.sound.locked) : null,
          decoder: s ? s.sound.constructor.name : null,
        };
      })()`);
      if (last.cached) break;
      await new Promise(r => setTimeout(r, 200));
    }
    return { ...last, loadedAfterMs: Date.now() - since };
  };

  /** 一次完整探测：就绪指标 + 后台 BGM 到位验证 */
  const probeSceneWithAudio = async (scene, readyExpr, label, bgmKey) => {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const startedAt = Date.now();
      const row = await probeScene(scene, readyExpr, label);
      row.audio = await audioCheck(scene, bgmKey, startedAt);
      runs.push(row);
    }
    // 中位数压抖；字节数/图片张数取最后一次（每次一致，没必要中位数）
    const last = runs.at(-1);
    return {
      ...last,
      readyMs: median(runs.map(r => r.readyMs)),
      firstPaint: median(runs.map(r => r.firstPaint)),
      domContentLoaded: median(runs.map(r => r.domContentLoaded)),
      longTaskMs: median(runs.map(r => r.longTaskMs)),
      requestFailures: runs.reduce((s, r) => s + r.requestFailures, 0),
      audio: last.audio,
      samples: RUNS,
    };
  };

  const rows = [];
  rows.push(await probeSceneWithAudio(
    'forest',
    `Boolean(window.__game?.scene?.getScene('forest')?.player?.view && window.__game.textures.exists('level1-background'))`,
    '第一关 · 海边',
    'forest-bgm',
  ));
  rows.push(await probeSceneWithAudio(
    'room',
    `Boolean(window.__game?.scene?.getScene('room')?.gameHud && window.__game.textures.exists('room-bg'))`,
    '第一关 · 记忆之房',
    'music-menu-room',
  ));

  console.log(`\n=== 加载性能（冷缓存，${ORIGIN}，${RUNS} 次取中位数）===`);
  for (const r of rows) {
    console.log(`\n[${r.label}]`);
    console.log(`  场景就绪      ${r.readyMs} ms`);
    console.log(`  FCP / DCL     ${r.firstPaint} ms / ${r.domContentLoaded} ms`);
    console.log(`  传输字节      ${r.transferKB} KB   (webp ${r.webp} 张 / png ${r.png} 张)`);
    console.log(`  资源分类 KB   ${JSON.stringify(r.byType)}`);
    console.log(`  >60ms 长任务  ${r.longTaskCount} 个 / 合计 ${r.longTaskMs} ms`);
    const a = r.audio ?? {};
    console.log(`  后台 BGM      ${bgmLine(a)}`);
    console.log(`  加载失败      ${r.requestFailures}`);
  }
  /**
   * 录音机电台：确认频道音频不在 preload、打开后按需加载、切台后旧频道停止。
   */
  await send('Page.navigate', { url: `${ORIGIN}/?scene=room` });
  const roomDeadline = Date.now() + 30000;
  while (Date.now() < roomDeadline) {
    try {
      if (await evalJs(`Boolean(window.__game?.scene?.getScene('room')?.gameHud)`)) break;
    } catch { /* 导航中 */ }
    await new Promise(r => setTimeout(r, 60));
  }
  const preloadCheck = await evalJs(`(() => ({
    static: window.__game.cache.audio.exists('radio-static'),
    wind: window.__game.cache.audio.exists('radio-wind'),
  }))()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 480, y: 300, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 480, y: 300, button: 'left', clickCount: 1 });
  await evalJs(`(() => { const s = window.__game.scene.getScene('room'); s.openRadio(); s.playRadioAudio('radio-static'); return true; })()`);

  const waitForRadio = async (key) => {
    const deadline = Date.now() + 20000;
    let state;
    while (Date.now() < deadline) {
      state = await evalJs(`(() => {
        const g = window.__game, s = g.scene.getScene('room');
        const sounds = (s.sound.sounds || []).filter(x => x.key === ${JSON.stringify(key)});
        return { cached: g.cache.audio.exists(${JSON.stringify(key)}), playing: sounds.some(x => x.isPlaying), instances: sounds.length };
      })()`);
      if (state.cached) return state;
      await new Promise(r => setTimeout(r, 150));
    }
    return state ?? { cached: false, playing: false, instances: 0 };
  };
  const staticRadio = await waitForRadio('radio-static');
  await evalJs(`(() => { window.__game.scene.getScene('room').playRadioAudio('radio-wind'); return true; })()`);
  const windRadio = await waitForRadio('radio-wind');
  const staticStopped = await evalJs(`(() => !(window.__game.scene.getScene('room').sound.sounds || []).some(x => x.key === 'radio-static' && x.isPlaying))()`);
  await evalJs(`(() => { window.__game.scene.getScene('room').stopRadioAudio(); return true; })()`);
  const radioOk = !preloadCheck.static && !preloadCheck.wind && staticRadio.cached && windRadio.cached && staticStopped;
  console.log('\n[录音机电台 · 按需加载]');
  console.log(`  preload       ${!preloadCheck.static && !preloadCheck.wind ? '✅ 两个频道均未预载' : '❌ 发现预载频道'}`);
  console.log(`  radio-static  ${staticRadio.cached ? `✅ 已加载，播放=${staticRadio.playing}` : '❌ 未加载'}`);
  console.log(`  radio-wind    ${windRadio.cached ? `✅ 已加载，播放=${windRadio.playing}` : '❌ 未加载'}`);
  console.log(`  切台停止旧声  ${staticStopped ? '✅' : '❌ 旧频道仍在播放'}`);

  const bad = rows.filter(r => r.requestFailures > 0 || r.transferKB === 0);
  const audioBroken = rows.filter(r => !r.audio?.cached);
  console.log(bad.length ? '\n❌ 有场景出现请求失败或零字节（不可信数据）' : '\n✅ 无请求失败');
  console.log(audioBroken.length
    ? `❌ 后台 BGM 没到位：${audioBroken.map(r => r.label).join('、')}`
    : '✅ 后台 BGM 均已加载完成（只是不在关键路径上）');
  console.log(radioOk ? '✅ 录音机电台按需加载链路正常' : '❌ 录音机电台按需加载链路有问题');
  if (bad.length || audioBroken.length || !radioOk) process.exitCode = 1;
  ws.close();
}

/** 一行说明后台 BGM 的结果：是否到位、是否真的在播 */
function bgmLine(a) {
  if (!a.cached) return `❌ 未缓存（等待 ${a.loadedAfterMs ?? '?'}ms）`;
  const play = a.playing ? '正在播放' : `未播放（autoplay锁=${a.locked}）`;
  return `✅ 已加载 +${a.loadedAfterMs}ms · ${play} · 实例 ${a.instances}`;
}

main().catch((error) => {
  console.error('探针失败:', error.message);
  process.exit(1);
});
