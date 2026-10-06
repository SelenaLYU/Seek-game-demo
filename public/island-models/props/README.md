# 记忆之岛散布道具

由 `tripo make "<prompt>" --model tripo-p1 -p face_limit=2500..4000 -p pbr=false` 生成，
`node tools/import-island-props.mjs` 归一化命名并压到贴图最长边 512 + meshopt。
原始产物与预览图在 `art/island/props/tripo-out/`（本地保留）。

| 资产 | Tripo task |
| --- | --- |
| `blossom.glb` | `63214180` |
| `broadleaf.glb` | `f8cf146b` |
| `bush.glb` | `18923409` |
| `coral.glb` | `005a1a94` |
| `flower-clump.glb` | `7c9178e5` |
| `palm.glb` | `c9af702e` |
| `rock.glb` | `d5b8e1ee` |
| `rock-outcrop.glb` | `25a90d66` |

运行时由 `src/island/scatter.ts` 摆放；摆放后必须过 `src/island/clipping.ts` 的
穿模审计（地形穿插、道具互穿、压建筑 footprint、压道路）。
