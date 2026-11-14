const $ = (id) => document.getElementById(id);
const status = (t) => ($("status").textContent = t);

chrome.storage.local.get(["server"]).then(({ server }) => ($("server").value = server ?? ""));

$("save").onclick = async () => {
  const server = $("server").value.trim();
  const token = $("token").value.trim();
  if (!/^https:\/\//.test(server) || !/^mm_/.test(token)) return status("Enter an https URL and an mm_ token.");
  await chrome.storage.local.set({ server, token });
  $("token").value = "";
  status("Saved.");
};

// Chrome asks you to confirm each site; the connector's allowed websites must also include it.
$("allow").onclick = async () => {
  const site = $("site").value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!site) return;
  const ok = await chrome.permissions.request({ origins: [`https://${site}/*`, `https://*.${site}/*`] });
  status(ok ? `Allowed ${site}.` : "Not allowed.");
};

$("poll").onclick = async () => {
  status("Checking for approved actions…");
  await chrome.runtime.sendMessage("poll-now");
  status("Checked.");
  showConnection();
};

// Connection status written by the background poll on every cycle.
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}
async function showConnection() {
  const { status } = await chrome.storage.local.get(["status"]);
  const el = $("conn");
  if (!status) {
    el.textContent = "Not checked yet.";
    return;
  }
  const bad = !!status.lastError && !status.lastCount;
  el.style.background = bad ? "#fee2e2" : "#dcfce7";
  el.textContent = bad
    ? `Error: ${status.lastError} (${ago(status.lastPollAt)})`
    : `Connected, last check ${ago(status.lastPollAt)}, ${status.lastCount} action${status.lastCount === 1 ? "" : "s"} run${status.lastError ? `. Last error: ${status.lastError}` : "."}`;
}
showConnection();
chrome.storage.onChanged.addListener((_c, area) => area === "local" && showConnection());
