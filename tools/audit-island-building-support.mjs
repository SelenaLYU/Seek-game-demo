/** CPU audit of the game's actual GLBs against its actual rendered grass mesh. */
import * as THREE from 'three';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { groundIslandBuilding, foundationTerrainHeight, buildingGroundFill } from '../src/island/buildingGrounding.ts';

const source = readFileSync(new URL('../src/island/MemoryIsland.ts', import.meta.url), 'utf8');
const terrainCode = source.slice(source.indexOf('  const coastlineRadius'), source.indexOf('  function islandGeometry'));
const terrain = new Function('THREE', 'foundationTerrainHeight',
  stripTypeScriptTypes(terrainCode) + '\nreturn { coastlineRadius, naturalTerrainHeight, terrainHeight, buildingFoundations };',
)(THREE, foundationTerrainHeight);
const sites = new Function('return ' + source.match(/const sites = (\[[\s\S]*?\n  \]);/)[1])();
const paths = [...source.matchAll(/'(\/island-models\/ch0[^']+\.glb)'/g)].map(match => match[1]);
const transformCode = source.slice(source.indexOf('      const rawBounds'), source.indexOf('      model.traverse(object => {'));
const transform = new Function('THREE', 'model', 'height', 'id', stripTypeScriptTypes(transformCode));
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
// CPU geometry inspection needs no image decoder, renderer, browser or GPU.
loader.register(parser => {
  parser.loadTextureImage = () => Promise.resolve(new THREE.Texture());
  return { name: 'CPU_TEXTURE_PLACEHOLDER' };
});
function baseSamples(model, includeUndersides = false) {
  model.updateWorldMatrix(true, true);
  const minimum = new THREE.Box3().setFromObject(model).min.y;
  const samples = [];
  const point = new THREE.Vector3();
  model.traverse(object => {
    if (!object.isMesh) return;
    const positions = object.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      if (point.y <= minimum + 0.03) samples.push(point.clone());
    }
    if (!includeUndersides) return;
    const indices = object.geometry.index;
    const count = indices ? indices.count : positions.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(object.matrixWorld);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.y <= -0.5 && Math.max(a.y, b.y, c.y) <= minimum + 0.35) {
        samples.push(a.clone().add(b).add(c).multiplyScalar(1 / 3));
      }
    }
  });
  return samples;
}
const rows = [];
for (let index = 0; index < sites.length; index++) {
  const bytes = readFileSync(new URL('../public' + paths[index], import.meta.url));
  const { scene: model } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const site = sites[index];
  transform(THREE, model, site.height, index + 1);
  const parent = new THREE.Group();
  parent.position.set(site.x, terrain.naturalTerrainHeight(site.x, site.z), site.z);
  parent.rotation.y = site.yaw;
  parent.add(model);
  const before = baseSamples(model, index === 3 || index === 5).map(point => point.y - terrain.naturalTerrainHeight(point.x, point.z));
  const foundation = groundIslandBuilding(model, terrain.naturalTerrainHeight);
  terrain.buildingFoundations.push(foundation);
  rows.push({ id: index + 1, model, beforeGapMax: Math.max(...before), foundation });
}
const geometryCode = source.slice(source.indexOf('  const terrainSegments'), source.indexOf('  const foamMaterial'));
const geometry = new Function('THREE', 'terrainHeight', 'coastlineRadius', 'mesh', 'meadowTexture', 'clamp01',
  stripTypeScriptTypes(geometryCode) + '\nreturn terrainGeometry;',
)(THREE, terrain.terrainHeight, terrain.coastlineRadius, (g, m) => new THREE.Mesh(g, m), new THREE.Texture(), value => THREE.MathUtils.clamp(value, 0, 1));
const land = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
land.updateMatrixWorld(true);
const ray = new THREE.Raycaster();
const report = rows.map(({ id, model, beforeGapMax, foundation }) => {
  const reportedAsset = id === 4 || id === 6;
  const fill = reportedAsset ? buildingGroundFill(model, terrain.terrainHeight) : null;
  const surfaces = [land];
  if (fill) {
    const soil = new THREE.Mesh(fill, new THREE.MeshBasicMaterial());
    soil.updateMatrixWorld(true);
    surfaces.push(soil);
  }
  const samples = baseSamples(model, reportedAsset);
  const gaps = [];
  let missingGround = 0;
  for (let index = 0; index < samples.length; index++) {
    const point = samples[index];
    ray.set(new THREE.Vector3(point.x, point.y + 5, point.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(surfaces)[0];
    if (!hit) { missingGround++; continue; }
    gaps.push(point.y - hit.point.y);
  }
  return { id, scope: reportedAsset ? 'lowest feet and low downward-face centers' : 'lowest feet only', samples: gaps.length, beforeGapMax, afterGapMin: Math.min(...gaps), afterGapMax: Math.max(...gaps), missingGround, foundationHeight: foundation.height };
});
mkdirSync(new URL('../output/island-recovery/', import.meta.url), { recursive: true });
writeFileSync(new URL('../output/island-recovery/building-support-report.json', import.meta.url), JSON.stringify(report, null, 2));
for (const row of report) console.log(JSON.stringify(row));
if (report.some(row => !row.samples || row.missingGround || row.afterGapMax > 0.02 || row.afterGapMin < -0.08)) process.exitCode = 1;
