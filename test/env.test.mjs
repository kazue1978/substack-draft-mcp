import assert from "node:assert/strict";
import test from "node:test";
import { loadDotEnv } from "../src/env.mjs";

test("loadDotEnv does not override existing process env values", () => {
  process.env.SUBSTACK_PUBLICATION_HOST = "already.example";
  loadDotEnv();
  assert.equal(process.env.SUBSTACK_PUBLICATION_HOST, "already.example");
});
