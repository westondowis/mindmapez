import { useCallback, useEffect, useRef, useState } from "react";

export type RecStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "denied"
  | "unavailable"
  | "error";

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((ev: {
    resultIndex: number;
    results: { [i: number]: { 0: { transcript: string }; isFinal: boolean }; length: number };
  }) => void) | null;
  onerror: (() => void) | null;
};

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useRecorder() {
  const [status, setStatus] = useState<RecStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 20 }, () => 0.08));
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const speechRef = useRef<SpeechRec | null>(null);
  const raf = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startedAt = useRef(0);
  const elapsedBase = useRef(0);
  const tick = useRef<number>(0);
  const statusRef = useRef(status);
  statusRef.current = status;

  const tearDownStream = useCallback(() => {
    cancelAnimationFrame(raf.current);
    window.clearInterval(tick.current);
    analyserRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      speechRef.current?.stop();
    } catch {
      /* already stopped */
    }
    speechRef.current = null;
  }, []);

  const reset = useCallback(() => {
    recRef.current = null;
    chunks.current = [];
    elapsedBase.current = 0;
    setElapsedMs(0);
    setLevels(Array.from({ length: 20 }, () => 0.08));
    setBlob(null);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setTranscript("");
    setInterim("");
    setError(null);
    setStatus("idle");
  }, []);

  const cancel = useCallback(() => {
    try {
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    } catch {
      /* ignore */
    }
    tearDownStream();
    recRef.current = null;
    chunks.current = [];
    setBlob(null);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setTranscript("");
    setInterim("");
    setElapsedMs(0);
    elapsedBase.current = 0;
    setStatus("idle");
  }, [tearDownStream]);

  const startSpeech = useCallback(() => {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRec }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!SR) return;
    try {
      const recog = new SR();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = "en-US";
      recog.onresult = (ev) => {
        let live = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const piece = ev.results[i];
          if (!piece) continue;
          if (piece.isFinal) {
            const bit = piece[0].transcript.trim();
            if (bit) setTranscript((t) => (t ? `${t} ${bit}` : bit));
          } else {
            live += piece[0].transcript;
          }
        }
        setInterim(live.trim());
      };
      recog.onerror = () => undefined;
      recog.start();
      speechRef.current = recog;
    } catch {
      /* speech optional */
    }
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(data);
        const bars = Array.from({ length: 20 }, (_, i) => {
          const v = data[Math.floor((i / 20) * data.length)] ?? 0;
          return Math.max(0.08, v / 255);
        });
        setLevels(bars);
        raf.current = requestAnimationFrame(loop);
      };
      raf.current = requestAnimationFrame(loop);
    } catch {
      /* meter optional */
    }
  }, []);

  const startTimer = useCallback(() => {
    startedAt.current = Date.now();
    window.clearInterval(tick.current);
    tick.current = window.setInterval(() => {
      setElapsedMs(elapsedBase.current + (Date.now() - startedAt.current));
    }, 200);
  }, []);

  const start = useCallback(async () => {
    if (statusRef.current === "recording" || statusRef.current === "requesting" || statusRef.current === "paused") {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      setError("This browser can’t record audio. Try Chrome or Safari, or type the note instead.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setStatus("unavailable");
      setError("Recording isn’t supported here. Capture as text instead.");
      return;
    }
    setError(null);
    setStatus("requesting");
    setBlob(null);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onerror = () => {
        setStatus("error");
        setError("The recording failed. Try again, or type the note.");
        tearDownStream();
      };
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const file = new Blob(chunks.current, { type });
        if (file.size > 0) {
          setBlob(file);
          setBlobUrl(URL.createObjectURL(file));
        }
        tearDownStream();
        if (statusRef.current === "recording" || statusRef.current === "paused") {
          setStatus("idle");
        }
      };
      rec.start(200);
      recRef.current = rec;
      elapsedBase.current = 0;
      setElapsedMs(0);
      setStatus("recording");
      startMeter(stream);
      startTimer();
      startSpeech();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setStatus("denied");
        setError(
          "Microphone access is blocked. In your browser settings, allow the mic for this site, then try again.",
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setStatus("unavailable");
        setError("No microphone was found. Plug one in, then try again.");
      } else {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not start recording.");
      }
      tearDownStream();
    }
  }, [startMeter, startSpeech, startTimer, tearDownStream]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state === "inactive") {
      tearDownStream();
      setStatus("idle");
      return;
    }
    elapsedBase.current = elapsedBase.current + (Date.now() - startedAt.current);
    window.clearInterval(tick.current);
    try {
      rec.stop();
    } catch {
      tearDownStream();
      setStatus("idle");
    }
  }, [tearDownStream]);

  const pause = useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== "recording") return;
    try {
      rec.pause();
      elapsedBase.current = elapsedBase.current + (Date.now() - startedAt.current);
      window.clearInterval(tick.current);
      try {
        speechRef.current?.stop();
      } catch {
        /* optional */
      }
      setStatus("paused");
    } catch {
      setError("Pause isn’t available in this browser. Stop instead.");
    }
  }, []);

  const resume = useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== "paused") return;
    try {
      rec.resume();
      startTimer();
      startSpeech();
      setStatus("recording");
    } catch {
      setError("Could not resume. Stop and start a new take.");
    }
  }, [startSpeech, startTimer]);

  useEffect(() => {
    return () => {
      try {
        if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      } catch {
        /* ignore */
      }
      tearDownStream();
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [tearDownStream]);

  return {
    status,
    error,
    elapsedMs,
    levels,
    blob,
    blobUrl,
    transcript,
    interim,
    setTranscript,
    start,
    stop,
    pause,
    resume,
    cancel,
    reset,
    isLive: status === "recording" || status === "paused" || status === "requesting",
  };
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
