# 决策：记忆之岛改用 HDR 环境光 + Neutral tone mapping + 「一盏跟 HDR 太阳同向的主光」

日期：2026-10-05
状态：已生效（代码在 `src/island/MemoryIsland.ts`；探针与构建回归已过；待确认 HDR 素材来源，见末尾）

## Context

岛屿原来只有两盏解析光：`HemisphereLight('#dce6ff', '#35445f', 1.45)` 加一盏
`DirectionalLight('#ffe4bd', 2.15)`，渲染器是 three 默认的**不做 tone mapping**。

症状不是「暗」，而是**没有形**：半球光把每个朝上的面都抬到同一亮度，定向光只有 2.15 又盖不过它，
于是草地丘陵、屋顶坡面、角色身上读不出明暗过渡，整岛像一张平涂贴图；而美术概念稿
（`art/memory-island-concept-base-v01.png`）是水彩明暗分明的。截图对照见本地
`screenshots/island/lighting-before-after/overview-before-after.jpg`（左=修改前，右=修改后）。

同时发现两个一直在、但被平光掩盖的问题：

1. **阴影贴图没罩住全岛**。旧的 `sun.shadow.camera` 是 `±26 / far 80`，而岛屿实际跨度约 `±34`
   世界单位——最外圈的建筑落在视锥之外，**根本投不出影子**。
2. **没有 IBL**。所有材质都是 `MeshStandardMaterial`，没有环境贴图时金属/粗糙度只回应解析光，
   高光和天光反射全丢。

## Decision

**环境光交给 HDR（PMREM 预卷积），解析光只留一盏主光做形体和投影，外加一盏很弱的补光；
渲染器改用 Khronos PBR Neutral tone mapping。**

现在的光照配方（`mountMemoryIsland` 内，全部在代码注释里逐条说明了理由）：

| 项 | 值 | 作用 |
| --- | --- | --- |
| `renderer.toneMapping` | `NeutralToneMapping`，exposure `1.32` | 压住高光又不洗掉粉彩色，见下方备选 |
| `scene.environment` | `/env/sky-sunny.hdr` 经 `PMREMGenerator.fromEquirectangular` | 天光/地面反弹 + 镜面响应 |
| `scene.environmentIntensity` | `0.45` | 满强度时 HDR 的辐照度会盖过主光，把画面**重新**压平 |
| `HemisphereLight` | `('#cfe0ff', '#41563f', 0.16)` | 只当「暗部不至于纯黑」的地板 |
| `sun` `DirectionalLight` | `('#ffe6c2', 2.8)`，`castShadow` | 唯一的方向光：形体 + 投影 |
| `fill` `DirectionalLight` | `('#bcd9ff', 0.24)`，`(22, 14, -20)` | 弱冷补光，避免背光面糊成一团 |
| `sun.shadow.camera` | `±38`，`far 120` | 覆盖全岛 `±34`，否则外圈建筑不投影 |
| `sun.shadow` 其它 | `bias -0.0009`、`normalBias 0.04`、`radius 2.4` | 配合 `PCFShadowMap` 软化边缘、消痤疮 |

### 主光方向跟随 HDR 里那颗太阳（关键一步）

HDR 自带一颗烤进像素里的太阳，但它的位置由素材决定，不是我们要的方向。旧的
`DirectionalLight` 手工摆在 `(-18, 30, 15)`，结果**两个光源方向不一致**：天空的高光和主光的
投影各说各话，看上去「光从两个地方来」。

现在的做法是**在 CPU 上把 HDR 的太阳找出来，然后把整个环境（连同烤进去的太阳）转到我们想要
的方位角，主光也放到同一方向**——只剩一颗太阳，位置可控：

1. `brightestDirection(texture)` 扫描 equirect 的 half-float 纹素（每 2 px 采一次），
   取亮度最高的那一格转成方向向量。**v 轴存在两种可能**（loader 存的图是翻转的，文件里读不出
   哪边是上），所以两个候选都算，保留 `y` 更大（在地平线以上）的那个——白天的 HDR 太阳一定在天上。
2. `KEY_SUN_AZIMUTH = (-0.94, 0, -0.34).normalize()`：只挑方位角，仰角仍由 HDR 决定。
   岛上的相机从 `+Z` 看过来，太阳放 `-X` 侧才能把影子甩到画面右侧（玩家真正看得到影子的一侧）。
