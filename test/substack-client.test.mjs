import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildDraftPayload, normalizeApiOrigin, normalizeHost, SubstackClient, textToProseMirror } from "../src/substack-client.mjs";

test("normalizeHost accepts hostnames and URLs", () => {
  assert.equal(normalizeHost("example.substack.com"), "example.substack.com");
  assert.equal(normalizeHost("https://example.substack.com/p/post"), "example.substack.com");
});

test("normalizeApiOrigin only accepts HTTPS Substack origins", () => {
  assert.equal(normalizeApiOrigin("https://substack.com/api/v1"), "https://substack.com");
  assert.equal(normalizeApiOrigin("https://example.substack.com"), "https://example.substack.com");
  assert.throws(() => normalizeApiOrigin("http://substack.com"));
  assert.throws(() => normalizeApiOrigin("https://evil.example"));
});

test("textToProseMirror creates paragraphs from blank-line separated text", () => {
  assert.deepEqual(textToProseMirror("first\n\nsecond"), {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "first" }] },
      { type: "paragraph", content: [{ type: "text", text: "second" }] },
    ],
  });
});

test("textToProseMirror supports simple Markdown headings and lists", () => {
  const doc = textToProseMirror("# Title\n\n- one\n- two\n\n1. first\n2. second");
  assert.equal(doc.content[0].type, "heading");
  assert.equal(doc.content[0].attrs.level, 1);
  assert.equal(doc.content[1].type, "bullet_list");
  assert.equal(doc.content[2].type, "ordered_list");
});

test("buildDraftPayload stringifies the ProseMirror body", () => {
  const payload = buildDraftPayload({ title: "Hello", subtitle: "Sub", body: "Body" });
  assert.equal(payload.title, "Hello");
  assert.equal(payload.draft_title, "Hello");
  assert.equal(payload.subtitle, "Sub");
  assert.equal(typeof payload.body, "string");
  assert.equal(JSON.parse(payload.body).content[0].content[0].text, "Body");
});

test("createDraft defaults to dryRun and does not call fetch", async () => {
  let called = false;
  const client = new SubstackClient({
    publicationHost: "example.substack.com",
    fetchImpl: async () => {
      called = true;
      throw new Error("should not be called");
    },
  });

  const result = await client.createDraft({ title: "Draft", body: "Hello" });
  assert.equal(result.dryRun, true);
  assert.equal(result.endpoint, "POST /api/v1/drafts");
  assert.equal(called, false);
});

test("createDraft writes when dryRun is false", async () => {
  const requests = [];
  const client = new SubstackClient({
    publicationHost: "example.substack.com",
    sid: "secret",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ id: 123 }), { status: 200 });
    },
  });

  const result = await client.createDraft({ title: "Draft", body: "Hello", dryRun: false });
  assert.deepEqual(result, { id: 123 });
  assert.equal(requests[0].url, "https://substack.com/api/v1/drafts");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.cookie, "substack.sid=secret");
});

test("fetchWithRetry retries rate-limited writes", async () => {
  let calls = 0;
  const client = new SubstackClient({
    publicationHost: "example.substack.com",
    sid: "secret",
    retryBaseMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "slow down" }), { status: 429 });
      }
      return new Response(JSON.stringify({ id: 456 }), { status: 200 });
    },
  });

  const result = await client.createDraft({ title: "Draft", body: "Hello", dryRun: false });
  assert.deepEqual(result, { id: 456 });
  assert.equal(calls, 2);
});

test("listDrafts calls authenticated draft list endpoint", async () => {
  const requests = [];
  const client = new SubstackClient({
    publicationHost: "example.substack.com",
    sid: "secret",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
    },
  });

  const result = await client.listDrafts({ limit: 5, offset: 2 });
  assert.deepEqual(result, [{ id: 1 }]);
  assert.equal(requests[0].url, "https://substack.com/api/v1/drafts?filter=draft&limit=5&offset=2");
  assert.equal(requests[0].init.headers.cookie, "substack.sid=secret");
});

test("setCoverImage defaults to dryRun", async () => {
  const client = new SubstackClient({
    publicationHost: "example.substack.com",
    fetchImpl: async () => {
      throw new Error("should not be called");
    },
  });

  const result = await client.setCoverImage({ id: "123", imageUrl: "https://cdn.example/image.webp" });
  assert.equal(result.dryRun, true);
  assert.equal(result.payload.cover_image, "https://cdn.example/image.webp");
});

test("uploadImage dryRun validates local file inside image root", async () => {
  const root = await mkdtemp(join(tmpdir(), "substack-draft-mcp-"));
  const imagePath = join(root, "cover.webp");
  await writeFile(imagePath, "fake-webp");

  const client = new SubstackClient({
    publicationHost: "example.substack.com",
    imageRoot: root,
    fetchImpl: async () => {
      throw new Error("should not be called");
    },
  });

  const result = await client.uploadImage({ imagePath });
  assert.equal(result.dryRun, true);
  assert.equal(result.mimeType, "image/webp");
});

test("uploadImage rejects paths outside image root", async () => {
  const root = await mkdtemp(join(tmpdir(), "substack-draft-mcp-root-"));
  const outside = await mkdtemp(join(tmpdir(), "substack-draft-mcp-outside-"));
  const imagePath = join(outside, "cover.webp");
  await writeFile(imagePath, "fake-webp");

  const client = new SubstackClient({
    publicationHost: "example.substack.com",
    imageRoot: root,
  });

  await assert.rejects(() => client.uploadImage({ imagePath }), /SUBSTACK_IMAGE_ROOT/);
});
