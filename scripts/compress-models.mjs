// Compresses the raw refrigerant-cylinder exports into web-deliverable .glb.
//
// The Meshy exports land at 22–95 MB each: ~3 M triangles of uncompressed
// float32 geometry plus 4–16 MB of JPEG. That is a film asset, not a product
// thumbnail — a single product page was pulling up to 95 MB, and Vercel caps
// a static file at 100 MB, so the largest was one re-export away from failing
// to deploy.
//
// The pipeline is the standard one:
//
//   dedup → weld → simplify → prune → textureCompress → Draco
//
// Simplification does the heavy lifting (a smooth cylinder does not need
// 3 M triangles when a normal map carries the surface detail); Draco then
// compresses what remains. Textures are resized and moved to WebP, with the
// normal map held at a higher quality because lossy chroma artefacts there
// show up as visible shading noise on a metal surface.
//
// Usage:  node scripts/compress-models.mjs <inputDir> <outputDir>
//
// The output is what ships in public/. Keep the raw exports somewhere
// outside the repo — this is lossy and not reversible.

import { readdirSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  draco,
  prune,
  simplify,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import draco3d from "draco3dgltf";
import sharp from "sharp";

/**
 * Fraction of vertices to keep.
 *
 * 2% of ~1.5 M vertices lands around 30 k, which is still far more than a
 * capsule with a valve needs at the sizes we render (a 620 px hero stage and
 * a 168 px grid tile). `error` is the real guard: meshoptimizer stops early
 * rather than exceed it, so a shape that cannot survive the ratio keeps its
 * silhouette instead.
 */
const TARGET_RATIO = 0.02;

/** Max deviation, as a fraction of mesh radius. 0.1% is imperceptible here. */
const MAX_ERROR = 0.001;

/** Plenty for a hero stage; the source maps are 2–4 k and mostly flat metal. */
const TEXTURE_SIZE = 2048;

const [, , inputDir = "public", outputDir = "public"] = process.argv;

const mb = (bytes) => (bytes / 1048576).toFixed(2);

async function main() {
  mkdirSync(outputDir, { recursive: true });

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });

  await MeshoptSimplifier.ready;

  const files = readdirSync(inputDir)
    .filter((file) => file.endsWith(".glb"))
    .sort();

  if (files.length === 0) {
    console.error(`No .glb files in ${inputDir}`);
    process.exitCode = 1;
    return;
  }

  let totalBefore = 0;
  let totalAfter = 0;

  for (const file of files) {
    const from = path.join(inputDir, file);
    const to = path.join(outputDir, file);
    const before = statSync(from).size;

    const document = await io.read(from);

    const countTriangles = () =>
      document
        .getRoot()
        .listMeshes()
        .flatMap((mesh) => mesh.listPrimitives())
        .reduce((total, primitive) => {
          const indices = primitive.getIndices();
          const position = primitive.getAttribute("POSITION");
          const count = indices ? indices.getCount() : (position?.getCount() ?? 0);
          return total + count / 3;
        }, 0);

    const trianglesBefore = countTriangles();

    await document.transform(
      dedup(),
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_RATIO, error: MAX_ERROR }),
      // Drops anything the simplification orphaned.
      prune(),
      // Colour and metallic-roughness tolerate chroma loss; a normal map does
      // not — banding there reads as dents in the metal.
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        resize: [TEXTURE_SIZE, TEXTURE_SIZE],
        slots: /^(?!normalTexture).*/,
        quality: 82,
        effort: 90,
      }),
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        resize: [TEXTURE_SIZE, TEXTURE_SIZE],
        slots: /^normalTexture$/,
        quality: 95,
        effort: 90,
      }),
      // Quantisation is per-attribute: positions carry the silhouette, UVs the
      // label registration, normals the least (a normal map overrides them).
      draco({
        method: "edgebreaker",
        quantizePosition: 14,
        quantizeTexcoord: 12,
        quantizeNormal: 10,
      })
    );

    const trianglesAfter = countTriangles();

    await io.write(to, document);
    const after = statSync(to).size;

    totalBefore += before;
    totalAfter += after;

    console.log(
      `${file.padEnd(14)} ${mb(before).padStart(7)} MB → ${mb(after).padStart(6)} MB` +
        `  (${(before / after).toFixed(0)}×)   ` +
        `${Math.round(trianglesBefore).toLocaleString()} → ${Math.round(trianglesAfter).toLocaleString()} tris`
    );
  }

  console.log(
    `\n${files.length} files: ${mb(totalBefore)} MB → ${mb(totalAfter)} MB ` +
      `(${(totalBefore / totalAfter).toFixed(0)}× smaller, ${mb(totalBefore - totalAfter)} MB saved)`
  );
}

await main();
