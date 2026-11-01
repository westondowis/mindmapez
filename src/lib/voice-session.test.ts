import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { createTurnProcessor, type IngestPlan, type ReviewPayload } from "./voice-ingest.ts";
import { VoiceSession, type Phase, type Recognizer, type RecognizerEvents } from "./voice-session.ts";
import { KEEPALIVE_MS, pickVoice, speakNative, speechChunks } from "./voice-synth.ts";

/** Records every call in order so tests can assert sequencing (e.g. recognition stops before TTS). */
function harness(opts: { ios?: boolean; continuous?: boolean; reply?: string; processFails?: boolean } = {}) {
  const log: string[] = [];
  const phases: Phase[] = [];
  const recs: { ev: RecognizerEvents; opts: { continuous: boolean } }[] = [];
  let speakCb: { onStart: () => void; onEnd: () => void; onError: () => void } | null = null;
  const processed: string[] = [];
  const session = new VoiceSession(
    {
      createRecognizer: (o, ev) => {
        recs.push({ ev, opts: o });
        const rec: Recognizer = {
          start: () => log.push("rec.start"),
          stop: () => log.push("rec.stop"),
          abort: () => log.push("rec.abort"),
        };
        return rec;
      },
      speak: (text, cb) => {
        log.push(`speak:${text}`);
        speakCb = cb;
      },
      cancelSpeech: () => log.push("cancelSpeech"),
      process: async (t) => {
        processed.push(t);
        if (opts.processFails) throw new Error("boom");
        return opts.reply ?? "Hello there.";
      },
    },
    {
      silenceMs: 2000,
      iosSingle: !!opts.ios,
      isContinuous: () => !!opts.continuous,
      onPhase: (p) => phases.push(p),
    },
  );
  const last = () => recs[recs.length - 1]!.ev;
  const flush = () => new Promise<void>((r) => setImmediate(r));
  return { session, log, phases, recs, processed, last, flush, speak: () => speakCb! };
}

describe("state transitions", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("idle -> listening -> thinking -> speaking -> idle", async () => {
    const h = harness();
    h.session.start();
    h.last().onResult([{ text: "hello brain", final: true }]);
    mock.timers.tick(2000);
    await h.flush();
    h.speak().onStart();
    h.speak().onEnd();
    assert.deepEqual(h.phases, ["listening", "thinking", "speaking", "idle"]);
  });

  it("continuous mode on desktop returns to listening after the reply", async () => {
    const h = harness({ continuous: true });
    h.session.start();
    h.last().onResult([{ text: "hello brain", final: true }]);
    mock.timers.tick(2000);
    await h.flush();
    h.speak().onEnd();
    assert.equal(h.session.phase, "listening");
    assert.equal(h.recs.length, 2, "a fresh recognizer is created, never reused");
  });

  it("iOS uses single-utterance sessions and needs a tap to continue", async () => {
    const h = harness({ ios: true, continuous: true });
    h.session.start();
    assert.equal(h.recs[0]!.opts.continuous, false);
    h.last().onResult([{ text: "hi there", final: true }]);
    h.last().onEnd(); // engine-confirmed end of the utterance
    await h.flush();
    h.speak().onEnd();
    assert.equal(h.session.phase, "idle");
    h.session.tap();
    assert.equal(h.session.phase, "listening");
  });

  it("a 1.5 s pause does not cut the user off, 2 s of silence sends it", async () => {
    const h = harness();
    h.session.start();
    h.last().onResult([{ text: "my golf swing", final: false }]);
    mock.timers.tick(1500);
    assert.equal(h.session.phase, "listening");
    h.last().onResult([{ text: "my golf swing felt smooth", final: true }]);
    mock.timers.tick(1999);
    assert.equal(h.session.phase, "listening");
    mock.timers.tick(1);
    assert.equal(h.session.phase, "thinking");
    await h.flush();
    assert.deepEqual(h.processed, ["my golf swing felt smooth"]);
  });

  it("failures go through error, speak an apology, then idle", async () => {
    const h = harness({ processFails: true });
    h.session.start();
    h.last().onResult([{ text: "hello", final: true }]);
    h.last().onEnd();
    await h.flush();
    assert.equal(h.session.phase, "error");
    h.speak().onEnd();
    assert.equal(h.session.phase, "idle");
  });

  it("barge-in cancels speech and goes straight back to listening", async () => {
    const h = harness();
    h.session.start();
    h.last().onResult([{ text: "hello", final: true }]);
    h.last().onEnd();
    await h.flush();
    h.speak().onStart();
    h.session.bargeIn();
    assert.ok(h.log.includes("cancelSpeech"));
    assert.equal(h.session.phase, "listening");
    h.speak().onEnd(); // stale callback from the cancelled utterance is ignored
    assert.equal(h.session.phase, "listening");
  });
});

