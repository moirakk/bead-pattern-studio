import assert from "node:assert/strict";
import test from "node:test";
import { GET as getHealth } from "../app/api/health/route";
import { COMMUNITY_SAMPLE_POSTS, countPreviewPatternColors, createPreviewPattern, selectCommunityPosts, summarizePreviewPatternColors, type CommunityPost } from "../lib/community/feed";
import { createCommunityPublishDraft, parseCommunityPublishDraft } from "../lib/community/draft";
import { createRemixedProject } from "../lib/community/remix";
import { makePdfFromJpegPages } from "../lib/export/pdf";
import { calculatePosterPatternRect } from "../lib/export/project-poster";
import { createProjectBackup, mergeSavedProjects, parseProjectBackup, recoverSavedProjectCollection, type SavedProject } from "../lib/projects/backup";
import { createSavedProjectId, duplicateSavedProject, filterAndSortProjects, renameSavedProject, setSavedProjectCategory } from "../lib/projects/library";
import { loadSavedProjects, saveSavedProjects } from "../lib/projects/storage";
import {
  adjustImagePixels,
  buildPattern,
  canRedoPattern,
  canUndoPattern,
  colorDistance,
  commitPattern,
  createBeadColor,
  createPatternHistory,
  generatePattern,
  generatePatternAsync,
  hexToRgb,
  makeMard221Palette,
  makeMard291Palette,
  nearestColor,
  paintPatternArea,
  paintPatternCell,
  packCanvasPixels,
  parsePaletteCsv,
  redoPattern,
  rgbToHex,
  rgbToLab,
  resetPatternHistory,
  summarizePattern,
  undoPattern,
  type PatternWorker,
} from "../lib/pattern";
import type { RGB } from "../lib/pattern";

const black = createBeadColor("B", "Black", "#000000");
const white = createBeadColor("W", "White", "#ffffff");
const red = createBeadColor("R", "Red", "#ff0000");
const blue = createBeadColor("BL", "Blue", "#0000ff");
const palette = [black, white, red, blue];

test("reports the deployed service boundary accurately", async () => {
  const response = await getHealth();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "bead-pattern-studio",
    persistence: "device-local",
    cloudDatabase: false,
    projectBackupVersion: 2,
    patternGeneration: "worker-with-fallback",
  });
});

test("converts hex and RGB consistently", () => {
  assert.deepEqual(hexToRgb("#f0a128"), { r: 240, g: 161, b: 40 });
  assert.equal(rgbToHex({ r: 240.2, g: 161.4, b: 40.49 }), "#f0a128");
});

test("rejects malformed color inputs instead of silently turning them black", () => {
  assert.throws(() => hexToRgb("not-a-color"), /Invalid hex color/);
  assert.throws(() => rgbToHex({ r: Number.NaN, g: 0, b: 0 }), /RGB channels/);
  assert.throws(() => createBeadColor("", "Empty", "#ffffff"), /cannot be empty/);
});

test("matches nearest bead color in Lab space", () => {
  assert.equal(nearestColor({ r: 250, g: 12, b: 18 }, palette).code, "R");
  assert.equal(nearestColor({ r: 245, g: 246, b: 248 }, palette).code, "W");
});

test("Lab distance is zero for identical colors", () => {
  const lab = rgbToLab({ r: 128, g: 64, b: 32 });
  assert.equal(colorDistance(lab, lab), 0);
});

test("applies non-destructive image adjustments before palette matching", () => {
  const source = [
    { r: 30, g: 80, b: 160 },
    { r: 220, g: 180, b: 90 },
  ];
  const unchanged = adjustImagePixels(source, 2, 1, { brightness: 0, contrast: 0, saturation: 0, backgroundRemoval: "none" });
  const brighter = adjustImagePixels(source, 2, 1, { brightness: 20, contrast: 0, saturation: 0, backgroundRemoval: "none" });

  assert.deepEqual(unchanged, source);
  assert.ok(brighter[0].r > source[0].r && brighter[0].g > source[0].g && brighter[0].b > source[0].b);
  assert.deepEqual(source[0], { r: 30, g: 80, b: 160 });
});

