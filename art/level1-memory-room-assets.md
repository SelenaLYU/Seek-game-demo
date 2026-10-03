# 第一关记忆之房场景资产和交互资产

## 本次确认范围

本批次对应审核编号 `03`、`06–14`。房间采用夜晚状态，月光从窗户进入；正式场景底图不包含可交互物件，录音机、童话书、相框、带锁盒子、电池、寄居蟹鱼缸和书桌均以独立透明 PNG 交给程序叠加。

编号 `01`、`02`、`04`、`05` 为探索或组合预览，本次不上传。

## 资产清单

| 编号 | 文件 | 尺寸 | 用途 |
| ---: | --- | ---: | --- |
| 03 | `scene/level1-memory-room-night-empty-v2-1920x1080.png` | 1920×1080 | 第一关记忆之房夜晚空背景，不含交互物 |
| 06 | `assets/environment/room-vintage-cassette-recorder-v1.png` | 1536×1024 | 床头柜上的复古录音机，透明背景 |
| 07 | `assets/items/room-fairytale-book-v1.png` | 1312×1199 | 书柜第一层可点击童话书，透明背景 |
| 08 | `assets/environment/room-photo-frame-empty-v1.png` | 1312×1199 | 拼图交互使用的空相框，透明背景 |
| 09 | `assets/environment/room-lockbox-closed-v1.png` | 1536×1024 | 带锁盒子关闭状态，透明背景 |
| 10 | `assets/environment/room-lockbox-open-battery-v1.png` | 1536×1024 | 带锁盒子打开状态，内部含电池 |
| 11 | `assets/items/room-flashlight-battery-v1.png` | 1536×1024 | 可取出的独立手电筒电池 |
| 12 | `assets/environment/room-hermit-crab-aquarium-v1.png` | 1327×1186 | 透明寄居蟹鱼缸，不含金鱼与蝌蚪 |
| 13 | `assets/environment/room-desk-decorated-empty-slots-v1.png` | 1536×1024 | 完整书桌，保留三个交互物摆放区域 |
| 14 | `assets/environment/room-desk-with-shadow-boat-props-v1.png` | 1600×1100 | 完整书桌，包含笔袋、细尺与三角尺 |

## 场景分层规则

1. `level1-memory-room-night-empty-v2-1920x1080.png` 是没有交互物的环境底图。
2. 录音机放在床右侧床头柜上；童话书放在书柜第一层。
3. 相框应叠放在关闭的带锁盒子上方。玩家完成相框拼图后，才进入盒子开启流程。
4. 盒子开启后切换到打开状态，并显示内部电池；取得电池后，电池作为独立物品进入后续手电筒流程。
5. 寄居蟹鱼缸放在书柜右侧柜面，只包含寄居蟹、沙、石块与水草。
6. 书桌可先显示编号 13；进入光影小船玩法后使用编号 14，或由程序把现有笔袋、细尺、三角尺透明资产叠加到编号 13。
7. 墙上画作继续使用现有的 `assets/environment/room-wall-drawing-incomplete.png`，即没有帆船的版本；帆船与完成状态仍按墙画资产说明分层。

## 画风要求

- 与已确认的第一关海岸背景及房间场景保持同一套水彩水粉手绘动画风格。
- 使用纸张颗粒、概括色块和少量略不规则的深炭色轮廓。
- 夜景保持蓝白月光和清楚可读的家具层次，避免纯黑阴影、高对比电影调色和油亮三维质感。
- 所有交互物缩放接入时保持原始纵横比，不裁掉透明画布中的主体。

## PR 说明

新增第一关“记忆之房”的夜晚空场景底图，以及录音机、童话书、相框、带锁盒子开关状态、电池、寄居蟹鱼缸和书桌交互资产。场景与交互物分层交付，便于程序独立控制点击、拼图、开盒、取电池和光影小船流程。
