# Chapter 3 — 办公楼关卡资产

本目录只收纳“刷卡上班”至画笔门口的美术；后续画中世界单独放在同级 `painting-world/`。运行时接线在 `src/scenes/ChapterThreeOfficeScene.ts`，关卡尺寸、碰撞及检查点仍以 `src/gameplay/chapterThreeOffice.ts` 的灰盒为准。

## 环境

- `environment/city-night-approach-v2.png`：大都市夜景与写字楼入口；起点到闸机。
- `environment/lobby-no-elevator-v2.png`：入口内的公司大堂；不预画电梯，唯一电梯由单独资产放在升降点。
- `environment/elevator-two-floor-transition-v1.png`：一张连续的两层楼连接画，贯通一层大堂、电梯井和上层办公室；地面与灰盒两个高度对齐。
- `environment/office-interior-v1.png`：上层开放办公区与降落后室内区。
- `environment/office-floor-module-v1.png`：按灰盒平台宽度重复裁切的地板模块。
- `environment/rooftop-skyline-v1.png`：文件夹飞行段与屋顶背景。

## 单独物件

`props/` 包含工牌与闸机、唯一电梯的关门/开门两态、飞舞的文件夹与电脑、实心办公桌、弹跳办公椅、可骑的文件夹、飞行障碍立柱与快递、屋顶打印机、下降绳索、摇摆电话、记忆画笔和最终的彩色门。所有透明图均独立加载并按灰盒坐标摆放。玩家靠近电梯按一次 E 开门，再按一次 E 进入；升降后楼上重新开门。

## 人物

- `characters/commuters-3-v1.png`：三类通勤职员，重复组合成早高峰人潮。
- `characters/han-meimei-office-idle-4f-v1.png`：待机四帧。
- `characters/han-meimei-office-run-8f-v1.png`：奔跑八帧。
- `characters/han-meimei-office-jump-4f-v1.png`：起跳、腾空、下落四帧。
- `characters/han-meimei-office-crouch-4f-v1.png`：蹲下、蹲行与起身四帧。

韩梅梅以项目根目录已确认的 `成年韩梅梅.png` 为五官、雀斑、侧辫和气质参考；本关换成象牙白衬衫、深蓝西装外套、深色西裤、棕色通勤鞋及工牌。保持深蓝夜景、暖黄灯光和手绘动画质感。所有人物条图均为透明底，运行时按帧裁切。
