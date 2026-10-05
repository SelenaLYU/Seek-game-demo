import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

/**
 * 碎片 HUD 的贝壳曾经是代码手绘的 SVG 灰盒（HANDOFF 里那条占位）。
 * 这组测试盯两件事，都是「换回占位/写错路径」时才会红：
 *   · 用正式水彩贝的缩小版、走 Vite `?url`（字面路径不会进 dist）
 *   · 三片记忆仍各占一条带子（收一片亮一片的玩法没丢）
 */
test('fragment HUD shell uses the shipped watercolour art, not a hand-drawn outline', () => {
  const hud = read('src/ui/FragmentHud.ts');
  assert.match(
    hud,
    /import shellArtUrl from '\.\.\/\.\.\/assets\/items\/room-memory-pearl-shell-hud-v1\.png\?url'/,
  );
  // 灰盒回归防线：正式美术是 <img>，不该再有内联 <svg> 手绘轮廓
  assert.doesNotMatch(hud, /<svg/);
  for (const kind of ['photo', 'radio', 'shadowBoat']) {
    assert.match(hud, new RegExp(`\\$\\{layer\\('${kind}'\\)\\}`), `HUD 缺少 ${kind} 这条带子`);
    assert.match(hud, new RegExp(`data-piece="${kind}"`), `HUD 缺少 ${kind} 的渐变遮罩`);
  }
});

test('fragment HUD art is the downscaled derivative, not the 1.7MB source', () => {
  const src = statSync(new URL('../assets/items/room-memory-pearl-shell-v1.png', import.meta.url));
  const hud = statSync(new URL('../assets/items/room-memory-pearl-shell-hud-v1.png', import.meta.url));
  // HUD 常驻在 DOM 层、实际只显示 42px，没必要背整张 1254px 源图
  assert.ok(hud.size < 120_000, `HUD 贝壳图标 ${hud.size}B 过大，应该用缩小版`);
  assert.ok(hud.size < src.size / 10, 'HUD 贝壳图标应当是源图的缩小版');
});
