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

$("poll").onclick = () => {
  chrome.runtime.sendMessage("poll-now");
  status("Checking for approved actions…");
};
