/**
 * 美术资源解析：运行时优先用 WebP，缺失时回退同名 PNG。
 *
 * 为什么需要这层（实测见 HANDOFF「性能与加载」小节、`tools/probe-load-perf.mjs`）：
 *  · 第一关要加载的 PNG 合计 ~11MB、记忆之房 ~17MB。玩家冷启动与切场景都要等这批图解码，
 *    白屏常常比主包本身还长（index chunk gzip 395KB，两张背景就 2.8MB + 2.65MB）。
 *  · `tools/optimize-images.py` 生成的同目录 `.webp`（q82）把 26 张图从 36.8MB 压到 3.55MB
 *    （省 90.4%），水彩风格对有损压缩很友好，肉眼几乎无损。
 *  · 美术真源仍是 PNG（tests/levelOneLayout.test.mjs 逐列读礁石 PNG 的 alpha 顶面），
 *    所以 **PNG 一个都不删**；没跑转换脚本 / 转换失败时按 PNG 原样工作，不会白屏。
 *
 * 两种加载路径都要覆盖（键名 → 值的表，两种路径都能命中）：
 *  · `import x from '…png?url'` —— 编译期就换成带哈希的产物 URL。
 *  · 字面路径的 `this.load.image` —— Phaser 场景里大量资源不走 Vite import，
 *    这些文件由 vite.config.mjs 的 copy-phaser-runtime-assets 插件原样拷进 dist，
 *    同名 `.webp` 也会被拷到同目录，所以字面路径换后缀即可用。
 *
 * 约定：源图与 WebP 同目录同名（`a/b.png` ↔ `a/b.webp`）。basename 唯一性由 optimize-images.py 校验。
 */

/** `import.meta.glob` 的键是**源文件绝对路径**（`/assets/…png`），值才是产物 URL。 */
const WEBP_MODULES = {
  ...(import.meta.glob('/assets/**/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('/scene/**/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
};

/** basename（不含扩展名）→ 产物 URL。加哈希剥离是为了同时吃下两种调用形态。 */
const WEBP_BY_STEM: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [sourcePath, url] of Object.entries(WEBP_MODULES)) {
    const file = sourcePath.split('?')[0];
    const stem = file.slice(file.lastIndexOf('/') + 1).replace(/\.webp$/i, '');
    // 同一 stem 出现两次说明美术文件同名冲突，保留先注册的那个
    if (!map.has(stem)) map.set(stem, url);
  }
  return map;
})();

/** Vite 默认 `name-HASH.ext`（hashLength=8）。生产产物里的 `?url` import 就长这样。 */
const VITE_HASH_SUFFIX = /-[A-Za-z0-9_-]{8}$/;

/**
 * 选一个真正能被浏览器加载的 URL；找不到对应 WebP 时原样返回（走 PNG）。
 * 传进来的既可以是字面 `assets/…png`（dev / 插件拷贝路径），也可以是 Vite 产物 URL
 * （生产 `?url` import，形如 `/assets/foo-BRuNTh02.png`），两种都能按 stem 命中。
 */
export function resolveImageUrl(assetPath: string): string {
  const clean = assetPath.split('?')[0];
  const file = clean.slice(clean.lastIndexOf('/') + 1);
  const stem = file.replace(/\.(png|webp)$/i, '');
  const direct = WEBP_BY_STEM.get(stem);
  if (direct) return direct;
  const unHashed = stem.replace(VITE_HASH_SUFFIX, '');
  return unHashed === stem ? assetPath : WEBP_BY_STEM.get(unHashed) ?? assetPath;
}
