"use client";

import { ChangeEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPattern,
  canRedoPattern,
  canUndoPattern,
  colorDistance,
  commitPattern,
  createPatternHistory,
  hexToRgb,
  makeDemoPalette,
  paintPatternCell,
  parsePaletteCsv,
  redoPattern,
  rgbToLab,
  resetPatternHistory,
  summarizePattern,
  undoPattern,
  type BeadColor,
  type PatternHistory,
  type RGB,
} from "@/lib/pattern";

type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const TECH_CARDS = [
  {
    title: "技术方案",
    body: "浏览器端 Canvas 处理图片；核心转换逻辑独立于 UI；色卡用 CSV/JSON 数据源替换；导出端统一从 Pattern 数据生成 PNG/PDF/CSV。",
  },
  {
    title: "数据结构",
    body: "PaletteColor(code/name/hex/rgb/lab)、Pattern(width/height/cells)、Cell(code/hex/source)、Settings(crop/size/colorLimit)。",
  },
  {
    title: "算法设计",
    body: "裁剪后缩放到豆阵尺寸，读取每格平均 RGB，转 Lab 空间计算色差；先全色卡匹配统计，再保留 Top N 色号重映射。",
  },
  {
    title: "可扩展架构",
    body: "后续可把转换函数放入 Web Worker；色卡接店铺后台；项目保存到 IndexedDB/云端；同一核心模块可移植到小程序或 App。",
  },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function base64ToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function makePdfFromJpeg(jpegDataUrl: string, imageWidth: number, imageHeight: number) {
  const imageBytes = base64ToBytes(jpegDataUrl);
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const pushString = (value: string) => {
    const bytes = encoder.encode(value);
    chunks.push(bytes);
    length += bytes.length;
  };
  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    pushString(`${id} 0 obj\n`);
    body();
    pushString("\nendobj\n");
  };

  const pageWidth = Math.min(1440, imageWidth * 0.75);
  const pageHeight = pageWidth * (imageHeight / imageWidth);
  const content = `q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/Im0 Do\nQ`;

  pushString("%PDF-1.3\n");
  object(1, () => pushString("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () => pushString("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  object(3, () =>
    pushString(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(
        2,
      )}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    ),
  );
  object(4, () => {
    pushString(
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
    );
    pushBytes(imageBytes);
    pushString("\nendstream");
  });
  object(5, () => pushString(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  const xrefOffset = length;
  pushString("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    pushString(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushString(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const pdf = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, cursor);
    cursor += chunk.length;
  }
  return new Blob([pdf], { type: "application/pdf" });
}

export function BeadPatternApp() {
  const [palette, setPalette] = useState<BeadColor[]>(makeDemoPalette);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState("未上传图片");
  const [gridWidth, setGridWidth] = useState(48);
  const [gridHeight, setGridHeight] = useState(48);
  const [keepRatio, setKeepRatio] = useState(true);
  const [colorLimit, setColorLimit] = useState(18);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, width: 100, height: 100 });
  const [patternHistory, setPatternHistory] = useState<PatternHistory>(() => createPatternHistory(null));
  const [selectedCode, setSelectedCode] = useState("A01");
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [status, setStatus] = useState("上传图片后会自动生成图纸。");
  const sourcePreviewRef = useRef<HTMLCanvasElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const patternCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedColor = useMemo(
    () => palette.find((color) => color.code === selectedCode) ?? palette[0],
    [palette, selectedCode],
  );
  const pattern = patternHistory.present;
  const stats = useMemo(() => summarizePattern(pattern, palette), [pattern, palette]);
  const totalBeans = pattern ? pattern.width * pattern.height : gridWidth * gridHeight;
  const canUndo = canUndoPattern(patternHistory);
  const canRedo = canRedoPattern(patternHistory);

  useEffect(() => {
    if (!sourceImage) return;
    const timer = window.setTimeout(() => {
      const canvas = workCanvasRef.current ?? document.createElement("canvas");
      workCanvasRef.current = canvas;
      canvas.width = gridWidth;
      canvas.height = gridHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const sourceW = sourceImage.naturalWidth;
      const sourceH = sourceImage.naturalHeight;
      const cropX = (crop.x / 100) * sourceW;
      const cropY = (crop.y / 100) * sourceH;
      const cropW = (crop.width / 100) * sourceW;
      const cropH = (crop.height / 100) * sourceH;

      ctx.clearRect(0, 0, gridWidth, gridHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceImage, cropX, cropY, cropW, cropH, 0, 0, gridWidth, gridHeight);
      const data = ctx.getImageData(0, 0, gridWidth, gridHeight).data;
      const pixels: RGB[] = [];
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3] / 255;
        pixels.push({
          r: Math.round(data[index] * alpha + 247 * (1 - alpha)),
          g: Math.round(data[index + 1] * alpha + 248 * (1 - alpha)),
          b: Math.round(data[index + 2] * alpha + 251 * (1 - alpha)),
        });
      }
      const nextPattern = buildPattern(pixels, gridWidth, gridHeight, palette, colorLimit);
      setPatternHistory((current) => resetPatternHistory(current, nextPattern));
      setActiveCell(null);
      setStatus(`已生成 ${gridWidth} x ${gridHeight}，共 ${gridWidth * gridHeight} 颗豆。`);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [sourceImage, gridWidth, gridHeight, palette, colorLimit, crop]);

  useEffect(() => {
    const canvas = sourcePreviewRef.current;
    if (!canvas || !sourceImage) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const maxWidth = 520;
    const ratio = sourceImage.naturalWidth / sourceImage.naturalHeight;
    canvas.width = maxWidth;
    canvas.height = Math.round(maxWidth / ratio);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
    const x = (crop.x / 100) * canvas.width;
    const y = (crop.y / 100) * canvas.height;
    const w = (crop.width / 100) * canvas.width;
    const h = (crop.height / 100) * canvas.height;
    ctx.fillStyle = "rgba(14, 22, 35, 0.48)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.strokeStyle = "#ff6b4a";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
  }, [sourceImage, crop]);

  useEffect(() => {
    const canvas = patternCanvasRef.current;
    if (!canvas || !pattern) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cellSize = Math.max(5, Math.min(22, Math.floor(980 / Math.max(pattern.width, pattern.height))));
    canvas.width = pattern.width * cellSize;
    canvas.height = pattern.height * cellSize;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pattern.cells.forEach((cell, index) => {
      const x = index % pattern.width;
      const y = Math.floor(index / pattern.width);
      ctx.fillStyle = cell.hex;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    });
    ctx.strokeStyle = cellSize >= 10 ? "rgba(15, 23, 42, 0.28)" : "rgba(15, 23, 42, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= pattern.width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= pattern.height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(canvas.width, y * cellSize + 0.5);
      ctx.stroke();
    }
    if (activeCell !== null) {
      const x = activeCell % pattern.width;
      const y = Math.floor(activeCell / pattern.width);
      ctx.strokeStyle = "#ff6b4a";
      ctx.lineWidth = Math.max(2, cellSize / 5);
      ctx.strokeRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
    }
  }, [pattern, activeCell]);

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const image = new Image();
    image.onload = () => {
      setSourceImage(image);
      setImageName(file.name);
      if (keepRatio) {
        setGridHeight(Math.max(8, Math.round(gridWidth * (image.naturalHeight / image.naturalWidth))));
      }
      setStatus("图片已载入，正在生成图纸。");
    };
    image.src = URL.createObjectURL(file);
  }

  function updateGridWidth(value: number) {
    const next = Math.max(8, Math.min(180, value));
    setGridWidth(next);
    if (keepRatio && sourceImage) {
      setGridHeight(Math.max(8, Math.min(180, Math.round(next * (sourceImage.naturalHeight / sourceImage.naturalWidth)))));
    }
  }

  function updateGridHeight(value: number) {
    setGridHeight(Math.max(8, Math.min(180, value)));
  }

  function updateCrop(key: keyof Crop, value: number) {
    setCrop((current) => {
      const next = { ...current, [key]: value };
      next.width = Math.max(10, Math.min(100, next.width));
      next.height = Math.max(10, Math.min(100, next.height));
      next.x = Math.max(0, Math.min(100 - next.width, next.x));
      next.y = Math.max(0, Math.min(100 - next.height, next.y));
      return next;
    });
  }

  function handlePaletteUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const parsed = parsePaletteCsv(text);
      if (parsed.length) {
        setPalette(parsed);
        setSelectedCode(parsed[0].code);
        setColorLimit(Math.min(colorLimit, parsed.length));
        setStatus(`已导入 ${parsed.length} 个店铺色号。`);
      } else {
        setStatus("色卡 CSV 未识别：请使用 code,name,hex 或 code,hex。");
      }
    });
  }

  function paintCell(index: number) {
    if (!pattern || !selectedColor) return;
    setPatternHistory((current) => {
      if (!current.present || current.present.cells[index]?.code === selectedColor.code) return current;
      return commitPattern(current, paintPatternCell(current.present, index, selectedColor));
    });
    setActiveCell(index);
  }

  function undoEdit() {
    if (!canUndo) return;
    setPatternHistory((current) => undoPattern(current));
    setActiveCell(null);
  }

  function redoEdit() {
    if (!canRedo) return;
    setPatternHistory((current) => redoPattern(current));
    setActiveCell(null);
  }

  function handlePatternClick(event: MouseEvent<HTMLCanvasElement>) {
    if (!pattern) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * pattern.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * pattern.height);
    if (x < 0 || x >= pattern.width || y < 0 || y >= pattern.height) return;
    paintCell(y * pattern.width + x);
  }

  function makeExportCanvas() {
    if (!pattern) return null;
    const legend = summarizePattern(pattern, palette);
    const margin = 72;
    const label = 34;
    const cellSize = Math.max(10, Math.min(28, Math.floor(1200 / Math.max(pattern.width, pattern.height))));
    const gridW = pattern.width * cellSize;
    const gridH = pattern.height * cellSize;
    const legendW = 340;
    const canvas = document.createElement("canvas");
    canvas.width = margin + label + gridW + legendW + margin;
    canvas.height = Math.max(margin * 2 + label + gridH, 420 + legend.length * 28);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#fbfcff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111827";
    ctx.font = "700 30px Arial";
    ctx.fillText("拼豆图纸", margin, 44);
    ctx.font = "16px Arial";
    ctx.fillText(`${imageName} · ${pattern.width} x ${pattern.height} · ${pattern.cells.length} 颗`, margin, 72);

    const startX = margin + label;
    const startY = margin + label + 18;
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let x = 0; x < pattern.width; x += 1) {
      if (x % 5 === 0 || cellSize >= 18) ctx.fillText(String(x + 1), startX + x * cellSize + cellSize / 2, startY - 18);
    }
    ctx.textAlign = "right";
    for (let y = 0; y < pattern.height; y += 1) {
      if (y % 5 === 0 || cellSize >= 18) ctx.fillText(String(y + 1), startX - 10, startY + y * cellSize + cellSize / 2);
    }

    pattern.cells.forEach((cell, index) => {
      const x = index % pattern.width;
      const y = Math.floor(index / pattern.width);
      ctx.fillStyle = cell.hex;
      ctx.fillRect(startX + x * cellSize, startY + y * cellSize, cellSize, cellSize);
      if (cellSize >= 18) {
        ctx.fillStyle = colorDistance(rgbToLab(hexToRgb(cell.hex)), rgbToLab({ r: 255, g: 255, b: 255 })) < 45 ? "#111827" : "#ffffff";
        ctx.font = "9px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cell.code.replace(/^[A-Z]+/, ""), startX + x * cellSize + cellSize / 2, startY + y * cellSize + cellSize / 2);
      }
    });

    ctx.strokeStyle = "rgba(17, 24, 39, 0.28)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= pattern.width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(startX + x * cellSize + 0.5, startY);
      ctx.lineTo(startX + x * cellSize + 0.5, startY + gridH);
      ctx.stroke();
    }
    for (let y = 0; y <= pattern.height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(startX, startY + y * cellSize + 0.5);
      ctx.lineTo(startX + gridW, startY + y * cellSize + 0.5);
      ctx.stroke();
    }

    const legendX = startX + gridW + 52;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#111827";
    ctx.font = "700 22px Arial";
    ctx.fillText("色号图例 / 用量", legendX, startY);
    ctx.font = "13px Arial";
    legend.forEach((item, index) => {
      const y = startY + 34 + index * 28;
      ctx.fillStyle = item.color?.hex ?? "#111827";
      ctx.fillRect(legendX, y - 14, 22, 22);
      ctx.strokeStyle = "rgba(17, 24, 39, 0.35)";
      ctx.strokeRect(legendX, y - 14, 22, 22);
      ctx.fillStyle = "#111827";
      ctx.fillText(`${item.code}  ${item.color?.name ?? ""}`, legendX + 34, y + 2);
      ctx.fillText(`${item.count} 颗`, legendX + 226, y + 2);
    });
    return canvas;
  }

  function exportPng() {
    const canvas = makeExportCanvas();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, "bead-pattern.png");
    }, "image/png");
  }

  function exportPdf() {
    const canvas = makeExportCanvas();
    if (!canvas) return;
    const jpeg = canvas.toDataURL("image/jpeg", 0.92);
    downloadBlob(makePdfFromJpeg(jpeg, canvas.width, canvas.height), "bead-pattern.pdf");
  }

  function exportCsv() {
    if (!pattern) return;
    const rows: string[][] = [];
    rows.push(["section", "key", "value"]);
    rows.push(["meta", "source", imageName]);
    rows.push(["meta", "width", String(pattern.width)]);
    rows.push(["meta", "height", String(pattern.height)]);
    rows.push(["meta", "total_beads", String(pattern.cells.length)]);
    rows.push([]);
    rows.push(["palette_summary", "code", "name", "hex", "count"]);
    for (const item of stats) {
      rows.push(["palette_summary", item.code, item.color?.name ?? "", item.color?.hex ?? "", String(item.count)]);
    }
    rows.push([]);
    rows.push(["grid_codes"]);
    for (let y = 0; y < pattern.height; y += 1) {
      const row = [];
      for (let x = 0; x < pattern.width; x += 1) {
        row.push(pattern.cells[y * pattern.width + x].code);
      }
      rows.push(row);
    }
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "bead-pattern.csv");
  }

  return (
    <main className="bead-app">
      <header className="hero">
        <div>
          <p className="eyebrow">Fuse Beads Pattern Studio</p>
          <h1>任意图片转拼豆图纸</h1>
          <p className="hero-copy">
            上传图片，限定成品尺寸和豆子数量，按店铺色号表自动匹配最近色，再手工微调用量和单格色号。
          </p>
        </div>
        <div className="hero-meter">
          <span>{palette.length}</span>
          <small>可用色号</small>
          <span>{totalBeans.toLocaleString("zh-CN")}</span>
          <small>预计豆数</small>
        </div>
      </header>

      <section className="blueprint" aria-label="产品方案">
        {TECH_CARDS.map((card) => (
          <article key={card.title}>
            <h2>{card.title}</h2>
            <p>{card.body}</p>
          </article>
        ))}
      </section>

      <section className="workspace" aria-label="拼豆图纸工具">
        <aside className="panel controls">
          <div className="panel-title">
            <span>1</span>
            <h2>图片与裁剪</h2>
          </div>
          <label className="file-drop">
            <input type="file" accept="image/*" onChange={handleImageUpload} />
            <strong>上传图片</strong>
            <small>{imageName}</small>
          </label>

          <canvas ref={sourcePreviewRef} className="source-preview" aria-label="裁剪预览" />
          {!sourceImage && <div className="empty-preview">等待图片上传</div>}

          <div className="field-grid">
            <label>
              裁剪 X
              <input type="range" min="0" max="90" value={crop.x} onChange={(event) => updateCrop("x", Number(event.target.value))} />
            </label>
            <label>
              裁剪 Y
              <input type="range" min="0" max="90" value={crop.y} onChange={(event) => updateCrop("y", Number(event.target.value))} />
            </label>
            <label>
              宽度 %
              <input type="range" min="10" max="100" value={crop.width} onChange={(event) => updateCrop("width", Number(event.target.value))} />
            </label>
            <label>
              高度 %
              <input type="range" min="10" max="100" value={crop.height} onChange={(event) => updateCrop("height", Number(event.target.value))} />
            </label>
          </div>

          <div className="panel-title compact">
            <span>2</span>
            <h2>成品尺寸</h2>
          </div>
          <div className="number-row">
            <label>
              宽
              <input type="number" min="8" max="180" value={gridWidth} onChange={(event) => updateGridWidth(Number(event.target.value))} />
            </label>
            <label>
              高
              <input type="number" min="8" max="180" value={gridHeight} disabled={keepRatio} onChange={(event) => updateGridHeight(Number(event.target.value))} />
            </label>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={keepRatio} onChange={(event) => setKeepRatio(event.target.checked)} />
            按源图比例自动高度
          </label>
          <label className="slider-label">
            色数上限：{colorLimit}
            <input type="range" min="2" max={Math.max(2, palette.length)} value={colorLimit} onChange={(event) => setColorLimit(Number(event.target.value))} />
          </label>
        </aside>

        <section className="pattern-stage">
          <div className="stage-toolbar">
            <div>
              <h2>图纸编辑</h2>
              <p>{status}</p>
            </div>
            <div className="export-actions">
              <button type="button" onClick={exportPng} disabled={!pattern}>PNG</button>
              <button type="button" onClick={exportPdf} disabled={!pattern}>PDF</button>
              <button type="button" onClick={exportCsv} disabled={!pattern}>CSV</button>
            </div>
          </div>

          <div className="canvas-wrap">
            {pattern ? (
              <canvas ref={patternCanvasRef} onClick={handlePatternClick} className="pattern-canvas" aria-label="拼豆图纸，可点击单格替换颜色" />
            ) : (
              <div className="pattern-empty">
                <strong>上传图片开始生成</strong>
                <span>这里会显示可点击编辑的拼豆网格。</span>
              </div>
            )}
          </div>

          <div className="paint-bar">
            <div>
              <strong>手工替换单格</strong>
              <span>选择色号后点击任意格子即可替换。</span>
            </div>
            <div className="history-actions">
              <button type="button" onClick={undoEdit} disabled={!canUndo} title="撤销上一次改单格">
                撤销
              </button>
              <button type="button" onClick={redoEdit} disabled={!canRedo} title="重做上一次改单格">
                重做
              </button>
            </div>
            <select value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}>
              {palette.map((color) => (
                <option key={color.code} value={color.code}>{color.code} · {color.name}</option>
              ))}
            </select>
            <span className="swatch-large" style={{ background: selectedColor?.hex }} />
          </div>
        </section>

        <aside className="panel stats-panel">
          <div className="panel-title">
            <span>3</span>
            <h2>色卡与用量</h2>
          </div>
          <label className="file-drop compact-drop">
            <input type="file" accept=".csv,text/csv" onChange={handlePaletteUpload} />
            <strong>导入店铺色卡 CSV</strong>
            <small>code,name,hex 或 code,hex</small>
          </label>

          <div className="palette-grid" aria-label="色号表">
            {palette.map((color) => (
              <button
                key={color.code}
                type="button"
                className={selectedCode === color.code ? "color-chip selected" : "color-chip"}
                onClick={() => setSelectedCode(color.code)}
                title={`${color.code} ${color.name}`}
              >
                <span style={{ background: color.hex }} />
                {color.code}
              </button>
            ))}
          </div>

          <div className="stats-list">
            {stats.length ? (
              stats.map((item) => (
                <div className="stat-row" key={item.code}>
                  <span className="swatch" style={{ background: item.color?.hex ?? "#111827" }} />
                  <strong>{item.code}</strong>
                  <small>{item.color?.name}</small>
                  <b>{item.count}</b>
                </div>
              ))
            ) : (
              <p className="muted">生成图纸后会统计每个色号的用量。</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
