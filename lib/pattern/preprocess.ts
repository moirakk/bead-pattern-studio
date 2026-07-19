import { colorDistance, rgbToLab } from "./color";
import type { RGB } from "./types";

export type BackgroundRemovalMode = "none" | "soft" | "strong";

export type ImageAdjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  backgroundRemoval: BackgroundRemovalMode;
};

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  backgroundRemoval: "none",
};

const PAPER_BACKGROUND: RGB = { r: 247, g: 248, b: 251 };

export function adjustImagePixels(
  pixels: RGB[],
  width: number,
  height: number,
  adjustments: ImageAdjustments,
): RGB[] {
  if (pixels.length !== width * height) {
    throw new Error(`Expected ${width * height} image pixels, received ${pixels.length}.`);
  }

  const brightness = clamp(adjustments.brightness, -40, 40) * 2.2;
  const contrastInput = clamp(adjustments.contrast, -40, 40) * 2;
  const contrastFactor = (259 * (contrastInput + 255)) / (255 * (259 - contrastInput));
  const saturationFactor = 1 + clamp(adjustments.saturation, -60, 60) / 100;
  const backgroundLab = adjustments.backgroundRemoval === "none" ? null : rgbToLab(averageCornerColor(pixels, width, height));
  const backgroundThreshold = adjustments.backgroundRemoval === "strong" ? 23 : 12;
  const feather = adjustments.backgroundRemoval === "strong" ? 11 : 7;

  return pixels.map((pixel) => {
    if (backgroundLab) {
      const distance = colorDistance(rgbToLab(pixel), backgroundLab);
      if (distance <= backgroundThreshold) return { ...PAPER_BACKGROUND };
      if (distance < backgroundThreshold + feather) {
        const keep = (distance - backgroundThreshold) / feather;
        return adjustPixel(blend(PAPER_BACKGROUND, pixel, keep), brightness, contrastFactor, saturationFactor);
      }
    }
    return adjustPixel(pixel, brightness, contrastFactor, saturationFactor);
  });
}

function adjustPixel(pixel: RGB, brightness: number, contrastFactor: number, saturationFactor: number): RGB {
  const brightened = {
    r: pixel.r + brightness,
    g: pixel.g + brightness,
    b: pixel.b + brightness,
  };
  const contrasted = {
    r: contrastFactor * (brightened.r - 128) + 128,
    g: contrastFactor * (brightened.g - 128) + 128,
    b: contrastFactor * (brightened.b - 128) + 128,
  };
  const luma = contrasted.r * 0.2126 + contrasted.g * 0.7152 + contrasted.b * 0.0722;
  return {
    r: clampChannel(luma + (contrasted.r - luma) * saturationFactor),
    g: clampChannel(luma + (contrasted.g - luma) * saturationFactor),
    b: clampChannel(luma + (contrasted.b - luma) * saturationFactor),
  };
}

function averageCornerColor(pixels: RGB[], width: number, height: number): RGB {
  const sampleWidth = Math.max(1, Math.min(3, width));
  const sampleHeight = Math.max(1, Math.min(3, height));
  const samples: RGB[] = [];
  const starts = [
    [0, 0],
    [Math.max(0, width - sampleWidth), 0],
    [0, Math.max(0, height - sampleHeight)],
    [Math.max(0, width - sampleWidth), Math.max(0, height - sampleHeight)],
  ];
  starts.forEach(([startX, startY]) => {
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        const pixel = pixels[(startY + y) * width + startX + x];
        if (pixel) samples.push(pixel);
      }
    }
  });
  const total = samples.reduce((sum, pixel) => ({ r: sum.r + pixel.r, g: sum.g + pixel.g, b: sum.b + pixel.b }), { r: 0, g: 0, b: 0 });
  return {
    r: total.r / samples.length,
    g: total.g / samples.length,
    b: total.b / samples.length,
  };
}

function blend(from: RGB, to: RGB, amount: number): RGB {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

function clampChannel(value: number) {
  return Math.round(clamp(value, 0, 255));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
