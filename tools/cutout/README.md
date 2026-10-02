# 游戏资产抠图 / 切片工具链

从「不务正业的游戏 / 江湖一生」项目的 A-03 美术资产流水线移植过来，这里做了通用化。

核心两件事：**把 AI 生成的图变成带 alpha 的运行时资产**，以及**保证同族资产尺寸/重心一致**。

## 为什么这么做

AI 生图（GPT image / Seedream / Midjourney）出图时背景往往是白底、纸纹底或画出来的假背景，
直接丢进游戏会出现白框。两条抠图路线：

| 路线 | 适用 | 代价 |
|---|---|---|
| **vision**（macOS Vision 主体分割） | 复杂背景、照片、已有立绘 | 本地 2~3 秒/张，离线免费，不联网不上传 |
| **chroma**（纯色底色键） | 自己控制生图流程，能要求模型出「纯洋红底」 | 毫秒级，效果最干净，但要改提示词 |

原项目里两者都用了：GPT image2 生图时要求 **flat `#ff00ff` 可移除背景**，
而 `extract_foreground.swift` 是那条离线保底路线（Vision 的 `VNGenerateForegroundInstanceMaskRequest`，
系统级主体分割，不花一分钱、不依赖任何第三方 API）。

## 快速开始

```bash
PY=/Users/simon/.workbuddy/binaries/python/envs/default/bin/python   # 需要 Pillow

# 0) 什么都不想管：丢一张带背景的图进去，自动出透明 PNG
$PY cutout.py auto 一张带背景的图.jpg          # → 同名 -cutout.png
$PY cutout.py auto 一整个目录/                 # → 批量

# 1) 复杂背景 → 透明 PNG（Vision 主体分割）
$PY cutout.py vision 输入.png 输出.png

# 2) 纯色底 → 透明 PNG（色键 + 边缘去溢色）
$PY cutout.py chroma 输入.png 输出.png --key '#ff00ff' --tolerance 60

# 3) 整张 sheet 去背后按网格切帧，统一贴成 96x112
$PY cutout.py sheet sheet.png out/ --grid 8x1 --canvas 96x112 \
      --names run-1,run-2,run-3,run-4,run-5,run-6,run-7,run-8

# 4) 裁掉多余透明边 / 贴统一画布
$PY cutout.py trim   输入.png 输出.png
$PY cutout.py canvas 输入.png 输出.png --canvas 256x384 --margin 4

# 5) 交付前校验：PNG / RGBA / 尺寸 / 四角透明 / 覆盖率 / 色键残留
$PY cutout.py validate assets/character --size 96x112
```

`input` / `output` 都可以传目录，自动批量处理。

### `auto` 怎么判断走哪条路线

取样图片四条边的像素，看底色平不平：

| 判断 | 路线 | 判据 |
|---|---|---|
| 输入已经带 alpha | 直接透传（只裁边） | alpha 最小值 < 250 |
| 平底且不亮 | 色键，底色自动识别 | 边带标准差 ≤ 14 且亮度 ≤ 205 |
| 其它 | Vision 主体分割 | 照片 / 插画背景 / 白灰黑底 |
| Vision 报 `no foreground instance` | 原样输出 + `SKIP` 提示 | 整张图就是场景，没有可分离主体 |

整张场景概念图（背景图、关卡图）走到 Vision 会报「找不到主体」—— 那不是失败，
它本身就是背景，不需要抠；`auto` 会打印 `SKIP` 并原样输出，不会崩。批量模式下单张失败也不影响整批。

亮底（>205）不走色键是刻意的：白、米白、浅灰的底，主体内部常有同色（高光、白衣、纸纹），
色键会在主体上打洞，而打洞比边缘毛糙致命得多。色键结果还会做覆盖率兜底，<2% 或 >98% 自动回退 Vision。

## 为什么必须做「统一画布」

动画帧如果各自裁到内容边界，播放时会抖动 —— 角色一会儿贴地一会儿悬空。
`--canvas 96x112` 会把每一帧等比缩放居中贴到同一张画布上，帧与帧的重心才对得齐。
需要贴地对齐的角色用 `canvas --anchor bottom`。

## 生图侧的配套约定（关键）

抠图效果好不好，一半取决于生图时的提示词。在两个项目里都验证过的写法：

1. 明确要求 **flat pure magenta `#ff00ff` background**（不要用白色，白色常出现在角色身上）。
2. 加 **no gradient, no shadow, no ground plane, no vignette** —— 渐变的底抠不干净。
3. 加 **no baked text, no watermark, no border**。
4. 需要多状态时让模型出一张 **component sheet**（同族同一剪影，只变状态），
   再用 `sheet` 命令切 —— 比逐张生成更省事，且形状天然一致。
5. 洋红/绿幕会和主体边缘产生溢色，`chroma` 默认开启 despill（把色键主导通道压到其它通道的最大值）。

## 验收标准（照抄原项目的硬约束）

- 必须是 **RGBA PNG**，四角完全透明。
- 图标类资产要留 **纯透明的安全区**，避免运行时光晕糊到边框。
- 可见覆盖率低于 5% 基本是出错了（空图或抠废）。
- 色键残留像素数必须为 0。

## 实测数据（本机 macOS 26.2 / M 系列）

| 用例 | 结果 |
|---|---|
| `vision` 1536×1024 三视图立绘 | 2.5 秒，透明区 61%，发丝边缘保留 |
| `chroma` 洋红底 384×112 角色帧 | alpha 与真值 IoU **93.6%**，色键残留 **0** 像素 |
| `sheet` 768×112 → 8 帧 96×112 | 8/8 通过尺寸校验 |
