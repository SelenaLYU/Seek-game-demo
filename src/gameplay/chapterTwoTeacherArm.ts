/**
 * 值班老师立绘的「前臂 + 手电」分层几何（纯数据 + 纯函数，可被 node 单测直接 import）。
 *
 * 为什么要分层：光锥要扫 −10°..+73°（`chapterTwoRules` 里的 `MIN_ANGLE`/`MAX_ANGLE`，
 * 单程约 6 秒），而 `teacher.png` 是**静态立绘**——手电水平握着，不会跟着扫。
 * 两者不联动时，扫到陡角就会出现「手电指着右边、光柱从灯下面垂下来」的错位
 * （2026-10-05 实机截图：灯口下方挂着一团雾，用户原话「这个光的造型很奇怪」）。
 *
 * 做法：把前臂（含手电）从贴图里裁出来单独绕肘旋转，身体那一层用反向遮罩挖掉同一块。
 * 不新增美术文件——同一张贴图 crop 画两次。
 *
 * 为什么旋转轴心取肘、而灯口（`LIGHT_ORIGIN`）保持固定：灯口位置已经按镜片实测标定过
 * （见 `chapterTwoRules.ts`）。肘到镜片只有约 19 个世界单位，绕肘旋转时镜片沿半径 19 的
 * 圆弧移动，全程离固定灯口最远约 22 个世界单位（≈2% 屏宽），仍在灯口辉光（72 单位）之内，
 * 所以不需要把命中判定也改成随角度移动的光源——「看到光 = 被照到」继续逐点成立。
 * 该距离由 `tests/chapterTwoTeacherArm.test.mjs` 锁住。
 */

/** `teacher.png` 的原始像素尺寸 */
export const TEACHER_ART = { width: 100, height: 200 };

/** 前臂 + 手电在贴图里的裁切矩形（源像素；含袖口下缘到灯口镜片） */
export const ARM_CROP = { x: 59, y: 78, width: 41, height: 15 };

/** 肘（旋转轴心）在贴图里的位置（源像素） */
export const ARM_PIVOT = { x: 59, y: 84.5 };

/** 静息姿势下灯口镜片中心在贴图里的位置（源像素）。`LIGHT_ORIGIN` 就是按它标定的 */
export const ARM_MUZZLE = { x: 96, y: 86 };

/** 贴图源像素 → 世界坐标的比例：`displaySize 50×100` / 源 `100×200` */
export const TEACHER_SCALE = 0.5;

/**
 * 静息姿势下「肘 → 镜片」的朝向（弧度；屏幕坐标，0 = 向右，正值 = 向下）。
 * 立绘里手电几乎是水平的（约 2°），所以这个值很小。
 */
export const ARM_REST_ANGLE = Math.atan2(ARM_MUZZLE.y - ARM_PIVOT.y, ARM_MUZZLE.x - ARM_PIVOT.x);

/** 光锥角度 → 前臂图层该转的角度 */
export function armRotationFor(beamAngle: number): number {
  return beamAngle - ARM_REST_ANGLE;
}

/**
 * 身体那一层要挖掉的世界坐标矩形（用反向几何遮罩）。
 * 由老师立绘的位置与显示尺寸换算，所以立绘挪位/改尺寸时不用手改常量。
 */
export function armHoleRect(teacherX: number, teacherY: number, displayWidth: number, displayHeight: number): {
  x: number; y: number; width: number; height: number;
} {
  const scaleX = displayWidth / TEACHER_ART.width;
  const scaleY = displayHeight / TEACHER_ART.height;
  return {
    x: teacherX - displayWidth / 2 + ARM_CROP.x * scaleX,
    y: teacherY - displayHeight + ARM_CROP.y * scaleY,
    width: ARM_CROP.width * scaleX,
    height: ARM_CROP.height * scaleY,
  };
}

/**
 * 灯口在某个光锥角度下的世界坐标（前臂旋转后的镜片位置）。
 * 只用于验证/调试：命中判定与光锥绘制仍然共用固定的 `LIGHT_ORIGIN`。
 */
export function muzzleWorldAt(
  beamAngle: number,
  teacherX: number,
  teacherY: number,
  displayWidth: number,
  displayHeight: number,
): { x: number; y: number } {
  const scaleX = displayWidth / TEACHER_ART.width;
  const scaleY = displayHeight / TEACHER_ART.height;
  const pivotX = teacherX - displayWidth / 2 + ARM_PIVOT.x * scaleX;
  const pivotY = teacherY - displayHeight + ARM_PIVOT.y * scaleY;
  const restX = (ARM_MUZZLE.x - ARM_PIVOT.x) * scaleX;
  const restY = (ARM_MUZZLE.y - ARM_PIVOT.y) * scaleY;
  const rotation = armRotationFor(beamAngle);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { x: pivotX + restX * cos - restY * sin, y: pivotY + restX * sin + restY * cos };
}
