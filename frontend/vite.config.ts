import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const skeletonRoot = fileURLToPath(
  new URL("../shared/skeleton", import.meta.url)
);

export default defineConfig({
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        skeletonRoot,
      ],
    },
  },
  resolve: {
    // Aliases point at skeleton TS source; don't override conditions globally —
    // that breaks packages like motion/react that use conditional exports.
    alias: {
      "@ojustdance/skeleton/fixtures": `${skeletonRoot}/src/fixtures.ts`,
      "@ojustdance/skeleton": `${skeletonRoot}/src/index.ts`,
    },
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
});
