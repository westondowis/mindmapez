import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { openTestDb, type TestDb } from "../connectors/test-harness.ts";
import { applyVisionCore, saveMediaTranscriptCore } from "./artifact-store.ts";
import { chunkRanges, cleanSegments, encodeWav, formatClock, parseVerboseJson, segmentsText, transcriptionConfig } from "./media-core.ts";
import { sniffRoute } from "./sniff.ts";
import { validateViewerFields } from "./viewer-types.ts";
import { buildVisionMessages, parseVisionReply, visionBody } from "./vision-core.ts";

let n = 0;
const id = () => `i${++n}`;

describe("vision contract", () => {
  test("messages carry the image as an image_url content part and a JSON-only instruction", () => {
    const m = buildVisionMessages("auto", "data:image/jpeg;base64,AAAA");
    const system = m[0]!.content as string;
    assert.match(system, /JSON only/);
    assert.match(system, /never instructions/);
    const parts = m[1]!.content as { type: string; image_url?: { url: string } }[];
    assert.equal(parts[1]!.type, "image_url");
    assert.equal(parts[1]!.image_url?.url, "data:image/jpeg;base64,AAAA");
  });
  test("parses checklists (ids, due dates validated), prompts and photos; tolerates fences", () => {
    const c = parseVisionReply('```json\n{"kind":"checklist","caption":"Todo","items":[{"text":"Buy milk","dueDate":"2026-12-01"},{"text":"Call Bo","dueDate":"tomorrow"}," Pay rent ",{"text":""}]}\n```', "auto", id)!;
    assert.equal(c.kind, "checklist");
    assert.deepEqual(c.items.map((i) => [i.text, i.dueDate, i.completed]), [["Buy milk", "2026-12-01", false], ["Call Bo", undefined, false], ["Pay rent", undefined, false]]);
    assert.ok(c.items.every((i) => i.id.startsWith("i")));
    assert.match(visionBody(c), /- Buy milk/);
    const p = parseVisionReply('{"kind":"prompt","promptText":"You are a helpful chef."}', "auto", id)!;
    assert.equal(p.kind, "prompt");
    assert.equal(p.promptText, "You are a helpful chef.");
    assert.equal(parseVisionReply('{"kind":"checklist","items":[]}', "auto", id)!.kind, "photo");
    assert.equal(parseVisionReply('{"kind":"checklist","items":["a"]}', "ocr", id)!.kind, "photo");
    assert.equal(parseVisionReply("not json", "auto", id), null);
  });
  test("checklist items in viewer state are capped and shape-checked", () => {
    const ok = { items: [{ id: "a", text: "x", completed: false, dueDate: "2026-01-02" }] };
    assert.doesNotThrow(() => validateViewerFields({ viewerType: "interactive_checklist", artifactState: ok }));
    assert.throws(() => validateViewerFields({ artifactState: { items: Array.from({ length: 501 }, (_, i) => ({ id: `${i}`, text: "t", completed: false })) } }));
    assert.throws(() => validateViewerFields({ artifactState: { items: [{ id: "a", text: "x" }] } }));
    assert.throws(() => validateViewerFields({ artifactState: { items: [{ id: "a", text: "x", completed: true, dueDate: "soon" }] } }));
  });
});

describe("media helpers", () => {
  test("WAV header is 16 kHz mono 16-bit PCM and samples are clamped", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]));
    const v = new DataView(wav.buffer);
    assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
    assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
    assert.equal(v.getUint16(22, true), 1);
    assert.equal(v.getUint32(24, true), 16000);
    assert.equal(v.getUint16(34, true), 16);
    assert.equal(v.getUint32(40, true), 8);
    assert.deepEqual([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)], [0, 32767, -32768, 32767]);
  });
  test("chunks are 60 s and stop at the 30-minute cap", () => {
    assert.deepEqual(chunkRanges(130), [{ start: 0, end: 60 }, { start: 60, end: 120 }, { start: 120, end: 130 }]);
    assert.equal(chunkRanges(4 * 3600).length, 30);
    assert.equal(chunkRanges(0).length, 0);
  });
  test("provider: OpenAI verbose_json with LLM_API_KEY, xAI text-only otherwise, none without keys", () => {
    assert.deepEqual(transcriptionConfig({ LLM_API_KEY: "k" }), { provider: "openai", url: "https://api.openai.com/v1/audio/transcriptions", apiKey: "k", segments: true });
    assert.equal(transcriptionConfig({ XAI_API_KEY: "x" })!.segments, false);
    assert.equal(transcriptionConfig({}), null);
  });
  test("verbose_json segments are offset by the chunk start; bad segments are dropped/rejected", () => {
    const r = parseVerboseJson({ text: " hi there ", segments: [{ start: 0.5, end: 1.25, text: " hi " }, { start: "x", text: "bad" }, { start: 2, end: 3, text: "there", speaker: "A" }] }, 60);
    assert.equal(r.text, "hi there");
    assert.deepEqual(r.segments, [{ startSec: 60.5, endSec: 61.25, text: "hi" }, { startSec: 62, endSec: 63, text: "there", speaker: "A" }]);
    assert.equal(segmentsText(r.segments), "hi there");
    assert.equal(formatClock(3725), "1:02:05");
    assert.equal(formatClock(65), "1:05");
    assert.equal(cleanSegments([{ startSec: 2, endSec: 1, text: "x" }]), null);
    assert.equal(cleanSegments("nope"), null);
    assert.equal(cleanSegments(Array.from({ length: 4001 }, () => ({ startSec: 0, endSec: 0, text: "" }))), null);
  });
  test("HEIC routes to the image path (Safari decodes; elsewhere a notice)", () => {
    assert.equal(sniffRoute("IMG_0001.HEIC", ""), "heic");
    assert.equal(sniffRoute("x", "", new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])), "heic");
  });
});

