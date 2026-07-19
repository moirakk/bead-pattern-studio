import { generatePattern, type PatternGenerationInput, type PatternGenerationResponse } from "./generation";
import type { Pattern } from "./types";

export type PatternWorker = {
  onmessage: ((event: MessageEvent<PatternGenerationResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: PatternGenerationInput, transfer: Transferable[]): void;
  terminate(): void;
};

export type PatternWorkerFactory = () => PatternWorker;

const PATTERN_WORKER_ASSET_VERSION = "1";

type GeneratePatternAsyncOptions = {
  signal?: AbortSignal;
  workerFactory?: PatternWorkerFactory | null;
};

export function generatePatternAsync(
  input: PatternGenerationInput,
  options: GeneratePatternAsyncOptions = {},
): Promise<Pattern> {
  if (options.signal?.aborted) return Promise.reject(makeAbortError());

  const generateWithoutWorker = () => Promise.resolve().then(() => {
    if (options.signal?.aborted) throw makeAbortError();
    return generatePattern(input);
  });

  const workerFactory = options.workerFactory === undefined
    ? typeof Worker === "undefined"
      ? null
      : () => new Worker(
          new URL(`pattern-generation-worker.js?v=${PATTERN_WORKER_ASSET_VERSION}`, document.baseURI),
        ) as PatternWorker
    : options.workerFactory;

  if (!workerFactory) return generateWithoutWorker();

  let worker: PatternWorker;
  try {
    worker = workerFactory();
  } catch {
    return generateWithoutWorker();
  }

  return new Promise<Pattern>((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", handleAbort);
      worker.terminate();
      callback();
    };
    const handleAbort = () => finish(() => reject(makeAbortError()));

    worker.onmessage = (event) => {
      const response = event.data;
      if (response.ok) {
        finish(() => resolve(response.pattern));
      } else {
        finish(() => reject(new Error(response.error)));
      }
    };
    worker.onerror = () => finish(() => {
      void generateWithoutWorker().then(resolve, reject);
    });
    options.signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      const workerInput = { ...input, pixels: input.pixels.slice() };
      worker.postMessage(workerInput, [workerInput.pixels.buffer]);
    } catch {
      finish(() => {
        void generateWithoutWorker().then(resolve, reject);
      });
    }
  });
}

function makeAbortError() {
  if (typeof DOMException !== "undefined") return new DOMException("Pattern generation was cancelled.", "AbortError");
  const error = new Error("Pattern generation was cancelled.");
  error.name = "AbortError";
  return error;
}