test("removes a corner-colored background while preserving the subject", () => {
  const pixels = Array.from({ length: 49 }, () => ({ r: 242, g: 240, b: 235 }));
  pixels[24] = { r: 195, g: 35, b: 48 };
  const adjusted = adjustImagePixels(pixels, 7, 7, { brightness: 0, contrast: 0, saturation: 0, backgroundRemoval: "strong" });

  assert.deepEqual(adjusted[0], { r: 247, g: 248, b: 251 });
  assert.ok(adjusted[24].r > 170 && adjusted[24].g < 80 && adjusted[24].b < 90);
});

test("validates preprocessing dimensions and neutralizes non-finite adjustments", () => {
  assert.throws(
    () => adjustImagePixels([], 0, 0, { brightness: 0, contrast: 0, saturation: 0, backgroundRemoval: "none" }),
    /positive integers/,
  );
  assert.deepEqual(
    adjustImagePixels([{ r: 10, g: 20, b: 30 }], 1, 1, {
      brightness: Number.NaN,
      contrast: Number.POSITIVE_INFINITY,
      saturation: Number.NEGATIVE_INFINITY,
      backgroundRemoval: "none",
    }),
    [{ r: 10, g: 20, b: 30 }],
  );
});

test("packs canvas RGBA pixels into composited RGB bytes", () => {
  const packed = packCanvasPixels(new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 0, 0, 0,
  ]), 2, 1);

  assert.deepEqual([...packed], [255, 0, 0, 247, 248, 251]);
  assert.throws(() => packCanvasPixels(new Uint8ClampedArray(3), 1, 1), /RGBA values/);
});

test("generates the same pattern through the asynchronous fallback", async () => {
  const makeInput = () => ({
    pixels: new Uint8ClampedArray([255, 0, 0, 250, 250, 250]),
    width: 2,
    height: 1,
    palette,
    colorLimit: 4,
    ditherMode: "none" as const,
    imageAdjustments: { brightness: 0, contrast: 0, saturation: 0, backgroundRemoval: "none" as const },
  });

  assert.deepEqual(await generatePatternAsync(makeInput(), { workerFactory: null }), generatePattern(makeInput()));
});

test("returns worker generation results and releases the worker", async () => {
  let terminated = false;
  const input = {
    pixels: new Uint8ClampedArray([0, 0, 0]),
    width: 1,
    height: 1,
    palette,
    colorLimit: 4,
    ditherMode: "none" as const,
    imageAdjustments: { brightness: 0, contrast: 0, saturation: 0, backgroundRemoval: "none" as const },
  };
  const expected = generatePattern({ ...input, pixels: input.pixels.slice() });
  const worker: PatternWorker = {
    onmessage: null,
    onerror: null,
    postMessage() {
      queueMicrotask(() => worker.onmessage?.({ data: { ok: true, pattern: expected } } as MessageEvent));
    },
    terminate() {
      terminated = true;
    },
  };

  assert.deepEqual(await generatePatternAsync(input, { workerFactory: () => worker }), expected);
  assert.equal(terminated, true);
});

test("falls back to local generation when the worker cannot load", async () => {
  const input = {
    pixels: new Uint8ClampedArray([0, 0, 0]),
    width: 1,
    height: 1,
    palette,
    colorLimit: 4,
    ditherMode: "none" as const,
    imageAdjustments: { brightness: 0, contrast: 0, saturation: 0, backgroundRemoval: "none" as const },
  };
  let terminated = false;
  const worker: PatternWorker = {
    onmessage: null,
    onerror: null,
    postMessage() {
      queueMicrotask(() => worker.onerror?.({ message: "worker unavailable" } as ErrorEvent));
    },
    terminate() {
      terminated = true;
    },
  };

  assert.deepEqual(
    await generatePatternAsync(input, { workerFactory: () => worker }),
    generatePattern(input),
  );
  assert.equal(input.pixels.length, 3);
  assert.equal(terminated, true);
});

