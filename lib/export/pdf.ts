export type PdfImagePage = {
  dataUrl: string;
  imageWidth: number;
  imageHeight: number;
  pageWidth?: number;
  pageHeight?: number;
};

const A4_PORTRAIT_POINTS = {
  width: 595.28,
  height: 841.89,
};

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

export function makePdfFromJpegPages(pages: PdfImagePage[]) {
  if (!pages.length) {
    throw new Error("makePdfFromJpegPages requires at least one page.");
  }

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

  const pageIds = pages.map((_, index) => 3 + index * 3);

  pushString("%PDF-1.3\n");
  object(1, () => pushString("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () => pushString(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`));

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const imageName = `Im${index}`;
    const pageWidth = page.pageWidth ?? A4_PORTRAIT_POINTS.width;
    const pageHeight = page.pageHeight ?? A4_PORTRAIT_POINTS.height;
    const imageBytes = dataUrlToBytes(page.dataUrl);
    const content = `q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/${imageName} Do\nQ`;

    object(pageId, () =>
      pushString(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(
          2,
        )}] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
    object(imageId, () => {
      pushString(
        `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
      );
      pushBytes(imageBytes);
      pushString("\nendstream");
    });
    object(contentId, () => pushString(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  });

  const xrefOffset = length;
  const objectCount = 3 + pages.length * 3;
  pushString(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let id = 1; id < objectCount; id += 1) {
    pushString(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushString(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const pdf = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, cursor);
    cursor += chunk.length;
  }
  return new Blob([pdf], { type: "application/pdf" });
}
