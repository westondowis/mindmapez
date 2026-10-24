import assert from "node:assert/strict";
import test from "node:test";
import { decodeGitContent, encodeGitContent, parseEnvelope } from "./github-store.ts";

test("git content round-trips unicode", () => {
  const text = '{"name":"Café — 🧠"}';
  assert.equal(decodeGitContent(encodeGitContent(text)), text);
});

test("parseEnvelope ignores unknown files", () => {
  const empty = parseEnvelope({ format: "other" });
  assert.equal(empty.backup, null);
  assert.equal(empty.format, "mindmesh-github");
});