describe("guards", () => {
  it("empty transcripts on onend never call the API or enter thinking", async () => {
    const h = harness();
    h.session.start();
    h.last().onEnd();
    await h.flush();
    assert.deepEqual(h.processed, []);
    assert.ok(!h.phases.includes("thinking"));
    assert.equal(h.session.phase, "idle");
  });

  it("no-speech errors and whitespace-only results stay idle", async () => {
    const h = harness();
    h.session.start();
    h.last().onResult([{ text: "   ", final: true }]);
    h.last().onError("no-speech");
    await h.flush();
    assert.deepEqual(h.processed, []);
    assert.equal(h.session.phase, "idle");
  });

  it("a blocked microphone ends in the error state without calling the API", async () => {
    const h = harness();
    h.session.start();
    h.last().onError("not-allowed");
    assert.equal(h.session.phase, "error");
    assert.deepEqual(h.processed, []);
  });
});

describe("speech handoff", () => {
  it("recognition is fully stopped before TTS speaks", async () => {
    const h = harness();
    h.session.start();
    h.last().onResult([{ text: "hello", final: true }]);
    h.last().onEnd();
    await h.flush();
    const abort = h.log.indexOf("rec.abort");
    const speak = h.log.findIndex((l) => l.startsWith("speak:"));
    assert.ok(abort >= 0 && speak > abort, `abort (${abort}) must precede speak (${speak})`);
  });

  it("ignores late recognizer events after the turn was committed", async () => {
    const h = harness();
    h.session.start();
    const ev = h.last();
    ev.onResult([{ text: "hello", final: true }]);
    ev.onEnd();
    ev.onEnd();
    ev.onResult([{ text: "ghost", final: true }]);
    await h.flush();
    assert.deepEqual(h.processed, ["hello"]);
  });
});

describe("review queue dispatch", () => {
  it("note + completion cue queues one payload and never touches the graph", async () => {
    const queued: ReviewPayload[] = [];
    const plan: IngestPlan = {
      ok: true,
      raw: "my irons felt crisp today",
      keyPoints: ["my irons felt crisp today"],
      tags: ["irons", "crisp"],
      action: "sub-branch",
      newName: "Irons",
      suggested: { id: "c1", name: "Golf" },
    };
    const turns = createTurnProcessor({
      ingest: async () => plan,
      queue: async (p) => (queued.push(p), { ok: true }),
      ask: async () => ({ ok: true, content: "should not be asked" }),
    });
    assert.match(await turns.process("remember my irons felt crisp today"), /Keep going/);
    assert.equal(queued.length, 0, "nothing is queued until the completion cue");
    assert.match(await turns.process("I'm done"), /Stored for review under Golf/);
    assert.equal(queued.length, 1);
    assert.equal(queued[0]!.action, "sub-branch");
    assert.equal(queued[0]!.suggestedName, "Irons");
    assert.equal(queued[0]!.conceptId, "c1");
  });

  it("falls back to the raw transcript when ingest fails, so nothing is lost", async () => {
    const queued: ReviewPayload[] = [];
    const turns = createTurnProcessor({
      ingest: async () => { throw new Error("offline"); },
      queue: async (p) => (queued.push(p), { ok: true }),
      ask: async () => ({ ok: true, content: "x" }),
    });
    await turns.process("remember the putter needs a new grip");
    await turns.process("save that");
    assert.equal(queued[0]!.raw, "the putter needs a new grip");
    assert.equal(queued[0]!.action, "memory");
  });

  it("keeps the draft when the queue write fails, then retries", async () => {
    let fail = true;
    const turns = createTurnProcessor({
      ingest: async () => ({ ok: false }),
      queue: async () => (fail ? { ok: false, error: "db down" } : { ok: true }),
      ask: async () => ({ ok: true, content: "x" }),
    });
    await turns.process("remember call the club pro");
    await assert.rejects(turns.process("store this"), /db down/);
    assert.equal(turns.hasDraft(), true);
    fail = false;
    assert.match(await turns.process("store this"), /Stored for review/);
  });

  it("rejects an empty transcript instead of calling the assistant", async () => {
    let asked = 0;
    const turns = createTurnProcessor({
      ingest: async () => ({ ok: false }),
      queue: async () => ({ ok: true }),
      ask: async () => (asked++, { ok: true, content: "x" }),
    });
    await assert.rejects(turns.process("   "));
    assert.equal(asked, 0);
  });
});

