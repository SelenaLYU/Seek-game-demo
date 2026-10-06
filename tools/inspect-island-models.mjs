#!/usr/bin/env node
/**
 * Read-only GLB inventory for Memory Island assets. Reports mesh/node/material,
 * texture dimensions and accessor bounds without modifying source files.
 * Usage: node tools/inspect-island-models.mjs [dir]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const directory = resolve(process.argv[2] ?? 'public/island-models');
const files = readdirSync(directory).filter(file => file.endsWith('.glb')).sort();
for (const file of files) {
  const bytes = readFileSync(join(directory, file));
  if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${file}: not a GLB`);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const bounds = [];
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessor = document.accessors?.[primitive.attributes?.POSITION];
      if (accessor?.min && accessor?.max) bounds.push({ min: accessor.min, max: accessor.max });
    }
  }
  const images = (document.images ?? []).map(image => {
    const view = document.bufferViews?.[image.bufferView];
    if (!view) return { name: image.name ?? '(unnamed)', mimeType: image.mimeType ?? 'unknown' };
    const start = 20 + jsonLength + 8 + view.byteOffset;
    const data = bytes.subarray(start, start + view.byteLength);
    if (data[0] === 0x89 && data.toString('ascii', 1, 4) === 'PNG') {
      return { name: image.name ?? '(unnamed)', mimeType: 'image/png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    }
    if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
      const kind = data.toString('ascii', 12, 16);
      if (kind === 'VP8X') return { name: image.name ?? '(unnamed)', mimeType: 'image/webp', width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
      return { name: image.name ?? '(unnamed)', mimeType: 'image/webp', width: null, height: null };
    }
    return { name: image.name ?? '(unnamed)', mimeType: image.mimeType ?? 'embedded' };
  });
  console.log(JSON.stringify({
    file,
    bytes: bytes.length,
    meshes: (document.meshes ?? []).length,
    nodes: (document.nodes ?? []).length,
    namedNodes: (document.nodes ?? []).map(node => node.name).filter(Boolean),
    materials: (document.materials ?? []).length,
    images,
    primitiveBounds: bounds,
  }));
}
