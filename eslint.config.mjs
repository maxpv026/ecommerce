import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored third-party build artefacts: three.js's Draco decoder is
    // shipped as-is (minified emscripten output) and is not our source.
    "public/draco/**",
    // Generated Prisma client.
    "lib/generated/**",
  ]),
]);

export default eslintConfig;
