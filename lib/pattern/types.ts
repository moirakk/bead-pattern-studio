export type RGB = { r: number; g: number; b: number };

export type Lab = { l: number; a: number; b: number };

export type BeadColor = {
  code: string;
  name: string;
  hex: string;
  rgb: RGB;
  lab: Lab;
};

export type PatternCell = {
  code: string;
  hex: string;
  source: RGB;
};

export type Pattern = {
  width: number;
  height: number;
  cells: PatternCell[];
};

export type PatternSummaryItem = {
  code: string;
  count: number;
  color?: BeadColor;
  percent: number;
};
