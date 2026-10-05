/**
 * 把 Tripo 生成的散布道具（岩石/珊瑚/花丛/树）压成可上线的 GLB。
 *
 * 为什么单独一个脚本而不是塞进 optimize-island-models.mjs：
 *  · 那个脚本面向六栋建筑与角色（贴图 1024、备份在 art/island/models/public-original），
 *    道具是「小、多、会被大量实例化」的资产，贴图 512 足够，显存压力才是主要约束。
 *  · 道具的原始产物在 art/island/props/tripo-out/<name>-<id>/model.glb，脚本按目录名
 *    归一化成 public/island-models/props/<name>.glb，并把 task id 记进 README 便于追溯。
 *
 * 用法：node tools/import-island-props.mjs [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'art/island/props/tripo-out/tripo-out');
const targetDir = join(root, 'public/island-models/props');
/** 道具在总览视角只有几十像素宽，512 足够；改这里等于重新决定显存预算。 */
const TEXTURE_SIZE = 512;
const dryRun = process.argv.includes('--dry-run');
const mib = (bytes) => `${(bytes / 1048576).toFixed(2)}MB`;

if (!existsSync(sourceDir)) throw new Error(`找不到 Tripo 道具产物：${sourceDir}`);
const entries = readdirSync(sourceDir).filter(name => name.startsWith('prop-')).sort();
if (!entries.length) throw new Error('没有 prop-* 目录，先跑 tripo make');
if (!dryRun) mkdirSync(targetDir, { recursive: true });

const provenance = [];
let before = 0, after = 0;
for (const entry of entries) {
  const source = join(sourceDir, entry, 'model.glb');
  if (!existsSync(source)) { console.warn(`跳过（没有 model.glb）：${entry}`); continue; }
  // prop-rock-d5b8e1ee → rock；task id 单独记进 README
  const [, ...rest] = entry.split('-');
  const name = rest.slice(0, -1).join('-');
  const taskId = rest[rest.length - 1];
  const target = join(targetDir, `${name}.glb`);
  const sourceBytes = statSync(source).size;
  before += sourceBytes;
  provenance.push({ name, taskId });
  if (dryRun) { after += sourceBytes; console.log(`(dry-run) ${name}: ${mib(sourceBytes)}`); continue; }
  execFileSync('npx', [
    '--yes', '@gltf-transform/cli@latest', 'optimize', source, target,
    '--compress', 'meshopt',
    '--texture-compress', 'webp',
    '--texture-size', String(TEXTURE_SIZE),
    // 场景图原样保留：道具都是单 mesh，但保持与建筑/角色同一套压缩口径，
    // 以后做实例化或合并时不会因为层级被改写而对不上。
    '--flatten', 'false', '--join', 'false', '--instance', 'false',
    '--simplify', 'false', '--weld', 'false',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  const targetBytes = statSync(target).size;
  after += targetBytes;
  console.log(`${name}: ${mib(sourceBytes)} → ${mib(targetBytes)}`);
}

if (!dryRun) {
  writeFileSync(join(targetDir, 'README.md'), [
    '# 记忆之岛散布道具',
    '',
    '由 `tripo make "<prompt>" --model tripo-p1 -p face_limit=2500..4000 -p pbr=false` 生成，',
    '`node tools/import-island-props.mjs` 归一化命名并压到贴图最长边 512 + meshopt。',
    '原始产物与预览图在 `art/island/props/tripo-out/`（本地保留）。',
    '',
    '| 资产 | Tripo task |',
    '| --- | --- |',
    ...provenance.map(({ name, taskId }) => `| \`${name}.glb\` | \`${taskId}\` |`),
    '',
    '运行时由 `src/island/scatter.ts` 摆放；摆放后必须过 `src/island/clipping.ts` 的',
    '穿模审计（地形穿插、道具互穿、压建筑 footprint、压道路）。',
    '',
  ].join('\n'));
}
console.log(`\n合计 ${mib(before)} → ${mib(after)}（贴图最长边 ${TEXTURE_SIZE}）`);
