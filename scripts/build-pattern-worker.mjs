import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(rootDirectory, "public", "pattern-generation-worker.js");
const checkOnly = process.argv.includes("--check");

const result = await build({
  entryPoints: [path.join(rootDirectory, "lib", "pattern", "generation.worker.ts")],
  bundle: true,
  format: "iife",
  legalComments: "none",
  minify: true,
  platform: "browser",
  target: ["es2018"],
  write: false,
});

const output = result.outputFiles[0].contents;

if (checkOnly) {
  let committedOutput;
  try {
    committedOutput = await readFile(outputPath);
  } catch {
    throw new Error("Missing public/pattern-generation-worker.js. Run npm run worker:build.");
  }

  if (!committedOutput.equals(output)) {
    throw new Error("Pattern generation worker is stale. Run npm run worker:build and commit the result.");
  }
} else {
  await writeFile(outputPath, output);
}