3. `scene.environmentRotation = Euler(0, delta, 0)`（`delta` = 目标方位角 − 烤进太阳的方位角），
   同时 `sun.position = bakedSun.applyAxisAngle(Y, delta) * 64`。

`?artPreview=color` / `?islandPreview=1` / `?focusChapter=N` 这些评审脚手架不受影响。

## Alternatives considered

- **继续调解析光（半球 + 定向），不做 IBL**。按这个方向迭代了好几轮（本地截图目录
  `screenshots/island/light-test/`、`lit/`、`lit2/`、`lit3/`）。半球光越亮越平，怎么调都只有
  「整体变亮/变暗」，做不出坡面和屋檐的过渡；这是方法的上限，不是参数问题。
- **ACES Filmic tone mapping**。代码注释里留了结论：它把绿色**去饱和**成一坨泥色，在这个曝光下
  水彩粉彩全丢。Neutral（Khronos PBR Neutral）只滚降高光、基本不动中间调色相。
- **不做 tone mapping，只调光强**（即原状）。HDR 的动态范围一进来就必须有滚降，否则太阳附近的
  像素直接烧白；没有 tone mapping 时 `environmentIntensity` 也没法用。
- **把 HDR 当天空盒直接 `scene.background = envMap`**。会看到素材里真实的麦田和树线，与概念稿的
  纯色天不符；现在背景仍是 `#91c8f4` 纯色，HDR **只作光照、不作可见天空**。
- **改成低模/离线烘焙光照贴图**。对静态岛屿理论最优，但要重做美术管线；当前目标是先把形体和
  明暗做对，用现成的 IBL 更快。

## Trade-offs accepted

- **多一个 438 KB 的 HDR 资源**（`public/env/sky-sunny.hdr`，Radiance RGBE，512×256，equirect）。
  它走 `public/`，由 Vite 原样拷进 `dist/env/`；探针复核 `/env/sky-sunny.hdr` 返回 200。
  实测模型就绪（`probe-island-load` 单跑）：dev `7262 ms` / 页面总传输 `30.4 MB`，
  生产包（`vite preview :4173`）`6738 ms` / `4.8 MB`；两边都是 `11/11` 模型 · 0 console error，
  没有可见退化。
- **加载时多一次 PMREM 预卷积**（GPU 侧，一次性）。
- 天空仍是纯色。想要「真实天空」得改成天空盒，那时背景与光照方向必须一起重排。
- 太阳方向现在**依赖 HDR 素材**：换 HDR 会自动跟着换太阳位置，但如果新素材没有太阳（阴天/
  室内 HDR），`brightestDirection` 会挑到最亮的云，主光方向会变得不可控——换素材要重跑一次
  截图对照，别只看能不能加载。

## Verification

```bash
npx tsc --noEmit                      # 0 error
npm test                             # 53/53
npm run build                        # tsc + vite build 通过，dist/env/sky-sunny.hdr 存在
node tools/probe-island-load.mjs     # 11/11 模型就绪，0 console error
```

- 浏览器实跑（dev `:5173`）：`?scene=island&islandPreview=1` → `3D 模型 11/11 已载入`、
  `/env/sky-sunny.hdr` 200、**0 console error、0 失败请求**。
- 改动前后对照图（本地，`screenshots/` 按 `.gitignore` 不入库）：
  `lighting-before-after/overview-before-after.jpg`、`.../ch01-before-after.jpg`、
  `.../target-vs-current.jpg`（概念稿 vs 当前渲染）。
- 六栋近景复看：`screenshots/island/lit4/{overview,ch01,ch03,color-overview,color-ch01-door}.png`。

## 待确认

- **`public/env/sky-sunny.hdr` 的来源与授权没有记录**（文件内部只留了 `#?RADIANCE` 头，
  没有软件/作者注释；同目录 `/tmp/keep-1k.hdr` 是它的 1024×512 上游版本，也是线索终点）。
  观感与尺寸像 Poly Haven 一类的 CC0 户外 HDR，但**我没有证据**，入库前需要 Simon 确认来源
  （Poly Haven / 自购 / 自渲），或者换成一份有明确出处的 HDR。
