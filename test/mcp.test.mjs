import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/mcp.mjs";

test("initialize returns server metadata", async () => {
  const response = await handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(response.result.serverInfo.name, "substack-draft-mcp");
  assert.deepEqual(response.result.capabilities, { tools: {} });
});

test("tools/list includes safe draft tools", async () => {
  const response = await handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = response.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("create_draft"));
  assert.ok(names.includes("update_draft"));
  assert.ok(names.includes("build_article_package"));
  assert.ok(names.includes("build_thumbnail_prompt"));
  assert.ok(names.includes("validate_article_package"));
  assert.ok(names.includes("diff_text"));
  assert.ok(names.includes("list_drafts"));
  assert.ok(names.includes("get_draft"));
  assert.ok(names.includes("set_cover_image"));
  assert.ok(names.includes("upload_image"));
  assert.equal(names.includes("publish_draft"), false);
  assert.equal(names.includes("delete_draft"), false);
  assert.equal(names.includes("post_note"), false);
});

test("tools/call render_body returns text content", async () => {
  const response = await handleRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "render_body",
      arguments: { body: "hello" },
    },
  });
  const parsed = JSON.parse(response.result.content[0].text);
  assert.equal(parsed.content[0].content[0].text, "hello");
});

test("tools/call build_article_package returns article fields", async () => {
  const response = await handleRequest({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "build_article_package",
      arguments: { topic: "Substack MCP" },
    },
  });
  const parsed = JSON.parse(response.result.content[0].text);
  assert.match(parsed.title, /Substack MCP/);
  assert.match(parsed.thumbnailPrompt, /16:9/);
});
