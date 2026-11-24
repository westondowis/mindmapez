import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { VoiceSession, type Recognizer, type RecognizerEvents } from "./voice-session.ts";
import { VAD_SILENCE_MS, RECOGNIZER_RESTART_MS, isEchoOf } from "./voice.ts";

function ios() {
  const recs: { ev: RecognizerEvents }[] = [];
  const log: string[] = [];
  let speakCb: { onStart: () => void; onEnd: () => void; onError: () => void } | null = null;
  const session = new VoiceSession(
    {
      createRecognizer: (_o, ev) => {
        recs.push({ ev });
        return { start: () => {}, stop: () => {}, abort: () => {} } as Recognizer;
      },
      speak: (_t, cb) => { speakCb = cb; },
      cancelSpeech: () => log.push("cancelSpeech"),
      process: async () => "Got it, keep going.",
    },
    {
      silenceMs: VAD_SILENCE_MS,
      restartMs: RECOGNIZER_RESTART_MS,
      iosSingle: true,
      isContinuous: () => true,
      isUserSpeech: (heard, spoken) => !isEchoOf(heard, spoken),
      onBargeIn: () => log.push("barge"),
      onPhase: () => {},
    },
  );
  return { session, recs, log, speak: () => speakCb!, last: () => recs[recs.length - 1]!.ev, flush: () => new Promise<void>((r) => setImmediate(r)) };
}

describe("iOS continuous listening", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("a recognizer that ends mid-thought is replaced after 120 ms and the text is carried", () => {
    const h = ios();
    h.session.start();
    h.last().onResult([{ text: "I was thinking about", final: true }]);
    h.last().onEnd();
    assert.equal(h.recs.length, 1);
    mock.timers.tick(RECOGNIZER_RESTART_MS);
    assert.equal(h.recs.length, 2, "fresh recognizer");
    h.last().onResult([{ text: "the quarterly numbers", final: true }]);
    assert.equal(h.session.phase, "listening");
  });

  it("3.5 s of quiet sends the thought, 3 s does not", async () => {
    const h = ios();
    h.session.start();
    h.last().onResult([{ text: "here is my idea", final: true }]);
    mock.timers.tick(3000);
    assert.equal(h.session.phase, "listening");
    mock.timers.tick(500);
    await h.flush();
    assert.equal(h.session.phase, "speaking", "committed and replying");
  });

  it("after the reply finishes, iOS re-opens a fresh recognizer by itself and keeps listening during speech", async () => {
    const h = ios();
    h.session.start();
    h.last().onResult([{ text: "store this thought", final: true }]);
    mock.timers.tick(VAD_SILENCE_MS);
    await h.flush();
    assert.equal(h.session.phase, "speaking");
    mock.timers.tick(300);
    assert.ok(h.recs.length >= 2, "a listener runs while the assistant speaks, iOS included");
    h.speak().onEnd();
    mock.timers.tick(300);
    assert.equal(h.session.phase, "listening");
  });

  it("one stray word does not interrupt; two words do and are kept", async () => {
    const h = ios();
    h.session.start();
    h.last().onResult([{ text: "first thought here", final: true }]);
    mock.timers.tick(VAD_SILENCE_MS);
    await h.flush();
    mock.timers.tick(300);
    h.last().onResult([{ text: "wait", final: false }]);
    assert.equal(h.session.phase, "speaking");
    h.last().onResult([{ text: "wait actually", final: false }]);
    assert.equal(h.session.phase, "listening");
    assert.deepEqual(h.log.filter((x) => x === "barge" || x === "cancelSpeech"), ["barge", "cancelSpeech"]);
  });
});