test("terminates an in-flight pattern worker when generation is cancelled", async () => {
  const controller = new AbortController();
  let terminated = false;
  let transferredBuffers = 0;
  const worker: PatternWorker = {
    onmessage: null,
    onerror: null,
    postMessage(_message, transfer) {
      transferredBuffers = transfer.length;
    },
    terminate() {
      terminated = true;
    },
  };
  const generation = generatePatternAsync({
    pixels: new Uint8ClampedArray([255, 0, 0]),
    width: 1,
    height: 1,
    palette,
    colorLimit: 4,
    ditherMode: "none",
    imageAdjustments: { brightness: 0, contrast: 0, saturation: 0, backgroundRemoval: "none" },
  }, { signal: controller.signal, workerFactory: () => worker });

  controller.abort();
  await assert.rejects(generation, (error: unknown) => error instanceof Error && error.name === "AbortError");
  assert.equal(transferredBuffers, 1);
  assert.equal(terminated, true);
});

test("builds a pattern and enforces color limit by usage", () => {
  const pixels: RGB[] = [
    { r: 255, g: 0, b: 0 },
    { r: 255, g: 10, b: 10 },
    { r: 255, g: 250, b: 250 },
    { r: 0, g: 0, b: 250 },
  ];
  const pattern = buildPattern(pixels, 2, 2, palette, 2);

  assert.equal(pattern.width, 2);
  assert.equal(pattern.height, 2);
  assert.equal(pattern.cells.length, 4);
  assert.deepEqual([...new Set(pattern.cells.map((cell) => cell.code))].sort(), ["R", "W"]);
});

test("rejects invalid pattern dimensions, limits, and duplicate palette codes", () => {
  assert.throws(() => buildPattern([], 0, 0, palette, 1), /dimensions/);
  assert.throws(() => buildPattern([{ r: 0, g: 0, b: 0 }], 1, 1, palette, 0), /positive integer/);
  assert.throws(() => buildPattern([{ r: 0, g: 0, b: 0 }], 1, 1, [black, { ...white, code: "B" }], 1), /unique/);
});

test("applies optional dithering within the selected color limit", () => {
  const pixels: RGB[] = Array.from({ length: 16 }, () => ({ r: 128, g: 128, b: 128 }));
  const plain = buildPattern(pixels, 4, 4, [black, white], 2);
  const dithered = buildPattern(pixels, 4, 4, [black, white], 2, { ditherMode: "strong" });
  const codes = new Set(dithered.cells.map((cell) => cell.code));

  assert.equal(new Set(plain.cells.map((cell) => cell.code)).size, 1);
  assert.equal(codes.size, 2);
  assert.deepEqual([...codes].sort(), ["B", "W"]);
});

test("summarizes and edits pattern cells", () => {
  const pattern = buildPattern(
    [
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 0, b: 0 },
    ],
    2,
    2,
    palette,
    4,
  );

  const summary = summarizePattern(pattern, palette);
  assert.deepEqual(summary.map((item) => item.code), ["B", "R", "W"]);
  assert.equal(summary.find((item) => item.code === "W")?.count, 2);

  const edited = paintPatternCell(pattern, 0, blue);
  assert.equal(edited.cells[0].code, "BL");
  assert.equal(pattern.cells[0].code, "W");

  const areaEdited = paintPatternArea(pattern, { x: 0, y: 0, width: 2, height: 1 }, red);
  assert.deepEqual(areaEdited.cells.map((cell) => cell.code), ["R", "R", "B", "R"]);
  assert.equal(pattern.cells[0].code, "W");
});

test("summarizes colors by natural color code order", () => {
  const sortedPalette = [
    createBeadColor("A1", "A1", "#111111"),
    createBeadColor("A2", "A2", "#222222"),
    createBeadColor("A10", "A10", "#aaaaaa"),
    createBeadColor("B1", "B1", "#bbbbbb"),
  ];
  const pattern = {
    width: 4,
    height: 1,
    cells: [
      { code: "B1", hex: "#bbbbbb", source: { r: 187, g: 187, b: 187 } },
      { code: "A10", hex: "#aaaaaa", source: { r: 170, g: 170, b: 170 } },
      { code: "A2", hex: "#222222", source: { r: 34, g: 34, b: 34 } },
      { code: "A1", hex: "#111111", source: { r: 17, g: 17, b: 17 } },
    ],
  };

  assert.deepEqual(summarizePattern(pattern, sortedPalette).map((item) => item.code), ["A1", "A2", "A10", "B1"]);
});

