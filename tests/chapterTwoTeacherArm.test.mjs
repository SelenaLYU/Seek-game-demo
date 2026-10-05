import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ARM_CROP, ARM_MUZZLE, ARM_PIVOT, ARM_REST_ANGLE, TEACHER_ART, TEACHER_SCALE,
  armHoleRect, armRotationFor, muzzleWorldAt,
} from '../src/gameplay/chapterTwoTeacherArm.ts';
import { LIGHT_ORIGIN, TEACHER } from '../src/gameplay/chapterTwoRules.ts';

/**
 * 老师「前臂 + 手电」分层的几何防线。
 *
 * 为什么值得单测：光锥扫 −10°..+73°，而立绘是静态的。手电不跟着光锥转，扫到陡角就会出现
 * 「手电指着右边、光柱从灯下面垂下来」——2026-10-05 实机截图里就是灯口下方挂着一团雾。
 * 这层几何把「灯口指着哪儿」与「光照到哪儿」绑回一起，而且**不改命中判定**：
 * 灯口仍是 `LIGHT_ORIGIN` 那个固定点，靠「轴心离灯口足够近」来维持两者不打架。
 */

/** 光锥扫程，与 `chapterTwoRules.ts` 里的 MIN_ANGLE / MAX_ANGLE 保持一致（那边没有导出） */
const SWEEP_MIN = -0.18;
const SWEEP_MAX = 1.28;
/** 灯口辉光的显示直径（`chapterTwoFlashlight` 里 glow 的 `setDisplaySize(72, 72)`） */
const GLOW_DIAMETER = 72;

/** 立绘的真实像素尺寸：只读 PNG 的 IHDR，不解码整张图 */
function pngSize(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', `${path} 不是 PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('裁切几何与真实立绘一致：teacher.png 换一版分辨率就会失败', () => {
  const size = pngSize(fileURLToPath(new URL('../assets/level2/night-v1/teacher.png', import.meta.url)));
  assert.deepEqual(size, TEACHER_ART, 'TEACHER_ART 与 teacher.png 的实际像素尺寸不符（裁切矩形是按源像素写的）');
  assert.ok(ARM_CROP.x >= 0 && ARM_CROP.y >= 0, '裁切矩形必须在贴图内');
  assert.ok(ARM_CROP.x + ARM_CROP.width <= TEACHER_ART.width, '裁切矩形右侧越界');
  assert.ok(ARM_CROP.y + ARM_CROP.height <= TEACHER_ART.height, '裁切矩形下侧越界');
  // 轴心与镜片都必须落在裁切矩形里，否则旋转中心/朝向就不是这块图层自己的
  assert.ok(ARM_PIVOT.x >= ARM_CROP.x && ARM_PIVOT.x <= ARM_CROP.x + ARM_CROP.width
    && ARM_PIVOT.y >= ARM_CROP.y && ARM_PIVOT.y <= ARM_CROP.y + ARM_CROP.height, '肘必须在前臂图层内');
  assert.ok(ARM_MUZZLE.x >= ARM_CROP.x && ARM_MUZZLE.x <= ARM_CROP.x + ARM_CROP.width
    && ARM_MUZZLE.y >= ARM_CROP.y && ARM_MUZZLE.y <= ARM_CROP.y + ARM_CROP.height, '手电灯口必须在前臂图层内');
  const display = TEACHER_ART.width * TEACHER_SCALE;
  assert.equal(display, 50, '贴图→世界的比例必须是 0.5（displaySize 50×100）');
  assert.equal(TEACHER_ART.height * TEACHER_SCALE, 100);
});

test('静息姿势不旋转，且旋转后的手电朝向与光锥角度一致', () => {
  assert.equal(armRotationFor(ARM_REST_ANGLE), 0, '静息角度下前臂图层必须保持原始朝向');
  const restX = ARM_MUZZLE.x - ARM_PIVOT.x;
  const restY = ARM_MUZZLE.y - ARM_PIVOT.y;
  // 立绘里手电本来就是水平的：静息朝向只有约 2°
  assert.ok(Math.abs(ARM_REST_ANGLE) < 0.06, `静息朝向应几乎水平，实际 ${ARM_REST_ANGLE}`);
  for (let angle = SWEEP_MIN; angle <= SWEEP_MAX; angle += 0.01) {
    const rotation = armRotationFor(angle);
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const aimed = Math.atan2(restX * sin + restY * cos, restX * cos - restY * sin);
    assert.ok(Math.abs(aimed - angle) < 1e-9, `扫到 ${angle} 时手电应指向同一角度，实际 ${aimed}`);
  }
  // 陡角必须真的转过去，否则就是没接上（73° 对应约 71° 的层旋转）
  assert.ok(Math.abs(armRotationFor(SWEEP_MAX) * 180 / Math.PI - 71) < 1, '最大扫角下前臂应约转 71°');
});

