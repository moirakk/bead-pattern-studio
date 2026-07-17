import assert from "node:assert/strict";
import test from "node:test";
import { COMMUNITY_SAMPLE_POSTS, createPreviewPattern, selectCommunityPosts } from "../lib/community/feed";
import { createRemixedProject } from "../lib/community/remix";
import { makePdfFromJpegPages } from "../lib/export/pdf";
import { calculatePosterPatternRect } from "../lib/export/project-poster";
import { createProjectBackup, mergeSavedProjects, parseProjectBackup, type SavedProject } from "../lib/projects/backup";
import { duplicateSavedProject, filterAndSortProjects, renameSavedProject, setSavedProjectCategory } from "../lib/projects/library";
import { loadSavedProjects, saveSavedProjects } from "../lib/projects/storage";
import {
  buildPattern,
  canRedoPattern,
  canUndoPattern,
  colorDistance,
  commitPattern,
  createBeadColor,
  createPatternHistory,
  hexToRgb,
  makeMard221Palette,
  nearestColor,
  paintPatternArea,
  paintPatternCell,
  parsePaletteCsv,
  redoPattern,
  rgbToHex,
  rgbToLab,
  resetPatternHistory,
  summarizePattern,
  undoPattern,
} from "../lib/pattern";
import type { RGB } from "../lib/pattern";

const black = createBeadColor("B", "Black", "#000000");
const white = createBeadColor("W", "White", "#ffffff");
const red = createBeadColor("R", "Red", "#ff0000");
const blue = createBeadColor("BL", "Blue", "#0000ff");
const palette = [black, white, red, blue];

test("converts hex and RGB consistently", () => {
  assert.deepEqual(hexToRgb("#f0a128"), { r: 240, g: 161, b: 40 });
  assert.equal(rgbToHex({ r: 240.2, g: 161.4, b: 40.49 }), "#f0a128");
});

test("matches nearest bead color in Lab space", () => {
  assert.equal(nearestColor({ r: 250, g: 12, b: 18 }, palette).code, "R");
  assert.equal(nearestColor({ r: 245, g: 246, b: 248 }, palette).code, "W");
});

test("Lab distance is zero for identical colors", () => {
  const lab = rgbToLab({ r: 128, g: 64, b: 32 });
  assert.equal(colorDistance(lab, lab), 0);
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

test("loads built-in MARD 221 palette with verified sample codes", () => {
  const mard = makeMard221Palette();
  const byCode = new Map(mard.map((color) => [color.code, color.hex]));

  assert.equal(mard.length, 221);
  assert.equal(byCode.get("A1"), "#faf4c8");
  assert.equal(byCode.get("B1"), "#e6ee31");
  assert.equal(byCode.get("H7"), "#000000");
  assert.equal(byCode.get("M15"), "#757d78");
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
  const backup = createProjectBackup([project], "2026-07-17T09:00:00.000Z");
  const restored = parseProjectBackup(backup);

  assert.deepEqual(restored, [project]);
  assert.throws(() => parseProjectBackup('{"format":"unknown","version":1,"projects":[]}'), /无法识别/);
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
  assert.throws(() => renameSavedProject(original, "   "), /不能为空/);
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
  assert.ok(COMMUNITY_SAMPLE_POSTS.every((post) => post.paletteName === "MARD 221 标准色卡"));
  assert.ok(COMMUNITY_SAMPLE_POSTS.every((post) => post.updates.length >= 2));
});

test("remixes a community pattern into an editable MARD 221 project with attribution", () => {
  const post = COMMUNITY_SAMPLE_POSTS[0];
  const project = createRemixedProject(post, "remix-test", "2026-07-17T12:00:00.000Z");
  const mardCodes = new Set(makeMard221Palette().map((color) => color.code));

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
