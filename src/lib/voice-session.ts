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
import { BARGE_MIN_WORDS, wordCount } from "./voice.ts";

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
  /**
   * Enables hold-and-continue: a recognizer that ends by itself (browsers end them after a short
   * pause) never sends the thought; a fresh one starts after this many ms and the thought is sent
   * only after `silenceMs` of real quiet. Leave undefined for the old end-means-send behaviour.
   */
  restartMs?: number;
  /** Cool-down after a recognizer is aborted before the next one may start (browsers fail a start that races an abort). */
  gapMs?: number;
  /** Restarts allowed in a row with nothing heard before the session gives up and idles. */
  maxIdleRestarts?: number;
  /** Decides whether text heard while the assistant speaks is the user (true) or the speaker's own echo (false). */
  isUserSpeech?: (heard: string, spoken: string) => boolean;
  /** Fired when the user talks over the assistant. */
  onBargeIn?: () => void;
  /** iOS WebKit: single-utterance recognizers (each is restarted by the session, so the thought is never cut). */
  iosSingle: boolean;
  /** Words heard over the assistant before it is an interruption (default 2). */
  bargeMinWords?: number;
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
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private coolTimer: ReturnType<typeof setTimeout> | null = null;
  private cooling = false;
  private pendingOpen: (() => void) | null = null;
  private final = "";
  private interim = "";
  /** Text kept from recognizers that ended earlier in the same thought. */
  private carry = "";
  private idleRestarts = 0;
  /** True when this turn was opened without a tap (continuous mode); a blocked mic then falls back to idle, not an error. */
  private autoOpened = false;
  private spoken = "";

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

  private clearRestart() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private teardownRecognizer() {
    this.clearTimer();
    this.clearRestart();
    this.pendingOpen = null;
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    try { rec.abort(); } catch { /* already ended */ }
    const gap = this.opts.gapMs ?? 0;
    if (gap > 0) {
      this.cooling = true;
      if (this.coolTimer) clearTimeout(this.coolTimer);
      this.coolTimer = setTimeout(() => {
        this.coolTimer = null;
        this.cooling = false;
        const open = this.pendingOpen;
        this.pendingOpen = null;
        open?.();
      }, gap);
    }
  }

  /** Run `open` now, or as soon as the previous recognizer's cool-down is over. */
  private whenReady(open: () => void) {
    if (!this.cooling) return open();
    this.pendingOpen = open;
  }

  private holding() {
    return this.opts.restartMs !== undefined && this.active;
  }

  private text() {
    return `${this.final} ${this.interim}`.trim();
  }

  /** Begin one listening turn. Call synchronously from a tap on iOS (auto = continuous re-open without a tap). */
  start(auto = false) {
    if (this.phase === "thinking" || this.phase === "speaking") return;
    this.teardownRecognizer();
    const gen = ++this.gen;
    this.final = "";
    this.interim = "";
    this.carry = "";
    this.idleRestarts = 0;
    this.autoOpened = auto;
    this.active = true;
    this.setPhase("listening");
    this.whenReady(() => this.openRecognizer(gen));
  }

  /** Create and start one recognizer for the current thought (also used to continue it after an end). */
  private openRecognizer(gen: number) {
    if (gen !== this.gen || this.phase !== "listening") return;
    const live = () => gen === this.gen && this.phase === "listening";
    const rec = this.ports.createRecognizer(
      { continuous: !this.opts.iosSingle },
      {
        onResult: (results) => {
          if (!live()) return;
          const finals = results.filter((r) => r.final).map((r) => r.text);
          this.final = [this.carry, ...finals].join(" ").trim();
          this.interim = results.filter((r) => !r.final).map((r) => r.text).join(" ").trim();
          const t = this.text();
          if (t) this.idleRestarts = 0;
          this.opts.onLine?.(t);
          // Only a full silence window of quiet ends the thought; partials just re-arm the timer.
          this.clearTimer();
          if (t) this.timer = setTimeout(() => live() && this.commit(), this.opts.silenceMs);
        },
        onEnd: () => {
          if (live()) this.ended(gen);
        },
        onError: (code) => {
          if (!live()) return;
          if (code === "not-allowed" || code === "service-not-allowed") {
            this.teardownRecognizer();
            if (this.autoOpened) return this.toIdle(); // a restart without a tap was refused: "Tap to continue"
            this.opts.onReply?.("Microphone access was blocked. Allow it in Settings and tap again.");
            this.setPhase("error");
            return;
          }
          // Benign endings (nothing heard, aborted by a racing start) continue the thought when holding.
          if ((code === "no-speech" || code === "aborted") && this.holding()) return this.ended(gen);
          this.clearTimer();
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
    try {
      rec.start();
    } catch {
      // Blocked or racing: keep what was said, otherwise wait for the next tap.
      this.rec = null;
      if (this.text()) this.commit();
      else this.toIdle();
    }
  }

  /**
   * The browser ended its recognizer (it does after a short pause, or after one utterance on iOS).
   * While holding, that is NOT the end of the thought: keep the text, start a fresh recognizer, and let
   * the silence timer (armed at the last words) decide when to send.
   */
  private ended(gen: number) {
    const t = this.text();
    const keepGoing = this.holding() && (t !== "" || (this.opts.isContinuous() && this.idleRestarts < (this.opts.maxIdleRestarts ?? 6)));
    if (!keepGoing) {
      this.clearTimer();
      if (t) this.commit();
      else this.toIdle(); // empty transcript: never thinking, never an API call
      return;
    }
    if (!t) this.idleRestarts++;
    this.carry = t;
    this.final = t;
    this.interim = "";
    const rec = this.rec;
    this.rec = null;
    try { rec?.abort(); } catch { /* already ended */ }
    this.clearRestart();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (gen !== this.gen || this.phase !== "listening") return;
      this.whenReady(() => this.openRecognizer(gen));
    }, this.opts.restartMs ?? 100);
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
      this.teardownRecognizer();
      this.opts.onSpeaking?.(false);
      if (!isError && this.active && this.opts.isContinuous()) {
        this.setPhase("idle");
        // Continuous mode re-opens the mic by itself on every platform, iOS included. If the browser
        // refuses a start without a tap, onError(not-allowed) drops to idle ("Tap to continue").
        this.start(true);
      } else {
        this.setPhase("idle");
      }
    };
    if (!text.trim()) return done();
    if (!isError) {
      this.setPhase("speaking");
      this.spoken = text;
      this.listenWhileSpeaking(turn);
    }
    this.ports.speak(text, {
      onStart: () => {
        if (turn === this.turn) this.opts.onSpeaking?.(true);
      },
      onEnd: done,
      onError: done,
    });
  }

  /** Keep the mic live while speaking so the user can interrupt by voice, on every platform. */
  private listenWhileSpeaking(turn: number) {
    if (!this.active || !this.opts.isContinuous() || !this.opts.isUserSpeech) return;
    const open = () => turn === this.turn && this.phase === "speaking" && this.active;
    const launch = () => {
      if (!open()) return;
      const rec = this.ports.createRecognizer(
        { continuous: true },
        {
          onResult: (results) => {
            if (!open()) return;
            const heard = results.map((r) => r.text).join(" ").trim();
            if (heard && wordCount(heard) >= (this.opts.bargeMinWords ?? BARGE_MIN_WORDS) && this.opts.isUserSpeech?.(heard, this.spoken)) {
              this.opts.onBargeIn?.();
              this.bargeIn(heard); // the words that interrupted stay part of the new thought
            }
          },
          onEnd: () => {
            if (!open()) return;
            this.rec = null;
            this.clearRestart();
            this.restartTimer = setTimeout(() => {
              this.restartTimer = null;
              this.whenReady(launch);
            }, this.opts.restartMs ?? 100);
          },
          onError: () => {},
        },
      );
      if (!rec) return;
      this.rec = rec;
      try {
        rec.start();
      } catch {
        this.rec = null; // barge-in by tap or energy still works
      }
    };
    this.whenReady(launch);
  }

  /** The user talked over the assistant: cut speech, drop the queue, listen (seeded with what they already said). */
  bargeIn(seed = "") {
    if (this.phase !== "speaking") return;
    this.turn++;
    this.ports.cancelSpeech();
    this.opts.onSpeaking?.(false);
    this.setPhase("idle");
    this.start();
    if (seed) {
      this.carry = seed;
      this.final = seed;
      this.opts.onLine?.(seed);
      this.timer = setTimeout(() => this.phase === "listening" && this.commit(), this.opts.silenceMs);
    }
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
