// MindMeld Bridge: polls MindMeld for browser actions the owner already approved,
// confirms each one again in the browser, then runs it in a tab on that exact host.
// The server only returns approved actions for this connector's allowed domains;
// the extension re-checks the host and asks Chrome for per-site permission.

const POLL_MINUTES = 1;

async function settings() {
  const { server, token } = await chrome.storage.local.get(["server", "token"]);
  return server && token ? { server: server.replace(/\/+$/, ""), token } : null;
}

async function api(cfg, method, body) {
  const res = await fetch(`${cfg.server}/api/bridge/actions`, {
    method,
    headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`bridge ${res.status}`);
  return res.json();
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(done);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(done);
  });
}

// Runs inside the page. Never reads cookies or storage; returns visible text only for `read`.
function perform(action, selector, text) {
  const el = selector ? document.querySelector(selector) : null;
  if (action === "read") return { title: document.title, text: (el ?? document.body).innerText.slice(0, 5000) };
  if (!el) throw new Error("selector_not_found");
  if (action === "click") el.click();
  if (action === "type") {
    el.focus();
    if ("value" in el) el.value = text ?? "";
    else el.textContent = text ?? "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (action === "submit") (el.form ?? el).requestSubmit?.() ?? el.click();
  return { done: action };
}

async function run(cfg, a) {
  const url = new URL(a.url);
  if (url.protocol !== "https:" || url.hostname !== a.domain) throw new Error("host_mismatch");
  const origin = `https://${url.hostname}/*`;
  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (!granted) throw new Error(`site_permission_missing:${url.hostname}`);
  const tab = await chrome.tabs.create({ url: a.url, active: true });
  await waitForLoad(tab.id);
  const current = new URL((await chrome.tabs.get(tab.id)).url);
  if (current.hostname !== url.hostname) throw new Error("redirected_off_host");
  if (a.action === "navigate") return { url: current.toString() };
  const [out] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: perform,
    args: [a.action, a.selector, a.text],
  });
  return out?.result ?? null;
}

async function record(status, badge, color) {
  await chrome.storage.local.set({ status });
  await chrome.action.setBadgeText({ text: badge });
  if (badge) await chrome.action.setBadgeBackgroundColor({ color });
}

// Every cycle records { lastPollAt, lastError, lastCount } for the popup and sets the toolbar badge:
// "!" on an auth/network error, the number of actions run when there were any, otherwise blank.
async function poll() {
  const lastPollAt = Date.now();
  const cfg = await settings();
  if (!cfg) return record({ lastPollAt, lastError: "Not set up: add the MindMeld URL and token.", lastCount: 0 }, "!", "#b45309");
  let lastCount = 0;
  let lastError = null;
  try {
    const { actions } = await api(cfg, "GET");
    for (const a of actions ?? []) {
      lastCount += 1;
      try {
        const result = await run(cfg, a);
        await api(cfg, "POST", { id: a.id, ok: true, result });
      } catch (err) {
        const message = String(err?.message ?? err).slice(0, 200);
        lastError = message;
        await api(cfg, "POST", { id: a.id, ok: false, error: message });
      }
    }
  } catch (err) {
    const m = String(err?.message ?? err);
    lastError = /bridge 40[13]/.test(m) ? "Sign-in rejected: check the connector token." : `Cannot reach MindMeld (${m.slice(0, 120)})`;
    return record({ lastPollAt, lastError, lastCount }, "!", "#b91c1c");
  }
  await record({ lastPollAt, lastError, lastCount }, lastCount ? String(lastCount) : "", "#15803d");
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("poll", { periodInMinutes: POLL_MINUTES }));
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === "poll" && poll().catch(() => undefined));
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg !== "poll-now") return;
  poll().catch(() => undefined).finally(() => reply(true));
  return true; // keep the channel open until the poll finishes
});
