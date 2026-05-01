import assert from "node:assert/strict";
import test from "node:test";
import { buildArticlePackage, buildNoteMarkdown, buildThumbnailPrompt, diffText, validateArticlePackage } from "../src/article-tools.mjs";

test("buildArticlePackage returns draft fields and reusable outputs", () => {
  const article = buildArticlePackage({
    topic: "Substack MCP",
    audience: "AIエージェントで発信したい人",
    keyPoints: ["下書きを作れる", "サムネ案を作れる"],
  });

  assert.match(article.title, /Substack MCP/);
  assert.match(article.body, /## できること/);
  assert.match(article.thumbnailPrompt, /16:9/);
  assert.match(article.noteMarkdown, /^# /);
});

test("buildThumbnailPrompt creates a mobile-readable thumbnail brief", () => {
  const result = buildThumbnailPrompt({ title: "Substack MCPが完成しました" });
  assert.equal(result.aspectRatio, "16:9");
  assert.match(result.prompt, /readable on mobile/);
});

test("buildNoteMarkdown joins title, subtitle, and body", () => {
  const result = buildNoteMarkdown({ title: "Title", subtitle: "Sub", body: "Body" });
  assert.equal(result.markdown, "# Title\n\nSub\n\nBody");
});

test("validateArticlePackage reports issues and stats", () => {
  const result = validateArticlePackage({ title: "Title", body: "# Heading\n\nBody" });
  assert.equal(result.ok, true);
  assert.equal(result.stats.headingCount, 1);

  const invalid = validateArticlePackage({ title: "", body: "" });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.length >= 2);
});

test("diffText creates a compact line diff", () => {
  const result = diffText({ oldText: "a\nb\nc", newText: "a\nB\nc" });
  assert.equal(result.changed, true);
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
  assert.match(result.diff, /-b/);
  assert.match(result.diff, /\+B/);
});
