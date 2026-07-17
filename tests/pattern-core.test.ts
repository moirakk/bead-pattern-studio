import assert from "node:assert/strict";
import test from "node:test";
import { makePdfFromJpegPages } from "../lib/export/pdf";
import {
  buildPattern,
  canRedoPattern,
  canUndoPattern,
  colorDistance,
  commitPattern,
  createBeadColor,
  createPatternHistory,
  hexToRgb,
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
  assert.equal(summary[0].code, "W");
  assert.equal(summary[0].count, 2);

  const edited = paintPatternCell(pattern, 0, blue);
  assert.equal(edited.cells[0].code, "BL");
  assert.equal(pattern.cells[0].code, "W");

  const areaEdited = paintPatternArea(pattern, { x: 0, y: 0, width: 2, height: 1 }, red);
  assert.deepEqual(areaEdited.cells.map((cell) => cell.code), ["R", "R", "B", "R"]);
  assert.equal(pattern.cells[0].code, "W");
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
