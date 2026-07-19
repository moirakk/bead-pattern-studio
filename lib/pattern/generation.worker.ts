import { generatePattern, type PatternGenerationInput, type PatternGenerationResponse } from "./generation";

type WorkerScope = {
  onmessage: ((event: MessageEvent<PatternGenerationInput>) => void) | null;
  postMessage(message: PatternGenerationResponse): void;
};

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  try {
    workerScope.postMessage({ ok: true, pattern: generatePattern(event.data) });
  } catch (error: unknown) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "图纸生成失败。",
    });
  }
};