test("tracks pattern undo and redo history", () => {
  const pattern = buildPattern(
    [
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 0, b: 0 },
    ],
    2,
    1,
    palette,
    4,
  );
  const edited = paintPatternCell(pattern, 0, blue);
  let history = createPatternHistory(pattern, 5);

  history = commitPattern(history, edited);
  assert.equal(canUndoPattern(history), true);
  assert.equal(canRedoPattern(history), false);
  assert.equal(history.present?.cells[0].code, "BL");

  history = undoPattern(history);
  assert.equal(history.present?.cells[0].code, "W");
  assert.equal(canUndoPattern(history), false);
  assert.equal(canRedoPattern(history), true);

  history = redoPattern(history);
  assert.equal(history.present?.cells[0].code, "BL");

  history = resetPatternHistory(history, pattern);
  assert.equal(history.present?.cells[0].code, "W");
  assert.equal(canUndoPattern(history), false);
  assert.equal(canRedoPattern(history), false);
});

test("parses store palette CSV formats", () => {
  const parsed = parsePaletteCsv(`code,name,hex
SHOP001,Snow,#ffffff
SHOP002,#000000
bad,not-a-color`);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].code, "SHOP001");
  assert.equal(parsed[0].name, "Snow");
  assert.equal(parsed[1].code, "SHOP002");
  assert.equal(parsed[1].name, "SHOP002");
});

test("parses quoted palette names and rejects duplicate color codes", () => {
  const parsed = parsePaletteCsv(`\uFEFFcode,name,hex
SHOP001,"Warm, Paper White",#fefefe
SHOP002,"Gray ""Stone""",#808080`);

  assert.equal(parsed[0].name, "Warm, Paper White");
  assert.equal(parsed[1].name, 'Gray "Stone"');
  assert.throws(() => parsePaletteCsv("A1,#ffffff\na1,#000000"), /重复色号/);
  assert.throws(() => parsePaletteCsv('A1,"Unclosed,#ffffff'), /未闭合/);
});

test("loads built-in MARD 221 palette with verified sample codes", () => {
  const mard = makeMard221Palette();
  const byCode = new Map(mard.map((color) => [color.code, color.hex]));

  assert.equal(mard.length, 221);
  assert.equal(byCode.get("A1"), "#faf4c8");
  assert.equal(byCode.get("B1"), "#e6ee31");
  assert.equal(byCode.get("H7"), "#000000");
  assert.equal(byCode.get("M15"), "#757d78");
});

test("loads the MARD 291 full palette with the 70 extended colors", () => {
  const mard = makeMard291Palette();
  const byCode = new Map(mard.map((color) => [color.code, color.hex]));

  assert.equal(mard.length, 291);
  assert.equal(byCode.get("P1"), "#fcf7f8");
  assert.equal(byCode.get("R28"), "#9c87d6");
  assert.equal(byCode.get("ZG8"), "#ab91c0");
  assert.equal(new Set(mard.map((color) => color.code)).size, 291);
});

