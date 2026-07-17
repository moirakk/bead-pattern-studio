import { Capacitor } from "@capacitor/core";

export type FileDelivery = "downloaded" | "shared";

function downloadInBrowser(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("无法读取导出文件"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("无法编码导出文件"));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function deliverExportFile(
  blob: Blob,
  filename: string,
  title: string,
): Promise<FileDelivery> {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(blob, filename);
    return "downloaded";
  }

  const [{ Directory, Filesystem }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const path = `exports/${filename}`;
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Cache,
    recursive: true,
  });

  try {
    await Share.share({ title, files: [uri] });
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
  }

  return "shared";
}

export async function selectionHaptic() {
  if (!Capacitor.isNativePlatform()) return;

  const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}
