/**
 * Voice interaction lifecycle as an explicit finite state machine.
 *
 *   idle ──start──▶ listening ──commit──▶ thinking ──reply──▶ speaking ──done──▶ idle
 *                       ▲                                        │ (continuous, non-iOS)
 *                       └────────────────────────────────────────┘
 *   any failure ──▶ error (speaks a short apology) ──▶ idle
 *
 * The class owns no browser APIs: recognition, speech and the AI turn are injected as
 * ports, so desktop and iOS behaviour is testable without a browser.
 */
export type Phase = "idle" | "listening" | "thinking" | "speaking" | "error";

export type RecognizerEvents = {
  onResult: (results: { text: string; final: boolean }[]) => void;
  onEnd: () => void;
  onError: (code?: string) => void;
};

export type Recognizer = { start: () => void; stop: () => void; abort: () => void };

export type SessionPorts = {
  /** Fresh instance every time; ended recognizers are never reused (iOS refuses to restart them). */
  createRecognizer: (opts: { continuous: boolean }, ev: RecognizerEvents) => Recognizer | null;
  speak: (text: string, cb: { onStart: () => void; onEnd: () => void; onError: () => void }) => void;
  cancelSpeech: () => void;
  /** Turns a transcript into the reply to speak (routing, review queue, assistant). */
  process: (transcript: string) => Promise<string>;
};

export type SessionOptions = {
  /** Quiet time after speech before a desktop thought is sent. */
  silenceMs: number;
  /** iOS WebKit: single-utterance sessions; continuous mode needs a tap per turn. */
  iosSingle: boolean;
  isContinuous: () => boolean;
  onPhase: (p: Phase) => void;
  onLine?: (text: string) => void;
  onReply?: (text: string) => void;
  onSpeaking?: (on: boolean) => void;
};

export class VoiceSession {
  phase: Phase = "idle";
  private gen = 0;
  private turn = 0;
  private active = false;
  private rec: Recognizer | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private final = "";
  private interim = "";

  private ports: SessionPorts;
  private opts: SessionOptions;

  constructor(ports: SessionPorts, opts: SessionOptions) {
    this.ports = ports;
    this.opts = opts;
  }

  private setPhase(p: Phase) {
    if (this.phase === p) return;
    this.phase = p;
    this.opts.onPhase(p);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private teardownRecognizer() {
    this.clearTimer();
    const rec = this.rec;
    this.rec = null;
    try { rec?.abort(); } catch { /* already ended */ }
  }

  private text() {
    return `${this.final} ${this.interim}`.trim();
  }

  /** Begin one listening turn. Call synchronously from a tap on iOS. */
  start() {
    if (this.phase === "thinking" || this.phase === "speaking") return;
    this.teardownRecognizer();
    const gen = ++this.gen;
    this.final = "";
    this.interim = "";
    const live = () => gen === this.gen && this.phase === "listening";
    const rec = this.ports.createRecognizer(
      { continuous: !this.opts.iosSingle },
      {
        onResult: (results) => {
          if (!live()) return;
          this.final = results.filter((r) => r.final).map((r) => r.text).join(" ").trim();
          this.interim = results.filter((r) => !r.final).map((r) => r.text).join(" ").trim();
          const t = this.text();
          this.opts.onLine?.(t);
          // Only a full silence window of quiet ends the thought; partials just re-arm the timer.
          this.clearTimer();
          if (t) this.timer = setTimeout(() => live() && this.commit(), this.opts.silenceMs);
        },
        onEnd: () => {
          if (!live()) return;
          this.clearTimer();
          const t = this.text();
          if (t) this.commit();
          else this.toIdle(); // empty transcript: never thinking, never an API call
        },
        onError: (code) => {
          if (!live()) return;
          if (code === "not-allowed" || code === "service-not-allowed") {
            this.teardownRecognizer();
            this.opts.onReply?.("Microphone access was blocked. Allow it in Settings and tap again.");
            this.setPhase("error");
            return;
          }
          if (this.text()) this.commit();
          else this.toIdle();
        },
      },
    );
    if (!rec) {
      this.opts.onReply?.("Voice input is not available in this browser.");
      this.setPhase("error");
      return;
    }
    this.rec = rec;
    this.active = true;
    this.setPhase("listening");
    try {
      rec.start();
    } catch {
      // Blocked (e.g. a programmatic restart outside a gesture): wait for the next tap.
      this.toIdle();
    }
  }

  private toIdle() {
    this.gen++;
    this.teardownRecognizer();
    this.setPhase("idle");
  }

  /** Tap on the main button: stops a live capture (sending only real text) or starts one. */
  tap() {
    if (this.phase === "listening") {
      if (this.text()) this.commit();
      else this.toIdle();
      return;
    }
    this.start();
  }

  private commit() {
    const text = this.text();
    if (!text) return this.toIdle();
    this.gen++;
    // The recognizer must be fully stopped before any speech so iOS leaves the call/earpiece route.
    this.teardownRecognizer();
    this.setPhase("thinking");
    const turn = ++this.turn;
    this.ports.process(text).then(
      (reply) => {
        if (turn === this.turn) this.say(reply, turn, false);
      },
      (err: unknown) => {
        if (turn !== this.turn) return;
        const msg = "Something went wrong. Please try again.";
        const detail = err instanceof Error && err.message ? ` (${err.message.slice(0, 120)})` : "";
        this.opts.onReply?.(msg + detail);
        this.setPhase("error");
        this.say(msg, turn, true);
      },
    );
  }

  private say(text: string, turn: number, isError: boolean) {
    if (!isError) this.opts.onReply?.(text);
    let finished = false;
    const done = () => {
      if (finished || turn !== this.turn) return;
      finished = true;
      this.opts.onSpeaking?.(false);
      if (!isError && this.active && this.opts.isContinuous() && !this.opts.iosSingle) {
        this.setPhase("idle");
        this.start();
      } else {
        this.setPhase("idle");
      }
    };
    if (!text.trim()) return done();
    if (!isError) this.setPhase("speaking");
    this.ports.speak(text, {
      onStart: () => {
        if (turn === this.turn) this.opts.onSpeaking?.(true);
      },
      onEnd: done,
      onError: done,
    });
  }

  /** The user talked over the assistant: cut speech, drop the queue, listen. */
  bargeIn() {
    if (this.phase !== "speaking") return;
    this.turn++;
    this.ports.cancelSpeech();
    this.opts.onSpeaking?.(false);
    this.setPhase("idle");
    this.start();
  }

  /** Close the session: stop everything and return to idle. */
  stop() {
    this.active = false;
    this.turn++;
    this.gen++;
    this.teardownRecognizer();
    this.ports.cancelSpeech();
    this.opts.onSpeaking?.(false);
    this.setPhase("idle");
  }
}