test("builds a multi-page PDF from JPEG page images", async () => {
  const tinyJpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}`;
  const pdf = makePdfFromJpegPages([
    { dataUrl: tinyJpeg, imageWidth: 1, imageHeight: 1 },
    { dataUrl: tinyJpeg, imageWidth: 1, imageHeight: 1 },
  ]);

  assert.equal(pdf.type, "application/pdf");
  const text = await pdf.text();
  assert.match(text, /^%PDF-1\.3/);
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/Subtype \/Image/);
});

test("rejects malformed PDF page data", () => {
  assert.throws(
    () => makePdfFromJpegPages([{ dataUrl: "data:image/png;base64,AA==", imageWidth: 1, imageHeight: 1 }]),
    /JPEG/,
  );
  assert.throws(
    () => makePdfFromJpegPages([{ dataUrl: "data:image/jpeg;base64,AA==", imageWidth: 0, imageHeight: 1 }]),
    /dimensions/,
  );
});

function makeSavedProject(id: string, savedAt: string): SavedProject {
  const projectPattern = buildPattern([{ r: 255, g: 0, b: 0 }], 1, 1, [red], 1);
  return {
    id,
    title: `Project ${id}`,
    sourceName: `${id}.png`,
    savedAt,
    pattern: projectPattern,
    palette: [red],
    settings: {
      gridWidth: 1,
      gridHeight: 1,
      colorLimit: 1,
      ditherMode: "none",
      crop: { x: 0, y: 0, width: 100, height: 100 },
      selectedCode: "R",
      paletteName: "Test",
      paletteSourceKind: "imported",
    },
    thumbnail: "",
  };
}

test("round-trips versioned project backups", () => {
  const project = makeSavedProject("one", "2026-07-17T08:00:00.000Z");
  project.settings.imageAdjustments = { brightness: 8, contrast: 12, saturation: 16, backgroundRemoval: "soft" };
  const backup = createProjectBackup([project], "2026-07-17T09:00:00.000Z");
  const restored = parseProjectBackup(backup);

  assert.equal(JSON.parse(backup).version, 2);
  assert.deepEqual(restored, [project]);
  assert.throws(() => parseProjectBackup('{"format":"unknown","version":1,"projects":[]}'), /无法识别/);
});

test("imports legacy v1 project backups", () => {
  const project = makeSavedProject("legacy", "2026-07-17T08:00:00.000Z");
  const backup = JSON.stringify({
    format: "bead-pattern-studio",
    version: 1,
    exportedAt: "2026-07-17T09:00:00.000Z",
    projects: [project],
  });

  assert.deepEqual(parseProjectBackup(backup), [project]);
});

test("makes large project backups substantially smaller in v2", () => {
  const project = makeSavedProject("compact", "2026-07-17T08:00:00.000Z");
  project.pattern = {
    width: 40,
    height: 25,
    cells: Array.from({ length: 1000 }, () => ({
      code: "R",
      hex: "#ff0000",
      source: { r: 255, g: 0, b: 0 },
    })),
  };
  project.settings.gridWidth = 40;
  project.settings.gridHeight = 25;
  const legacy = JSON.stringify({
    format: "bead-pattern-studio",
    version: 1,
    exportedAt: "2026-07-17T09:00:00.000Z",
    projects: [project],
  }, null, 2);
  const compact = createProjectBackup([project], "2026-07-17T09:00:00.000Z");

  assert.ok(compact.length < legacy.length * 0.2, `${compact.length} should be much smaller than ${legacy.length}`);
  assert.deepEqual(parseProjectBackup(compact), [project]);
});

test("rejects internally inconsistent project backups", () => {
  const project = makeSavedProject("unsafe", "2026-07-17T08:00:00.000Z");
  assert.throws(() => createProjectBackup([project, { ...project }]), /重复的作品 ID/);

  const mismatchedPattern = structuredClone(project);
  mismatchedPattern.pattern.cells[0].hex = "#000000";
  assert.throws(() => createProjectBackup([mismatchedPattern]), /损坏或不完整/);

  const poisonedPalette = structuredClone(project);
  poisonedPalette.palette[0].lab.l = 0;
  assert.throws(() => createProjectBackup([poisonedPalette]), /损坏或不完整/);

  const compact = JSON.parse(createProjectBackup([project]));
  compact.projects[0].pattern.cellColors = "//8=";
  assert.throws(() => parseProjectBackup(JSON.stringify(compact)), /损坏或不完整/);
  compact.projects[0].pattern.cellColors = "not-base64";
  assert.throws(() => parseProjectBackup(JSON.stringify(compact)), /损坏或不完整/);
});

test("recovers valid local projects when another stored record is corrupted", () => {
  const project = makeSavedProject("recoverable", "2026-07-17T08:00:00.000Z");
  assert.deepEqual(recoverSavedProjectCollection([{ broken: true }, project]), [project]);
  assert.throws(
    () => parseProjectBackup(JSON.stringify({
      format: "bead-pattern-studio",
      version: 1,
      exportedAt: "2026-07-17T09:00:00.000Z",
      projects: [{ broken: true }, project],
    })),
    /损坏或不完整/,
  );
});

test("merges project backups by id and keeps the newest copy", () => {
  const oldProject = makeSavedProject("same", "2026-07-16T08:00:00.000Z");
  const newProject = makeSavedProject("same", "2026-07-17T08:00:00.000Z");
  const another = makeSavedProject("another", "2026-07-15T08:00:00.000Z");
  const merged = mergeSavedProjects([oldProject, another], [newProject], 12);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].savedAt, newProject.savedAt);
  assert.equal(merged.find((project) => project.id === "same")?.savedAt, newProject.savedAt);
});

function makeMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("falls back to local storage when IndexedDB is unavailable", async () => {
  const localStorage = makeMemoryStorage();
  const project = makeSavedProject("offline", "2026-07-17T10:00:00.000Z");

  const backend = await saveSavedProjects([project], { indexedDB: null, localStorage });
  const loaded = await loadSavedProjects(100, { indexedDB: null, localStorage });

  assert.equal(backend, "localstorage");
  assert.equal(loaded.backend, "localstorage");
  assert.deepEqual(loaded.projects, [project]);
});

test("searches and sorts the project library", () => {
  const small = makeSavedProject("small", "2026-07-16T10:00:00.000Z");
  small.title = "A 蓝色小花";
  small.sourceName = "flower.png";
  small.category = "花卉";
  const large = makeSavedProject("large", "2026-07-17T10:00:00.000Z");
  large.title = "B 红色图案";
  large.category = "游戏";
  large.pattern = { ...large.pattern, cells: [...large.pattern.cells, ...large.pattern.cells] };

  assert.deepEqual(filterAndSortProjects([small, large], "flower", "latest"), [small]);
  assert.deepEqual(filterAndSortProjects([small, large], "", "beads"), [large, small]);
  assert.deepEqual(filterAndSortProjects([large, small], "", "name"), [small, large]);
  assert.deepEqual(filterAndSortProjects([small, large], "", "latest", "花卉"), [small]);
});

test("renames and duplicates saved projects without changing the original", () => {
  const original = makeSavedProject("original", "2026-07-16T10:00:00.000Z");
  const renamed = renameSavedProject(original, "  新 名称  ", "2026-07-17T10:00:00.000Z");
  const copy = duplicateSavedProject(original, "copy", "2026-07-17T11:00:00.000Z");

  assert.equal(renamed.title, "新 名称");
  assert.equal(copy.id, "copy");
  assert.equal(copy.title, `${original.title} 副本`);
  assert.notEqual(copy.pattern.cells, original.pattern.cells);
  assert.notEqual(copy.pattern.cells[0].source, original.pattern.cells[0].source);
  assert.notEqual(copy.palette[0].lab, original.palette[0].lab);
  assert.throws(() => renameSavedProject(original, "   "), /不能为空/);
});

test("creates stable-format unique project identifiers", () => {
  assert.equal(createSavedProjectId(1_000, 0), "project-rs-0000000");
  assert.notEqual(createSavedProjectId(1_000, 0.1), createSavedProjectId(1_000, 0.2));
});

test("updates project categories and calculates bounded poster previews", () => {
  const original = makeSavedProject("category", "2026-07-17T10:00:00.000Z");
  const categorized = setSavedProjectCategory(original, "动漫");
  const wide = calculatePosterPatternRect(100, 50);
  const tall = calculatePosterPatternRect(50, 100);

  assert.equal(categorized.category, "动漫");
  assert.equal(original.category, undefined);
  assert.ok(wide.width <= 860 && wide.height <= 650);
  assert.ok(tall.width <= 860 && tall.height <= 650);
  assert.equal(wide.width / wide.height, 2);
  assert.equal(tall.height / tall.width, 2);
});

test("builds and filters the community preview feed", () => {
  const pattern = createPreviewPattern(3, 2, (x, y) => x === y ? "#000000" : "#ffffff");
  const latest = selectCommunityPosts(COMMUNITY_SAMPLE_POSTS, "latest", "全部分类", new Set());
  const flowers = selectCommunityPosts(COMMUNITY_SAMPLE_POSTS, "popular", "花卉", new Set());
  const saved = selectCommunityPosts(COMMUNITY_SAMPLE_POSTS, "saved", "全部分类", new Set(["sample-duck"]));

  assert.equal(pattern.cells.length, 6);
  assert.equal(latest[0].id, "sample-mountain");
  assert.ok(flowers.every((post) => post.category === "花卉"));
  assert.deepEqual(saved.map((post) => post.id), ["sample-duck"]);
  assert.ok(COMMUNITY_SAMPLE_POSTS.every((post) => post.paletteName === "MARD 291 全色色卡"));
  assert.ok(COMMUNITY_SAMPLE_POSTS.every((post) => post.updates.length >= 2));
});

test("remixes a community pattern into an editable MARD 291 project with attribution", () => {
  const post = COMMUNITY_SAMPLE_POSTS[0];
  const project = createRemixedProject(post, "remix-test", "2026-07-17T12:00:00.000Z");
  const mardCodes = new Set(makeMard291Palette().map((color) => color.code));

  assert.equal(project.id, "remix-test");
  assert.equal(project.title, `${post.title} 复刻`);
  assert.equal(project.remixSource?.communityPostId, post.id);
  assert.equal(project.remixSource?.author, post.author);
  assert.equal(project.settings.paletteSourceKind, "builtin");
  assert.equal(project.pattern.cells.length, post.pattern.cells.length);
  assert.ok(project.pattern.cells.every((cell) => mardCodes.has(cell.code)));

  const restored = parseProjectBackup(createProjectBackup([project]));
  assert.deepEqual(restored[0].remixSource, project.remixSource);
});

test("preserves declared community color codes without a 48-color rematch", () => {
  const colors = makeMard291Palette().slice(0, 60);
  const post: CommunityPost = {
    ...COMMUNITY_SAMPLE_POSTS[0],
    id: "sixty-colors",
    pattern: {
      width: 60,
      height: 1,
      cells: colors.map((color) => color.hex),
      codes: colors.map((color) => color.code),
    },
  };
  const project = createRemixedProject(post, "remix-sixty", "2026-07-17T12:00:00.000Z");

  assert.deepEqual(project.pattern.cells.map((cell) => cell.code), colors.map((color) => color.code));
  assert.equal(project.settings.colorLimit, 60);
});

test("summarizes community colors in natural MARD code order", () => {
  const usage = summarizePreviewPatternColors(COMMUNITY_SAMPLE_POSTS[0].pattern);
  const sortedCodes = usage.map((item) => item.code).toSorted((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

  assert.deepEqual(usage.map((item) => item.code), sortedCodes);
  assert.equal(usage.reduce((total, item) => total + item.count, 0), COMMUNITY_SAMPLE_POSTS[0].pattern.cells.length);
  assert.ok(usage.every((item) => item.code && item.name && item.count > 0));
});

test("counts equal-looking community colors by their declared bead code", () => {
  const pattern = { width: 2, height: 1, cells: ["#ffebfa", "#ffebfa"], codes: ["Q4", "R11"] };
  assert.equal(countPreviewPatternColors(pattern), 2);
  assert.deepEqual(summarizePreviewPatternColors(pattern).map((item) => item.code), ["Q4", "R11"]);
});

test("creates and validates a local community publish draft", () => {
  const project = makeSavedProject("publish-draft", "2026-07-18T01:00:00.000Z");
  project.category = "动漫";
  const draft = createCommunityPublishDraft(
    project,
    { authorName: "  Moira  ", description: "  第一次做的小图纸。  ", remixPolicy: "attribution" },
    "2026-07-18T02:00:00.000Z",
  );

  assert.equal(draft.authorName, "Moira");
  assert.equal(draft.description, "第一次做的小图纸。");
  assert.equal(draft.category, "动漫");
  assert.deepEqual(parseCommunityPublishDraft(JSON.stringify(draft), project.id), draft);
  assert.equal(parseCommunityPublishDraft(JSON.stringify(draft), "another-project"), null);
  assert.throws(() => createCommunityPublishDraft(project, { authorName: "", description: "说明", remixPolicy: "view-only" }), /昵称/);
  assert.throws(
    () => createCommunityPublishDraft(project, { authorName: "Moira", description: "说明", remixPolicy: "invalid" as never }),
    /复刻权限/,
  );
});
