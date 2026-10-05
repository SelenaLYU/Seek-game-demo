# 环境贴图（HDR IBL）

| 文件 | 来源 | 授权 | 处理 |
| --- | --- | --- | --- |
| `sky-sunny.hdr` | Poly Haven 的 `kloppenheim_02`（1k 版 `kloppenheim_02_1k.hdr`） | CC0（Poly Haven 全部 HDRI 为 CC0，无需署名） | `magick kloppenheim_02_1k.hdr -resize 512x256! sky-sunny.hdr`，1.74MB → 439KB |

- 下载地址：`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_02_1k.hdr`
- 为什么压到 512×256：软件渲染（SwiftShader，无头截图用）下 PMREM 预卷积会把进岛时间从 18s 拖到 67s；
  512×256 对「天空色 + 地平线渐变」这种低频照明完全够用，同时把下载量降到 439KB。
- 运行时用法见 `src/island/MemoryIsland.ts` 的 HDR 段：`scene.environment` + `scene.environmentIntensity`，
  并把环境与主光一起转到 `KEY_SUN_AZIMUTH`（这颗 HDR 烤进的太阳在方位 54.5°/高度 16.5°，贴地平线且在镜头背后，形体和影子都不出来）。