describe("vision + transcript storage (PGLite, real migrations)", () => {
  let db: TestDb;
  const u = "vm-user";
  before(async () => {
    db = await openTestDb();
    await db.migrate();
    await db.sql`insert into memories (id, user_id, title, body, memory_type, viewer_type, media_url, extracted_metadata_json)
      values ('img', ${u}, 'Shot', '', 'photo', 'image', 'data:image/webp;base64,AAAA', ${JSON.stringify({ v: "image", width: 10, height: 10 })}::jsonb)`;
    await db.sql`insert into memories (id, user_id, title, body, memory_type, viewer_type, extracted_metadata_json)
      values ('aud', ${u}, 'Clip', '', 'voice', 'media', ${JSON.stringify({ v: "media", kind: "audio", durationSec: 3, segments: [], originalStored: false })}::jsonb)`;
    await db.sql`insert into memories (id, user_id, title, body, memory_type) values ('txt', ${u}, 'Note', 'mine', 'text')`;
  });
  after(async () => {
    await db.pg.close();
  });

  test("a checklist result switches the viewer and stores items; notes are never overwritten", async () => {
    const r = await applyVisionCore(db.sql, u, "img", { kind: "checklist", caption: "List", ocrText: "", promptText: "", items: [{ id: "a", text: "Milk", completed: false }], body: "- Milk" });
    assert.deepEqual(r, { ok: true, viewerType: "interactive_checklist" });
    const row = (await db.sql<{ viewer_type: string; body: string; s: { items: unknown[] }; m: { caption: string } }>`select viewer_type, body, artifact_state_json as s, extracted_metadata_json as m from memories where id = 'img'`)[0]!;
    assert.equal(row.viewer_type, "interactive_checklist");
    assert.equal(row.body, "- Milk");
    assert.equal(row.s.items.length, 1);
    assert.equal(row.m.caption, "List");
    await applyVisionCore(db.sql, u, "img", { kind: "photo", caption: "A list", ocrText: "Milk", promptText: "", items: [], body: "A list" });
    const again = (await db.sql<{ viewer_type: string; body: string }>`select viewer_type, body from memories where id = 'img'`)[0]!;
    assert.equal(again.viewer_type, "image");
    assert.equal(again.body, "- Milk");
    assert.equal((await applyVisionCore(db.sql, u, "txt", { kind: "photo", caption: "", ocrText: "", promptText: "", items: [], body: "" })).ok, false);
    assert.equal((await applyVisionCore(db.sql, "other", "img", { kind: "photo", caption: "", ocrText: "", promptText: "", items: [], body: "" })).ok, false);
  });
  test("transcripts store segments + text on media memories only", async () => {
    const ok = await saveMediaTranscriptCore(db.sql, u, "aud", { segments: [{ startSec: 0, endSec: 1, text: "hello" }], text: "hello", source: "segments" });
    assert.deepEqual(ok, { ok: true });
    const row = (await db.sql<{ transcript: string; m: { segments: unknown[]; transcriptSource: string } }>`select transcript, extracted_metadata_json as m from memories where id = 'aud'`)[0]!;
    assert.equal(row.transcript, "hello");
    assert.equal(row.m.segments.length, 1);
    assert.equal(row.m.transcriptSource, "segments");
    assert.equal((await saveMediaTranscriptCore(db.sql, u, "txt", { segments: [], text: "x", source: "text" })).ok, false);
  });
});
