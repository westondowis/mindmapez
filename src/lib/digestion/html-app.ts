/**
 * html_app: srcdoc builder and postMessage bridge (brainStorage) validation. Pure so the security
 * rules are unit-tested. The iframe is sandboxed with allow-scripts + allow-forms only (no
 * allow-same-origin, popups or top navigation), so it runs in an opaque "null" origin.
 */
import { applyKvOp, BRIDGE_LIMITS } from "./viewer-types.ts";

export const HTML_APP_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";

export const HTML_APP_SANDBOX = "allow-scripts allow-forms";

/** Shim injected before any app script. Promise API over postMessage, scoped by a per-mount nonce. */
export function bridgeShim(nonce: string): string {
  const n = JSON.stringify(nonce);
  return `<script>(function(){var N=${n},id=0,w={};window.addEventListener("message",function(e){var d=e.data;if(e.source!==window.parent||!d||d.ns!=="brain"||d.v!==1||d.nonce!==N||!w[d.reqId])return;var p=w[d.reqId];delete w[d.reqId];d.ok?p[0](d.value===undefined?null:d.value):p[1](new Error(d.error||"bad_request"))});function c(op,k,v){return new Promise(function(r,j){var q=++id;w[q]=[r,j];parent.postMessage({ns:"brain",v:1,nonce:N,reqId:q,op:op,key:k,value:v},"*")})}var s={getItem:function(k){return c("get",String(k))},setItem:function(k,v){return c("set",String(k),String(v))},removeItem:function(k){return c("remove",String(k))},keys:function(){return c("keys")},clear:function(){return c("clear")}};try{Object.defineProperty(window,"brainStorage",{value:s})}catch(_){window.brainStorage=s}})();</script>`;
}

/** CSP meta + bridge go first in <head>, before anything the uploaded page declares. */
export function buildHtmlAppSrcdoc(html: string, nonce: string): string {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${HTML_APP_CSP}"><meta name="referrer" content="no-referrer">${bridgeShim(nonce)}`;
  // Drop any CSP/refresh/base the page declares so it can't loosen or redirect the frame.
  const cleaned = html
    .replace(/<meta[^>]+http-equiv\s*=\s*["']?(content-security-policy|refresh)["']?[^>]*>/gi, "")
    .replace(/<base\b[^>]*>/gi, "");
  if (/<head\b[^>]*>/i.test(cleaned)) return cleaned.replace(/<head\b[^>]*>/i, (m) => `${m}${head}`);
  if (/<html\b[^>]*>/i.test(cleaned)) return cleaned.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head><body>${cleaned}</body></html>`;
}

export function htmlHasScripts(html: string): boolean {
  return /<script\b/i.test(html) || /\son[a-z]+\s*=/i.test(html);
}

export function htmlTitle(html: string): string | undefined {
  const m = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html);
  return m?.[1]?.trim() || undefined;
}

export type BridgeRequest = { ns: "brain"; v: 1; nonce: string; reqId: number; op: "get" | "set" | "remove" | "keys" | "clear"; key?: string; value?: string };
export type BridgeReply = { ns: "brain"; v: 1; nonce: string; reqId: number; ok: boolean; value?: string | null | string[]; error?: "too_large" | "rate_limited" | "bad_request" };

export type BridgeContext = {
  nonce: string;
  frameWindow: unknown;
  kv: Record<string, string>;
  /** Timestamps (ms) of accepted ops in the last second, for the 50 ops/sec cap. */
  recent: number[];
  now: number;
};

/**
 * Validates one message event. Returns null to drop silently (wrong source/origin/namespace/nonce),
 * otherwise the reply and, for writes, the new kv to persist.
 */
export function handleBridgeMessage(
  event: { source: unknown; origin: string; data: unknown },
  ctx: BridgeContext,
): { reply: BridgeReply; kv?: Record<string, string> } | null {
  if (event.source !== ctx.frameWindow || event.origin !== "null") return null;
  const d = event.data as Partial<BridgeRequest> | null;
  if (!d || typeof d !== "object" || d.ns !== "brain" || d.v !== 1 || d.nonce !== ctx.nonce) return null;
  if (typeof d.reqId !== "number" || !Number.isFinite(d.reqId)) return null;
  const reply = (r: Omit<BridgeReply, "ns" | "v" | "nonce" | "reqId">): BridgeReply => ({ ns: "brain", v: 1, nonce: ctx.nonce, reqId: d.reqId!, ...r });
  while (ctx.recent.length && ctx.now - ctx.recent[0]! > 1000) ctx.recent.shift();
  if (ctx.recent.length >= BRIDGE_LIMITS.maxOpsPerSecond) return { reply: reply({ ok: false, error: "rate_limited" }) };
  ctx.recent.push(ctx.now);
  const keyOk = typeof d.key === "string" && d.key.length > 0 && d.key.length <= BRIDGE_LIMITS.maxKeyChars;
  switch (d.op) {
    case "get":
      if (!keyOk) return { reply: reply({ ok: false, error: "bad_request" }) };
      return { reply: reply({ ok: true, value: Object.prototype.hasOwnProperty.call(ctx.kv, d.key!) ? ctx.kv[d.key!]! : null }) };
    case "keys":
      return { reply: reply({ ok: true, value: Object.keys(ctx.kv) }) };
    case "set":
    case "remove":
    case "clear": {
      if (d.op !== "clear" && !keyOk) return { reply: reply({ ok: false, error: "bad_request" }) };
      if (d.op === "set" && typeof d.value !== "string") return { reply: reply({ ok: false, error: "bad_request" }) };
      const res = applyKvOp(ctx.kv, { op: d.op, key: d.key, value: d.value });
      if (!res.ok) return { reply: reply({ ok: false, error: res.error }) };
      return { reply: reply({ ok: true, value: null }), kv: res.kv };
    }
    default:
      return { reply: reply({ ok: false, error: "bad_request" }) };
  }
}
