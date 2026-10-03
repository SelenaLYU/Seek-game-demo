# WebP 化 / 加载优化（2026-10-03）

## 0. 改了什么（一句话）

把运行时真正加载的 26 张美术图在**保留 PNG 真源**的前提下转成同名 WebP 并让运行时优先取用；
背景音乐改为场景就绪后后台加载，电台音效在打开面板时按需加载。第一关图片传输 **13.8MB → 1.95MB**，
首屏不再等待 5.3MB/3.9MB 的 BGM。

## 1. 工具

| 文件 | 作用 |
| --- | --- |
| `tools/optimize-images.py` | PNG → WebP（q82 / `-m 6`），逐项打印 before/after；`--report` 只统计，`--force` 重转 |
| `src/assets.ts` | `resolveImageUrl()`：按 basename 把任意资源路径解析到 WebP，找不到就原样返回（自动回落 PNG） |
| `tools/probe-load-perf.mjs` | 加载性能探针：场景就绪 ms / FCP / 传输字节分类 / >60ms 长任务 / 请求失败；另验证后台 BGM 真能播放、电台按需加载与切台；`ORIGIN` 可切 dev(5173) 或 preview(4173) |
| `src/systems/DeferredAudio.ts` | Phaser per-scene loader 的运行期后台音频加载；合并并发 key，场景关闭时丢弃回调，失败静音降级 |

转换规则（脚本文件头有完整说明）：

1. **不删 PNG**。测试逐列读 `level1-stepping-reef-v1.png` 的 alpha 顶面，PNG 是真源。
2. **角色三套序列帧不转**。128×160 逐帧硬边美术，有损会糊帧、破坏掉色键，收益（670KB）不值。
3. 源图与 WebP 同目录同名，basename 唯一性由脚本校验。

## 2. 接入点（两种加载路径都覆盖）

Phaser 里资源有两条互不相通的加载方式，WebP 必须同时接住，否则会漏：

- `import x from '…png?url'` —— 编译期变成带哈希的产物 URL（`foo-BRuNTh02.png`），resolver 会剥哈希再匹配。
- 字面路径 `this.load.image(key, 'assets/…png')` —— resolver 用 `import.meta.glob` 的 WebP URL 表查找同名文件，
  返回 Vite 产物 URL；只有没生成 WebP 时才回落原始 PNG 字面路径。

改动文件：`src/main.ts`、`src/MenuRoomMusic.ts`、`src/systems/DeferredAudio.ts`、`src/scenes/ForestScene.ts`、
`src/scenes/RoomScene.ts`、`src/ui/RadioPuzzleUI.ts`、`src/ui/RoomInteractionCopy.ts`、`src/ui/RoomDeskPopup.ts`、
`src/ui/ShadowBoatPuzzleUI.ts`。

## 3. 实测数据

图片体积（`/usr/bin/python3 tools/optimize-images.py`）：

| 范围 | PNG | WebP | 省 |
| --- | --- | --- | --- |
| 26 张运行时图 | 36.79MB | 3.55MB | **90.4%** |

冷缓存加载探针（`node tools/probe-load-perf.mjs --runs=3`，dev 中位数）：

| 指标 | WebP 后、音频优化前 | 音频延迟加载后 |
| --- | --- | --- |
| 海边 · 场景就绪 | 909ms | 单次 1626ms（运行波动较大，不能据单次断言回退） |
| 海边 · 就绪时 XHR | 9239KB | **212KB**（大约 9MB BGM 已移出关键路径） |
| 记忆之房 · 场景就绪 | 797ms | 单次 1272ms（同上） |
| 记忆之房 · 就绪时 XHR | 5818KB | **0KB** |
| 海边 · 图片传输 | 1950KB | **1950KB** |
| 记忆之房 · 图片传输 | 1824KB | **1824KB** |

生产 preview 单次验收：海边就绪 371ms / 图片 1950KB / BGM +613ms 后已缓存且正在播放；
记忆之房就绪 469ms / 图片 1824KB / BGM +914ms 后已缓存且正在播放。生产服务器本地冷启动数据，
只作本机回归基线，不当作线上用户网络时延承诺。

录音机电台专项验收：两个频道 preload 前均未缓存；打开后 `radio-static`、`radio-wind` 都按需加载并能播放；
切台后旧频道停止；无请求失败。

## 4. 顺手修掉的两个坑

1. **`vite.config.mjs` 会把注释里的示例当资源路径**：`runtimeAssetPaths()` 原来对整份源码做正则，
   文档里写 `assets/….png` 就让构建报 `Invalid Phaser asset path`。现在跳过整行注释，
   且对不像文件名的命中**显式抛错并给出行号**，不再静默。
2. **`window.__game` 只在 DEV 暴露** → 生产包无法用探针/e2e 驱动场景，
   线上问题只能靠猜。现在生产也暴露（Phaser 实例不含敏感信息）。

## 5. 验证

- `npm test` 56/56
- `npm run build` ✅
- `node tools/test-e2e.mjs` 14/14，控制台 0 error
- `node tools/probe-load-perf.mjs --runs=3`（dev）以及 `ORIGIN=http://localhost:4173 node tools/probe-load-perf.mjs --runs=1`（preview）均无请求失败、无 >60ms 长任务；两条 BGM 都在关键路径外加载且真正播放，电台按需加载与切台停止通过

## 6. 下一档待办（还没做）

- [ ] `ending-voice.wav` 4.8MB / `ending.mp4` 27.8MB：旧故事遗留，运行时代码不可达；文件删除是破坏性操作，待用户确认后再清理。
- [ ] `index` chunk 1.43MB（gzip 395KB）：Phaser 本体占大头，收益有限；真要再压只能按场景做 dynamic import，属于结构性改动，建议等第二关美术定稿再做。
