import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { VoiceSession, type Phase, type RecognizerEvents } from "./voice-session.ts";

/** Session wired like the app: hold-and-continue, 250 ms cool-down, 1500 ms silence window. */
function rig(o: { ios?: boolean; continuous?: boolean } = {}) {
  const recs: { ev: RecognizerEvents; started: boolean }[] = [];
  const log: string[] = [];
  const phases: Phase[] = [];
  const processed: string[] = [];
  let spoken: { onStart: () => void; onEnd: () => void; onError: () => void } | null = null;
  let throwOnStart = false;
  const session = new VoiceSession(
    {
      createRecognizer: (_o, ev) => {
        const r = { ev, started: false };
        recs.push(r);
        return {
          start: () => {
            if (throwOnStart) throw new Error("blocked");
            r.started = true;
            log.push(`start#${recs.length}`);
          },
          stop: () => {},
          abort: () => log.push("abort"),
        };
      },
      speak: (_t, cb) => { spoken = cb; },
      cancelSpeech: () => log.push("cancelSpeech"),
      process: async (t) => { processed.push(t); return "Sure thing."; },
    },
    {
      silenceMs: 1500,
      restartMs: 100,
      gapMs: 250,
      iosSingle: !!o.ios,
      isContinuous: () => o.continuous ?? true,
      isUserSpeech: (h, s) => !s.toLowerCase().includes(h.toLowerCase()),
      onPhase: (p) => phases.push(p),
    },
  );
  const flush = () => new Promise<void>((r) => setImmediate(r));
  return { session, recs, log, phases, processed, speak: () => spoken!, flush, blockStarts: (v: boolean) => { throwOnStart = v; } };
}

describe("hold-and-continue", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("a recognizer ending on its own does not send the thought", async () => {
    const h = rig();
    h.session.start();
    h.recs[0]!.ev.onResult([{ text: "so my idea is", final: true }]);
    h.recs[0]!.ev.onEnd(); // browser ended it after a short pause
    assert.equal(h.session.phase, "listening");
    assert.deepEqual(h.processed, []);
    mock.timers.tick(100); // restart delay; the cool-down gap follows
    mock.timers.tick(250);
    assert.equal(h.recs.length, 2);
    h.recs[1]!.ev.onResult([{ text: "about pricing", final: true }]);
    mock.timers.tick(1500);
    await h.flush();
    assert.deepEqual(h.processed, ["so my idea is about pricing"]);
  });

  it("sends the held text if the quiet window passes while no recognizer is running", async () => {
    const h = rig();
    h.session.start();
    h.recs[0]!.ev.onResult([{ text: "one thought", final: true }]);
    h.recs[0]!.ev.onEnd();
    mock.timers.tick(1500);
    await h.flush();
    assert.deepEqual(h.processed, ["one thought"]);
  });

  it("restarts after no-speech and aborted instead of going idle", () => {
    const h = rig();
    h.session.start();
    h.recs[0]!.ev.onError("no-speech");
    mock.timers.tick(100 + 250);
    assert.equal(h.recs.length, 2);
    h.recs[1]!.ev.onError("aborted");
    mock.timers.tick(100 + 250);
    assert.equal(h.recs.length, 3);
    assert.equal(h.session.phase, "listening");
  });

  it("gives up after repeated empty restarts rather than looping forever", () => {
    const h = rig();
    h.session.start();
    for (let i = 0; i < 12; i++) {
      h.recs[h.recs.length - 1]!.ev.onEnd();
      mock.timers.tick(400);
      if (h.session.phase === "idle") break;
    }
    assert.equal(h.session.phase, "idle");
  });

  it("never starts a recognizer inside the cool-down after an abort (stop then talk again works)", () => {
    const h = rig();
    h.session.start();
    h.session.stop();
    h.session.start(); // immediately: the old recognizer was just aborted
    assert.equal(h.recs.length, 1, "no second recognizer yet");
    mock.timers.tick(250);
    assert.equal(h.recs.length, 2);
    assert.equal(h.session.phase, "listening");
    h.recs[1]!.ev.onResult([{ text: "second go", final: true }]);
    mock.timers.tick(1500);
    assert.equal(h.session.phase, "thinking");
  });

  it("tapping while listening sends right away", async () => {
    const h = rig();
    h.session.start();
    h.recs[0]!.ev.onResult([{ text: "done now", final: true }]);
    h.session.tap();
    await h.flush();
    assert.deepEqual(h.processed, ["done now"]);
  });
});

describe("barge-in after the reply starts", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  async function speaking(h: ReturnType<typeof rig>) {
    h.session.start();
    h.recs[0]!.ev.onResult([{ text: "hello", final: true }]);
    mock.timers.tick(1500);
    await h.flush();
    h.speak().onStart();
    mock.timers.tick(250); // cool-down after the thinking teardown, then the speaking listener opens
  }

  it("opens a listener once the cool-down is over and keeps the interrupting words", async () => {
    const h = rig();
    await speaking(h);
    const listener = h.recs[h.recs.length - 1]!;
    assert.ok(listener.started);
    listener.ev.onResult([{ text: "wait actually", final: false }]);
    assert.ok(h.log.includes("cancelSpeech"));
    assert.equal(h.session.phase, "listening");
    mock.timers.tick(250);
    const next = h.recs[h.recs.length - 1]!;
    next.ev.onResult([{ text: "let me add something", final: true }]); // a new recognizer only hears what comes after
    mock.timers.tick(1500);
    await h.flush();
    assert.deepEqual(h.processed.at(-1), "wait actually let me add something");
  });

  it("ignores the assistant's own voice", async () => {
    const h = rig();
    await speaking(h);
    h.recs[h.recs.length - 1]!.ev.onResult([{ text: "sure", final: false }]);
    assert.equal(h.session.phase, "speaking");
  });
});

describe("iOS single-utterance sessions", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("holds across the engine's end-of-utterance and sends after the quiet window", async () => {
    const h = rig({ ios: true });
    h.session.start();
    h.recs[0]!.ev.onResult([{ text: "first part", final: true }]);
    h.recs[0]!.ev.onEnd();
    assert.equal(h.session.phase, "listening");
    mock.timers.tick(350);
    h.recs[1]!.ev.onResult([{ text: "second part", final: true }]);
    mock.timers.tick(1500);
    await h.flush();
    assert.deepEqual(h.processed, ["first part second part"]);
  });

  it("sends what it has if the restart is blocked outside a gesture", async () => {
    const h = rig({ ios: true });
    h.session.start();
    h.recs[0]!.ev.onResult([{ text: "keep this", final: true }]);
    h.blockStarts(true);
    h.recs[0]!.ev.onEnd();
    mock.timers.tick(350);
    await h.flush();
    assert.deepEqual(h.processed, ["keep this"]);
  });
});
