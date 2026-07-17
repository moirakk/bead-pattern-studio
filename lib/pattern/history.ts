import type { Pattern } from "./types";

export type PatternHistory = {
  past: Pattern[];
  present: Pattern | null;
  future: Pattern[];
  limit: number;
};

export function createPatternHistory(pattern: Pattern | null = null, limit = 50): PatternHistory {
  return {
    past: [],
    present: pattern,
    future: [],
    limit,
  };
}

export function resetPatternHistory(history: PatternHistory, pattern: Pattern | null): PatternHistory {
  return createPatternHistory(pattern, history.limit);
}

export function commitPattern(history: PatternHistory, pattern: Pattern): PatternHistory {
  const past = history.present ? [...history.past, history.present].slice(-history.limit) : history.past;
  return {
    ...history,
    past,
    present: pattern,
    future: [],
  };
}

export function undoPattern(history: PatternHistory): PatternHistory {
  const previous = history.past.at(-1);
  if (!previous || !history.present) return history;

  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoPattern(history: PatternHistory): PatternHistory {
  const next = history.future[0];
  if (!next || !history.present) return history;

  return {
    ...history,
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future: history.future.slice(1),
  };
}

export function canUndoPattern(history: PatternHistory) {
  return history.past.length > 0;
}

export function canRedoPattern(history: PatternHistory) {
  return history.future.length > 0;
}
