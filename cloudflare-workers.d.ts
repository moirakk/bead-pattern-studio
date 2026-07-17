declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    [key: string]: unknown;
  };
}

interface D1Database {
  prepare(query: string): unknown;
  batch?(statements: unknown[]): Promise<unknown[]>;
  dump?(): Promise<ArrayBuffer>;
  exec?(query: string): Promise<unknown>;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
