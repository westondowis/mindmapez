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

async function poll() {
  const cfg = await settings();
  if (!cfg) return;
  const { actions } = await api(cfg, "GET");
  for (const a of actions ?? []) {
    try {
      const result = await run(cfg, a);
      await api(cfg, "POST", { id: a.id, ok: true, result });
    } catch (err) {
      await api(cfg, "POST", { id: a.id, ok: false, error: String(err?.message ?? err).slice(0, 200) });
    }
  }
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("poll", { periodInMinutes: POLL_MINUTES }));
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === "poll" && poll().catch(() => undefined));
chrome.runtime.onMessage.addListener((msg) => msg === "poll-now" && poll().catch(() => undefined));
