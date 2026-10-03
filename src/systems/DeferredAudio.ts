import Phaser from 'phaser';

/**
 * 后台加载音频：不阻塞任何场景的 preload，加载完再回调。
 *
 * 为什么需要它（实测见 `tools/probe-load-perf.mjs` 与
 * `decisions/2026-10-03-webp-and-load-optimization.md`）：
 *  · 两条背景音乐 `menu-room-bgm` 5.3MB + `forest-bgm` 3.9MB，原来被 BootScene / ForestScene
 *    的 `preload()` 串在关键路径上——玩家进主菜单和进第一关都要先等这几兆下载完。
 *  · 音频本来就不该挡玩法：晚 1~2 秒响起完全可以接受，进不去画面才不可接受。
 *
 * 实现要点：
 *  · 每个 Scene 有**自己的** LoaderPlugin（`sys.load`），所以场景运行期也能 `load.start()`，
 *    不会和别的场景的 preload 队列互相打断。
 *  · 同一 key 的并发请求合并成一次加载，回调按注册顺序触发。
 *  · 场景在加载途中 SHUTDOWN 时不再触发回调（避免往已销毁的场景里塞声音对象）。
 *  · 加载失败按**静音降级**处理：记一条 warn，不抛错、不重试、不触发回调。
 */

type ReadyCallback = () => void;

/** key → 本次加载注册的回调（同时也是「正在加载」的标记） */
const inFlight = new Map<string, ReadyCallback[]>();

/** 测试与排障用：当前有没有还没落地的音频加载 */
export function pendingAudioKeys(): string[] {
  return [...inFlight.keys()];
}

/**
 * 在后台把 `url` 加载到音频缓存里的 `key`。
 *
 * @param onReady 加载成功且场景仍存活时调用一次；已缓存时**同步**调用。
 */
export function loadAudioInBackground(
  scene: Phaser.Scene,
  key: string,
  url: string,
  onReady?: ReadyCallback,
): void {
  if (scene.cache.audio.exists(key)) {
    onReady?.();
    return;
  }

  const waiting = inFlight.get(key);
  if (waiting) {
    if (onReady) waiting.push(onReady);
    return;
  }

  const callbacks: ReadyCallback[] = onReady ? [onReady] : [];
  inFlight.set(key, callbacks);

  const loader = scene.load;
  const fileComplete = `filecomplete-audio-${key}`;

  const finish = (): void => {
    inFlight.delete(key);
    loader.off(fileComplete, finish);
    loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    if (!scene.sys.isActive()) return; // 加载途中场景已关闭：不留悬挂对象
    for (const callback of callbacks) callback();
  };

  const onError = (file: Phaser.Loader.File): void => {
    if (file?.key !== key) return;
    inFlight.delete(key);
    loader.off(fileComplete, finish);
    loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    if (typeof console !== 'undefined') {
      console.warn(`[audio] ${key} 加载失败，本局静音降级：${url}`);
    }
  };

  loader.once(fileComplete, finish);
  loader.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (!inFlight.has(key)) return;
    inFlight.delete(key);
    loader.off(fileComplete, finish);
    loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
  });

  loader.audio(key, url);
  if (!loader.isLoading()) loader.start();
}
