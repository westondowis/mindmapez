import { BARGE_HOLD_MS, BARGE_RMS_THRESHOLD, rmsOf } from "./voice.ts";

/**
 * Desktop-only mic energy monitor for barge-in while the assistant speaks. One getUserMedia per
 * session (never used on iOS, where it fights SpeechRecognition for the audio session).
 * Returns a stop function that releases the stream.
 */
export async function startEnergyMonitor(opts: {
  isSpeaking: () => boolean;
  onBarge: () => void;
}): Promise<() => void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return () => {};
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  void ctx.resume().catch(() => {});
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  let raf = 0;
  let loudSince: number | null = null;
  let stopped = false;
  const loop = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(buf);
    // Echo shield: speaker bleed stays under the elevated barge threshold.
    if (opts.isSpeaking() && rmsOf(buf) >= BARGE_RMS_THRESHOLD) {
      loudSince ??= performance.now();
      if (performance.now() - loudSince >= BARGE_HOLD_MS) {
        loudSince = null;
        opts.onBarge();
      }
    } else {
      loudSince = null;
    }
    raf = window.requestAnimationFrame(loop);
  };
  raf = window.requestAnimationFrame(loop);
  return () => {
    stopped = true;
    window.cancelAnimationFrame(raf);
    void ctx.close().catch(() => {});
    stream.getTracks().forEach((t) => t.stop());
  };
}
