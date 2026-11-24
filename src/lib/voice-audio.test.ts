import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playServerAudio, type AudioLike } from "./voice-synth.ts";

function fakeAudio(playImpl?: () => Promise<void>): AudioLike & { paused: boolean } {
  const a: AudioLike & { paused: boolean } = {
    src: "", currentTime: 5, volume: 0, muted: true, paused: false,
    onplaying: null, onended: null, onerror: null,
    play: playImpl ?? (() => Promise.resolve()),
    pause() { a.paused = true; },
  };
  return a;
}

describe("playServerAudio", () => {
  it("unmutes, plays the data url and reports start then end", () => {
    const a = fakeAudio();
    const ev: string[] = [];
    playServerAudio(a, "data:audio/mp3;base64,AAA", { onStart: () => ev.push("start"), onEnd: () => ev.push("end"), onError: () => ev.push("err") });
    assert.equal(a.src, "data:audio/mp3;base64,AAA");
    assert.equal(a.muted, false);
    assert.equal(a.volume, 1);
    a.onplaying?.(new Event("playing"));
    a.onended?.(new Event("ended"));
    a.onended?.(new Event("ended"));
    assert.deepEqual(ev, ["start", "end"]);
  });
  it("a rejected play() falls back via onError exactly once", async () => {
    const a = fakeAudio(() => Promise.reject(new Error("NotAllowed")));
    const ev: string[] = [];
    playServerAudio(a, "data:audio/mp3;base64,AAA", { onStart: () => ev.push("start"), onEnd: () => ev.push("end"), onError: () => ev.push("err") });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(ev, ["err"]);
  });
  it("stop pauses, resets and silences later callbacks (barge-in)", () => {
    const a = fakeAudio();
    const ev: string[] = [];
    const stop = playServerAudio(a, "data:audio/mp3;base64,AAA", { onStart: () => ev.push("start"), onEnd: () => ev.push("end"), onError: () => ev.push("err") });
    a.onplaying?.(new Event("playing"));
    const ended = a.onended;
    stop();
    ended?.(new Event("ended"));
    assert.equal(a.paused, true);
    assert.equal(a.currentTime, 0);
    assert.deepEqual(ev, ["start"]);
  });
});
