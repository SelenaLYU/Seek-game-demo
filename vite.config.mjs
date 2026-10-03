import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const assetsRoot = resolve(projectRoot, 'assets');

// Phaser still loads a few files by their literal assets/... paths. Vite only
// emits imported files, so preserve those literal paths in the published site.
function runtimeAssetPaths() {
  const paths = new Set();
  // 必须排除注释行：文档里写 'assets/….png' 这类示例（或省略号）会被当成真路径，
  // 直接导致 closeBundle 抛 "Invalid Phaser asset path" 而构建失败。
  const commentOnly = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);
  const looksLikeFile = (value) => !/[\u2026]/.test(value) && /^[\w./@-]+\.[a-z0-9]+$/i.test(value);
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        const source = readFileSync(file, 'utf8');
        for (const [index, line] of source.split('\n').entries()) {
          if (commentOnly(line)) continue;
          for (const match of line.matchAll(/(['"`])(assets\/[^'"`\r\n]+)\1/g)) {
            if (looksLikeFile(match[2])) paths.add(match[2]);
            else throw new Error(`Suspicious Phaser asset path at ${file}:${index + 1}: ${match[2]}`);
          }
        }
      }
    }
  };
  visit(resolve(projectRoot, 'src'));
  return paths;
}

function copyPhaserAssets() {
  let outputDirectory;
  return {
    name: 'copy-phaser-runtime-assets',
    apply: 'build',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      for (const assetPath of runtimeAssetPaths()) {
        const source = resolve(projectRoot, assetPath);
        if (!source.startsWith(assetsRoot + sep) || !existsSync(source)) {
          throw new Error(`Invalid Phaser asset path: ${assetPath}`);
        }
        const destination = resolve(outputDirectory, assetPath);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(source, destination);
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [copyPhaserAssets()],
});
