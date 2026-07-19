import { buildPattern } from "./pattern";
import { adjustImagePixels, type ImageAdjustments } from "./preprocess";
import type { BeadColor, DitherMode, Pattern, RGB } from "./types";

export type PatternGenerationInput = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  palette: BeadColor[];
  colorLimit: number;
  ditherMode: DitherMode;
  imageAdjustments: ImageAdjustments;
};

export type PatternGenerationResponse =
  | { ok: true; pattern: Pattern }
  | { ok: false; error: string };

export function packCanvasPixels(data: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Image dimensions must be positive integers.");
  }
  if (data.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA values, received ${data.length}.`);
  }

  const packed = new Uint8ClampedArray(width * height * 3);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < data.length; sourceIndex += 4, targetIndex += 3) {
    const alpha = data[sourceIndex + 3] / 255;
    packed[targetIndex] = Math.round(data[sourceIndex] * alpha + 247 * (1 - alpha));
    packed[targetIndex + 1] = Math.round(data[sourceIndex + 1] * alpha + 248 * (1 - alpha));
    packed[targetIndex + 2] = Math.round(data[sourceIndex + 2] * alpha + 251 * (1 - alpha));
  }
  return packed;
}

export function generatePattern(input: PatternGenerationInput): Pattern {
  const expectedLength = input.width * input.height * 3;
  if (input.pixels.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} packed RGB values, received ${input.pixels.length}.`);
  }
  const pixels = new Array<RGB>(input.width * input.height);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < input.pixels.length; sourceIndex += 3, targetIndex += 1) {
    pixels[targetIndex] = {
      r: input.pixels[sourceIndex],
      g: input.pixels[sourceIndex + 1],
      b: input.pixels[sourceIndex + 2],
    };
  }
  const adjustedPixels = adjustImagePixels(pixels, input.width, input.height, input.imageAdjustments);
  return buildPattern(adjustedPixels, input.width, input.height, input.palette, input.colorLimit, {
    ditherMode: input.ditherMode,
  });
}