test('固定灯口始终落在旋转后的手电附近：不把命中判定改成浮动光源也能成立', () => {
  let worst = { distance: 0, angle: ARM_REST_ANGLE };
  for (let angle = SWEEP_MIN; angle <= SWEEP_MAX; angle += 0.002) {
    const muzzle = muzzleWorldAt(angle, TEACHER.x, TEACHER.groundY, 50, 100);
    const distance = Math.hypot(muzzle.x - LIGHT_ORIGIN.x, muzzle.y - LIGHT_ORIGIN.y);
    assert.ok(Number.isFinite(distance), `角度 ${angle} 下的镜片坐标必须是有限数`);
    if (distance > worst.distance) worst = { distance, angle };
  }
  // 轴心到灯口约 17.5 个单位，镜片绕轴心走半径约 18.7 的圆弧 → 全程最远约 20.1
  assert.ok(worst.distance < 21, `镜片最远离灯口 ${worst.distance.toFixed(2)} 个世界单位（角度 ${worst.angle.toFixed(2)}）`);
  // 而且必须仍在灯口辉光的直径之内，否则会看出「光不是从手电出来的」
  assert.ok(worst.distance < GLOW_DIAMETER / 2, `镜片偏移 ${worst.distance.toFixed(2)} 超出辉光半径 ${GLOW_DIAMETER / 2}`);
});

test('静息灯口与镜片重合，且挖掉的矩形正好等于会转的那一块', () => {
  const muzzle = muzzleWorldAt(ARM_REST_ANGLE, TEACHER.x, TEACHER.groundY, 50, 100);
  assert.ok(Math.hypot(muzzle.x - LIGHT_ORIGIN.x, muzzle.y - LIGHT_ORIGIN.y) < 2,
    '静息时灯口应贴在镜片上（LIGHT_ORIGIN 按镜片标定）');

  const hole = armHoleRect(TEACHER.x, TEACHER.groundY, 50, 100);
  const scale = 50 / TEACHER_ART.width;
  assert.deepEqual(hole, {
    x: TEACHER.x - 25 + ARM_CROP.x * scale,
    y: TEACHER.groundY - 100 + ARM_CROP.y * scale,
    width: ARM_CROP.width * scale,
    height: ARM_CROP.height * scale,
  });
  // 挖洞矩形必须完全落在立绘矩形内，不然遮罩会吃掉身体之外的东西
  assert.ok(hole.x >= TEACHER.x - 25 && hole.x + hole.width <= TEACHER.x + 25, '挖洞矩形横向越出立绘');
  assert.ok(hole.y >= TEACHER.groundY - 100 && hole.y + hole.height <= TEACHER.groundY, '挖洞矩形纵向越出立绘');
  // 轴心必须落在挖洞矩形的竖向中段附近，旋转时接缝才不会被拉开
  const pivotWorldY = TEACHER.groundY - 100 + ARM_PIVOT.y * scale;
  assert.ok(pivotWorldY > hole.y + hole.height * 0.25 && pivotWorldY < hole.y + hole.height * 0.75,
    '肘应落在挖洞矩形中段');
});

test('场景接线：crop 保留源坐标，初始姿态和每帧旋转都接入', () => {
  const scene = readFileSync(new URL('../src/scenes/ChapterTwoChallengeScene.ts', import.meta.url), 'utf8');
  assert.match(scene, /arm\.setPosition\(-ARM_PIVOT\.x \* scale, -ARM_PIVOT\.y \* scale\)/,
    'crop 仍按源坐标绘制，必须减去完整轴心坐标而非 crop 内偏移');
  assert.match(scene, /this\.createTeacher\(\)/);
  assert.match(scene, /this\.teacherArm\.rotation = armRotationFor\(this\.searchlight\.angle\)/);
  assert.match(scene, /this\.teacherArm\.rotation = armRotationFor\(angle\)/);
  assert.match(scene, /mask\.invertAlpha = true/);
  assert.match(scene, /holeSource\.destroy\(\)/);
});
