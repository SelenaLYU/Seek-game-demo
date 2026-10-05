import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * WebP 管线的回归防线。
 *
 * 为什么需要它：`tools/optimize-images.py` 的 RUNTIME_IMAGES 是**手工维护**的清单，
 * 而运行时 `resolveImageUrl()` 找不到同名 `.webp` 时会**安静回落 PNG**——不报错、
 * 不影响功能、测试也不会红。2026-10-05 一次踩到两条：
 *   · 记忆之房后来补的 7 张美术没登记 → 房间进场一次传 15.7MB PNG（应为 0.9MB）；
 *   · 第二关 `ChapterTwoChallengeScene` 的 35 张 literal `load.image` 压根没过
 *     `resolveImageUrl` → 进场传 11.9MB PNG（修后 1.5MB）。
 * 另有一条静默错图路径：PNG 改了但没重跑脚本，`resolveImageUrl` 会继续发旧 WebP，
 * 所以第三个测试盯「WebP 不能比 PNG 旧」。
 */

const ROOT = new URL('..', import.meta.url);
const at = rel => new URL(rel, ROOT);
const rel = url => path.relative(fileURLToPath(ROOT), fileURLToPath(url));

/** PNG/JPG 对应的 WebP 路径（同目录同名，只换扩展名） */
const webpOf = repoPath => repoPath.replace(/\.(png|jpg|jpeg)$/i, '.webp');

/** tools/optimize-images.py 的 RUNTIME_IMAGES 清单 */
function runtimeImages() {
  const py = readFileSync(at('tools/optimize-images.py'), 'utf8');
  const start = py.indexOf('RUNTIME_IMAGES');
  const block = py.slice(start, py.indexOf('\n)', start));
  return [...block.matchAll(/"([^"]+\.(?:png|jpg|jpeg))"/g)].map(m => m[1]);
}

/**
 * 运行时会加载图的入口：UI 层 + 所有场景。
 * 不含 `src/gameplay/*`（角色序列帧）与 `public/`（岛屿 GLB），它们各有自己的加载路径。
 */
const RUNTIME_SOURCES = [
  ...readdirSync(at('src/ui')).filter(f => f.endsWith('.ts')).map(f => `src/ui/${f}`),
  ...readdirSync(at('src/scenes')).filter(f => f.endsWith('.ts')).map(f => `src/scenes/${f}`),
];

/** 角色序列帧按 optimize-images.py 规则 2 不转 WebP（有损会糊帧、破坏掉色键） */
const WEBP_EXEMPT = [/^assets\/character\//];

/**
 * 只认「真的会把图交给 Phaser/渲染层」的两种写法：
 *   · `import x from '…png?url'`（编译期资源）
 *   · `this.load.image/spritesheet(…, <路径>)`（运行时加载，路径可以是字面量或 resolveImageUrl('…')）
 * 不扫全文的 `'assets/…'` 字面量：ChapterTwoRoomScene 里那张「素材审查面板」的未接入清单
 * 会被误判成运行时加载，那些图还没接进来。
 */
function referencedImages(source) {
  const text = readFileSync(at(source), 'utf8');
  const refs = new Set();
  for (const m of text.matchAll(/from\s+'([^']+\.(?:png|jpg|jpeg))\?url'/g)) refs.add(m[1]);
  for (const m of text.matchAll(
    /this\.load\.(?:image|spritesheet|atlas)\([^)]*?\(?['"]([^'"]+\.(?:png|jpg|jpeg))['"]/g,
  )) {
    refs.add(m[1]);
  }
  return refs;
}

const toRepoPath = (source, ref) => {
  const file = new URL(ref, new URL(source, ROOT));
  if (existsSync(file)) return rel(file);
  const fromRoot = at(ref.replace(/^\.\//, ''));
  return existsSync(fromRoot) ? rel(fromRoot) : null;
};

test('every runtime image in tools/optimize-images.py has a WebP sibling', () => {
  const images = runtimeImages();
  assert.ok(images.length >= 30, `RUNTIME_IMAGES 解析出 ${images.length} 条，清单可能被改坏了`);
  const broken = images.filter(p => !existsSync(at(webpOf(p))));
  assert.deepEqual(
    broken,
    [],
    `这些图没有 WebP，运行时会回落 PNG：\n  ${broken.join('\n  ')}\n` +
      '修法：/usr/bin/python3 tools/optimize-images.py',
  );
});

test('runtime images are all WebP-backed, so no scene can silently ship PNGs', () => {
  const problems = [];
  for (const source of RUNTIME_SOURCES) {
    for (const ref of referencedImages(source)) {
      const repoPath = toRepoPath(source, ref);
      if (!repoPath) {
        problems.push(`${source} 引用了不存在的图 ${ref}`);
        continue;
      }
      if (WEBP_EXEMPT.some(pattern => pattern.test(repoPath))) continue;
      if (!existsSync(at(webpOf(repoPath)))) {
        problems.push(`${repoPath}（被 ${source} 引用）没有同名 WebP`);
      }
    }
  }
  assert.deepEqual(
    problems,
    [],
    `运行时会回落 PNG，进场体积会暴涨：\n  ${problems.join('\n  ')}\n` +
      '修法：把图加进 tools/optimize-images.py 的 RUNTIME_IMAGES，再跑 /usr/bin/python3 tools/optimize-images.py',
  );
});

test('no WebP is older than its PNG source', () => {
  const stale = runtimeImages().filter(p => {
    if (!existsSync(at(p)) || !existsSync(at(webpOf(p)))) return false;
    // PNG 更新 = 美术改过但没重跑脚本；此时 resolveImageUrl 会继续发旧 WebP（静默错图）
    return statSync(at(p)).mtimeMs > statSync(at(webpOf(p))).mtimeMs;
  });
  assert.deepEqual(
    stale,
    [],
    `这些图的 WebP 比 PNG 旧，运行时会显示旧美术：\n  ${stale.join('\n  ')}\n` +
      '修法：/usr/bin/python3 tools/optimize-images.py',
  );
});
