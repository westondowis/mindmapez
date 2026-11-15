import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  STYLE_COLD_START,
  VAD_SILENCE_MS,
  isEchoOf,
  isSmallTalk,
  shouldDistillStyle,
  voiceSystemPrompt,
} from "./voice.ts";
import { VoiceSession, type Phase, type RecognizerEvents } from "./voice-session.ts";

describe("isSmallTalk", () => {
  for (const t of ["hey", "Hey, Mr. Brain!", "hey mr brain", "how's it going", "Hey, how's it going?", "what's up", "yeah", "hold on", "okay", "ok so", "um", "thanks"]) {
    it(`treats "${t}" as small talk`, () => assert.equal(isSmallTalk(t), true));
  }
  for (const t of ["what did I say about the Henderson listing", "remind me about golf", "hey what do I have on negotiations", "I need to call my accountant tomorrow", "yes please save that note about pricing"]) {
    it(`treats "${t}" as real content`, () => assert.equal(isSmallTalk(t), false));
  }
});

describe("isEchoOf", () => {
  it("ignores text contained in the spoken reply", () => {
    assert.equal(isEchoOf("pretty good, no complaints", "Hey, I'm pretty good, no complaints. What about yourself?"), true);
  });
  it("lets new user speech through", () => assert.equal(isEchoOf("actually stop", "Hey, I'm pretty good."), false));
  it("treats empty heard text as echo", () => assert.equal(isEchoOf("  ", "anything"), true));
});

describe("voice prompt and style", () => {
  it("uses the cold-start line with no profile", () => {
    const p = voiceSystemPrompt({ styleProfile: null, branchMap: "- Golf" });
    assert.ok(p.includes(STYLE_COLD_START));
    assert.ok(p.includes("under 30 words"));
    assert.ok(p.includes("- Golf"));
  });
  it("injects a stored profile instead", () => {
    const p = voiceSystemPrompt({ styleProfile: "Punchy, dry humor.", branchMap: "" });
    assert.ok(p.includes("Punchy, dry humor."));
    assert.ok(!p.includes(STYLE_COLD_START));
  });
  it("distils on every 8th turn only", () => {
    assert.deepEqual([0, 1, 7, 8, 9, 16].map((n) => shouldDistillStyle(n)), [false, false, false, true, false, true]);
  });
  it("debounces thoughts at 1000 ms", () => assert.equal(VAD_SILENCE_MS, 1000));
});

function rig(speakingListener = true) {
  const recs: RecognizerEvents[] = [];
  const log: string[] = [];
  const phases: Phase[] = [];
  let spokenCb: { onStart: () => void; onEnd: () => void; onError: () => void } | null = null;
  let barged = 0;
  const session = new VoiceSession(
    {
      createRecognizer: (_o, ev) => {
        recs.push(ev);
        return { start: () => log.push("rec.start"), stop: () => {}, abort: () => log.push("rec.abort") };
      },
      speak: (_t, cb) => { spokenCb = cb; },
      cancelSpeech: () => log.push("cancelSpeech"),
      process: async () => "Hey, I'm pretty good, no complaints.",
    },
    {
      silenceMs: 1000,
      restartMs: 100,
      iosSingle: false,
      isContinuous: () => true,
      isUserSpeech: speakingListener ? (h, s) => !isEchoOf(h, s) : undefined,
      onBargeIn: () => { barged++; },
      onPhase: (p) => phases.push(p),
    },
  );
  const flush = () => new Promise<void>((r) => setImmediate(r));
  return { session, recs, log, phases, speak: () => spokenCb!, barged: () => barged, flush };
}

describe("continuous listening and barge-in", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("restarts the recognizer 100 ms after it ends with nothing heard", () => {
    const h = rig();
    h.session.start();
    h.recs[0]!.onEnd();
    assert.equal(h.recs.length, 1);
    mock.timers.tick(100);
    assert.equal(h.recs.length, 2);
    assert.equal(h.session.phase, "listening");
  });

  it("waits out a pause shorter than 1000 ms and sends after it", async () => {
    const h = rig();
    h.session.start();
    h.recs[0]!.onResult([{ text: "so I was thinking", final: true }]);
    mock.timers.tick(900);
    h.recs[0]!.onResult([{ text: "so I was thinking about pricing", final: false }]);
    mock.timers.tick(900);
    assert.equal(h.session.phase, "listening");
    mock.timers.tick(100);
    assert.equal(h.session.phase, "thinking");
  });

  async function toSpeaking(h: ReturnType<typeof rig>) {
    h.session.start();
    h.recs[0]!.onResult([{ text: "hey", final: true }]);
    mock.timers.tick(1000);
    await h.flush();
    h.speak().onStart();
    assert.equal(h.session.phase, "speaking");
  }

  it("keeps a live recognizer while speaking and ignores the speaker's own words", async () => {
    const h = rig();
    await toSpeaking(h);
    const listener = h.recs[h.recs.length - 1]!;
    listener.onResult([{ text: "pretty good no complaints", final: false }]);
    assert.equal(h.session.phase, "speaking");
    assert.equal(h.barged(), 0);
  });

  it("cuts speech and returns to listening when the user talks over it", async () => {
    const h = rig();
    await toSpeaking(h);
    h.recs[h.recs.length - 1]!.onResult([{ text: "wait actually hold on", final: false }]);
    assert.ok(h.log.includes("cancelSpeech"));
    assert.equal(h.session.phase, "listening");
    assert.equal(h.barged(), 1);
  });

  it("does not open a speaking recognizer without an echo filter", async () => {
    const h = rig(false);
    await toSpeaking(h);
    assert.equal(h.recs.length, 1);
  });
});