describe("native speech synthesis", () => {
  class FakeUtterance {
    voice: unknown = null;
    lang = "";
    volume = 1;
    rate = 1;
    pitch = 1;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  }
  function fakeSynth(voices: object[] = [{ name: "Samantha", voiceURI: "s", lang: "en-US", localService: true }]) {
    const calls: string[] = [];
    const spoken: FakeUtterance[] = [];
    const synth = {
      paused: false,
      cancel: () => calls.push("cancel"),
      resume: () => calls.push("resume"),
      pause: () => calls.push("pause"),
      speak: (u: FakeUtterance) => (calls.push("speak"), spoken.push(u)),
      getVoices: () => voices,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    return { synth: synth as unknown as SpeechSynthesis, calls, spoken };
  }
  beforeEach(() => {
    (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance;
    mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  });
  afterEach(() => mock.timers.reset());

  it("cancels first, uses an en-US voice at full volume, and reports end", () => {
    const { synth, calls, spoken } = fakeSynth();
    let ended = 0;
    speakNative("Hello there.", "female", { onStart: () => {}, onEnd: () => ended++, onError: () => {} }, synth);
    assert.equal(calls[0], "cancel");
    assert.equal(spoken[0]!.volume, 1);
    assert.equal(spoken[0]!.lang, "en-US");
    spoken[spoken.length - 1]!.onend!();
    assert.equal(ended, 1);
  });

  it("long replies get a pause/resume keep-alive every 5 s that stops at the end", () => {
    const { synth, calls, spoken } = fakeSynth();
    const long = Array.from({ length: 40 }, () => "This is a fairly long sentence about golf.").join(" ");
    speakNative(long, "female", { onStart: () => {}, onEnd: () => {}, onError: () => {} }, synth);
    spoken[0]!.onstart!();
    mock.timers.tick(KEEPALIVE_MS);
    assert.deepEqual(calls.slice(-2), ["pause", "resume"]);
    spoken[spoken.length - 1]!.onend!();
    const n = calls.length;
    mock.timers.tick(KEEPALIVE_MS * 3);
    assert.equal(calls.length, n, "keep-alive stops once speech ends");
  });

  it("short replies get no keep-alive, and a silent engine ends the turn via the watchdog", () => {
    const { synth, calls } = fakeSynth();
    let errored = 0;
    speakNative("Okay.", "male", { onStart: () => {}, onEnd: () => {}, onError: () => errored++ }, synth);
    mock.timers.tick(KEEPALIVE_MS);
    assert.ok(!calls.includes("pause"));
    assert.equal(errored, 1);
  });

  it("chunks sentences and picks the best matching voice", () => {
    assert.deepEqual(speechChunks("One. Two! **Three**?"), ["One.", "Two!", "Three?"]);
    const v = (name: string, extra = {}) => ({ name, voiceURI: name, lang: "en-US", localService: true, ...extra });
    assert.equal(pickVoice("male", [v("Samantha"), v("Daniel")])!.name, "Daniel");
    assert.equal(pickVoice("female", [v("Samantha"), v("Daniel")])!.name, "Samantha");
    assert.equal(pickVoice("female", []), null);
  });
});
