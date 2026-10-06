#!/usr/bin/env node
/** Serve a temporary Three.js viewer for one or more local Tripo GLBs. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer, transformWithOxc } from 'vite';

const models = process.argv.slice(2).map(file => path.resolve(file));
if (!models.length) throw new Error('Usage: node tools/preview-tripo-models.mjs <model.glb> [model2.glb ...]');
const vite = await createViteServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true }, appType: 'custom' });
const server = http.createServer(async (req, res) => {
  if (req.url === '/models.json') {
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(models.map(file => ({ name: path.basename(file), url: `/model/${encodeURIComponent(file)}` })))); return;
  }
  if (req.url?.startsWith('/node_modules/')) {
    vite.middlewares(req, res, () => { res.statusCode=404;res.end('not found'); }); return;
  }
  if (req.url?.startsWith('/model/')) {
    const file = decodeURIComponent(req.url.slice('/model/'.length));
    if (!models.includes(file) || !fs.existsSync(file)) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('content-type', 'model/gltf-binary'); fs.createReadStream(file).pipe(res); return;
  }
  if (req.url === '/preview.js') {
    const code = `import * as THREE from '/node_modules/three/build/three.module.js'; import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js'; import { MeshoptDecoder } from '/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js'; import { OrbitControls } from '/node_modules/three/examples/jsm/controls/OrbitControls.js';
const scene=new THREE.Scene();scene.background=new THREE.Color('#a5d3df');const files=await fetch('/models.json').then(r=>r.json());const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.01,1000);camera.position.set(0,2.1,Math.max(4,files.length*1.15));const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);scene.add(new THREE.HemisphereLight('#fff8e9','#4c624f',2));const light=new THREE.DirectionalLight('#fff1d9',3);light.position.set(-3,7,5);scene.add(light);const ground=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshStandardMaterial({color:'#779a68'}));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;scene.add(ground);const grid=new THREE.GridHelper(10,20,'#fff4d8','#90a986');grid.position.y=0;scene.add(grid);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.5,0);controls.update();const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);const rows=[];const spacing=3.5;const offset=(files.length-1)*spacing/2;for(let i=0;i<files.length;i++){const {scene:asset}=await loader.loadAsync(files[i].url);const bounds=new THREE.Box3().setFromObject(asset);const size=bounds.getSize(new THREE.Vector3());const g=new THREE.Group();g.add(asset);asset.position.x-=(bounds.min.x+bounds.max.x)/2;asset.position.y-=bounds.min.y;asset.position.z-=(bounds.min.z+bounds.max.z)/2;g.position.x=i*spacing-offset;scene.add(g);asset.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});rows.push({name:files[i].name,size:size.toArray(),meshes:countMeshes(asset)});}function countMeshes(o){let n=0;o.traverse(x=>{if(x.isMesh)n++});return n}window.modelInfo=rows;const label=document.createElement('pre');label.style='position:fixed;left:12px;top:8px;background:#fffdddcc;padding:10px;font:13px monospace;white-space:pre-wrap';label.textContent=rows.map((x,i)=>i+1+'. '+files[i].name+'\\n size '+x.size.map(v=>v.toFixed(3)).join(' × ')+'\\n meshes '+x.meshes).join('\\n\\n');document.body.append(label);function animate(){requestAnimationFrame(animate);renderer.render(scene,camera)}animate();addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});`;
    res.setHeader('content-type', 'text/javascript'); res.end(code); return;
  }
  if (req.url === '/' || req.url === '/index.html') {
    res.setHeader('content-type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}</style><script type="module" src="/preview.js"></script>'); return;
  }
  vite.middlewares(req, res, () => { res.statusCode=404;res.end('not found'); });
});
server.listen(5188, '127.0.0.1', () => console.log(`Tripo model review: http://127.0.0.1:5188 (${models.length} models)`));
