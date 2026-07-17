import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the bead pattern studio shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>拼豆图纸转换器<\/title>/i);
  assert.match(html, /Fuse Beads Pattern Studio/);
  assert.match(html, /任意图片转拼豆图纸/);
  assert.match(html, /上传图片/);
  assert.match(html, /图纸编辑/);
  assert.match(html, /导入店铺色卡 CSV/);
  assert.match(html, /我的拼豆作品/);
  assert.match(html, /上传第一张图片/);
  assert.match(html, /导入备份/);
  assert.match(html, /备份作品/);
  assert.match(html, /搜索作品名称/);
  assert.match(html, /按最近保存/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|codex-preview/i);
});
