// Renders each cylinder .glb to a still image for the product grid.
//
// The catalog grid uses static images, not WebGL — a list of thumbnails does
// not justify a renderer per card. These are rendered from the same models,
// with the same camera, lighting and framing the PDP viewer uses, so the
// thumbnail and the interactive stage look like the same object.
//
// Runs three.js in headless Chromium (the models are Draco-compressed and
// carry EXT_texture_webp textures, so a real browser GL stack is the honest
// way to rasterise them), then writes a trimmed, transparent WebP.
//
// Usage: node scripts/render-model-images.mjs [modelDir] [outDir]

import { createServer } from "node:http";
import { createReadStream, existsSync, readdirSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = process.cwd();
const [, , MODEL_DIR = path.join(ROOT, "public"), OUT_DIR = path.join(ROOT, "public/images/products")] =
  process.argv;

/** Square source render; Next/Image takes it down to card size. */
const RENDER_SIZE = 1024;
/** Final stored edge length. Cards show ~270px, so this covers 2× displays. */
const OUTPUT_SIZE = 768;

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".html": "text/html",
  ".glb": "model/gltf-binary",
  ".hdr": "image/vnd.radiance",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8">
<script type="importmap">
{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}
</script>
<style>html,body{margin:0;background:transparent}canvas{display:block}</style>
</head><body>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

// Mirrors components/3d/ProductModelViewer.tsx so the still and the live
// stage frame the model identically.
const FIT_SIZE = 2.2;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(${RENDER_SIZE}, ${RENDER_SIZE});
renderer.setClearAlpha(0);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0, 0.15, 5.2);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(4, 6, 3); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.2); fill.position.set(-4, -1, -3); scene.add(fill);

const pmrem = new THREE.PMREMGenerator(renderer);
const hdr = await new RGBELoader().loadAsync("/public/hdri/studio_small_03_1k.hdr");
scene.environment = pmrem.fromEquirectangular(hdr).texture;
hdr.dispose();

const draco = new DRACOLoader().setDecoderPath("/public/draco/");
const loader = new GLTFLoader().setDRACOLoader(draco);

window.__renderModel = async (url) => {
  const gltf = await loader.loadAsync(url);
  const object = gltf.scene;
  object.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);

  const group = new THREE.Group();
  group.scale.setScalar(longest > 0 ? FIT_SIZE / longest : 1);
  group.rotation.set(0, 0.4, -0.2);
  object.position.copy(center.negate());
  group.add(object);
  scene.add(group);

  renderer.render(scene, camera);
  const data = renderer.domElement.toDataURL("image/png");

  scene.remove(group);
  object.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      for (const m of [child.material].flat()) {
        for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap"]) m?.[k]?.dispose?.();
        m?.dispose?.();
      }
    }
  });
  return data;
};

window.__ready = true;
</script></body></html>`;

function serve() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);

      if (url === "/" || url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(PAGE);
        return;
      }

      // /models/<file> serves whatever directory we were pointed at; every
      // other path is read from the repo, so the importmap resolves.
      const file = url.startsWith("/models/")
        ? path.join(MODEL_DIR, url.slice("/models/".length))
        : path.join(ROOT, url.replace(/^\//, ""));

      if (!existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404).end("not found");
        return;
      }

      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const models = readdirSync(MODEL_DIR)
    .filter((file) => file.endsWith(".glb"))
    .sort();

  if (models.length === 0) {
    console.error(`No .glb files in ${MODEL_DIR}`);
    process.exitCode = 1;
    return;
  }

  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: RENDER_SIZE, height: RENDER_SIZE } });

  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 120000 });

  for (const model of models) {
    const name = path.basename(model, ".glb").toLowerCase();
    const dataUrl = await page.evaluate((url) => window.__renderModel(url), `/models/${model}`);
    const png = Buffer.from(dataUrl.split(",")[1], "base64");

    const out = path.join(OUT_DIR, `${name}.webp`);
    await sharp(png)
      // Crop the empty margin the camera leaves, then re-pad to a square so
      // every thumbnail sits on the same baseline in the grid.
      .trim({ threshold: 1 })
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, effort: 6, alphaQuality: 100 })
      .toFile(out);

    console.log(`${model.padEnd(14)} → ${path.relative(ROOT, out).padEnd(38)} ${(statSync(out).size / 1024).toFixed(0)} KB`);
  }

  await browser.close();
  server.close();

  if (failures.length) {
    console.error(`\nPage errors:\n${failures.join("\n")}`);
    process.exitCode = 1;
  }
}

await main();
