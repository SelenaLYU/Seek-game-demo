/**
 * 记忆之岛 3D 模型压缩：把 public/island-models 里的 Tripo 原始导出压到可上线的体积。
 *
 * 为什么必须做（不要靠"感觉还行"验收）：
 *  · 实测 11 个模型合计 43.1MB，进入岛屿要 6.3s 才就绪（还是本机 localhost，无网络延迟）。
 *  · 更严重的是显存：每个建筑 3 张 4096×4096 贴图 = 单栋约 268MB VRAM，六栋超过 1.5GB，
 *    普通笔记本进岛会直接掉帧或上下文丢失。文件大小只是显性症状。
 *
 * 做法（只动贴图分辨率和顶点编码，不动场景图）：
 *  · 贴图最长边压到 1024（岛上建筑在总览视角只有一百多像素宽，4096 完全过剩）
 *  · webp 重编码
 *  · meshopt 量化顶点 + EXT_meshopt_compression
 *  · 显式关掉 flatten/join/instance/simplify/weld：角色模型要跟另外四个动画文件按
 *    节点名绑定，合并或重命名节点会让动画失效。压缩前后节点名必须一致。
 *
 * 运行时要求：GLTFLoader 必须挂 MeshoptDecoder（见 src/island/MemoryIsland.ts）。
 *
 * 用法：
 *   node tools/optimize-island-models.mjs            # 压缩 public/island-models/*.glb
 *   node tools/optimize-island-models.mjs --dry-run  # 只报体积，不写文件
 *
 * 原始文件备份在 art/island/models/public-original/（该目录已 gitignore），
 * 重复执行会从备份重新压缩，不会二次损失。
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = join(root, 'public/island-models');
const backupDir = join(root, 'art/island/models/public-original');
const dryRun = process.argv.includes('--dry-run');
/** 贴图最长边；改这个值等于重新决定显存和清晰度的取舍。 */
const TEXTURE_SIZE = 1024;

const mib = (bytes) => `${(bytes / 1048576).toFixed(2)}MB`;

function optimize(source, destination) {
  execFileSync('npx', [
    '--yes', '@gltf-transform/cli@latest', 'optimize', source, destination,
    '--compress', 'meshopt',
    '--texture-compress', 'webp',
    '--texture-size', String(TEXTURE_SIZE),
    // 场景图必须原样保留：角色动画按节点名绑定（Root/Hip/...），
    // 建筑虽然只有单 mesh，也没有理由让压缩顺手改写层级。
    '--flatten', 'false', '--join', 'false', '--instance', 'false',
    '--simplify', 'false', '--weld', 'false',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
}

const files = readdirSync(modelsDir).filter(name => name.endsWith('.glb')).sort();
if (!files.length) throw new Error(`island-models 里没有 .glb：${modelsDir}`);
if (!dryRun) mkdirSync(backupDir, { recursive: true });

let before = 0, after = 0;
for (const name of files) {
  const target = join(modelsDir, name);
  const backup = join(backupDir, name);
  // 备份即压缩源：二次运行不会在已压缩文件上再压一遍。
  if (!existsSync(backup)) {
    if (dryRun) { console.log(`(dry-run) 无备份，按现状计 ${name}`); after += statSync(target).size; before += statSync(target).size; continue; }
    copyFileSync(target, backup);
  }
  // 备份一定存在（本轮刚建或上轮留下），压缩源固定取备份。
  const source = backup;
  const sourceBytes = statSync(source).size;
  before += sourceBytes;
  if (dryRun) { after += statSync(target).size; continue; }

  // 临时文件必须保留 .glb 后缀：gltf-transform 按扩展名决定输出格式，
  // 写成 `x.glb.tmp` 会被当成 .gltf，产出 JSON + 外部 .bin/.webp 一堆散件。
  const temporary = join(modelsDir, `.${name}.optimizing.glb`);
  optimize(source, temporary);
  const optimizedBytes = statSync(temporary).size;
  // 压缩后反而更大（极小文件重复压缩）就保留原文件，避免无意义改动。
  if (optimizedBytes < statSync(target).size) {
    renameSync(temporary, target);
    after += optimizedBytes;
  } else {
    after += statSync(target).size;
    unlinkSync(temporary);
  }
  console.log(`${name}: ${mib(sourceBytes)} → ${mib(statSync(target).size)}`);
}
console.log(`\n合计 ${mib(before)} → ${mib(after)}（贴图最长边 ${TEXTURE_SIZE}）`);
if (!dryRun) console.log(`原始文件备份：${backupDir.replace(root + '/', '')}`);
