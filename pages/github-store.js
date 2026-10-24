export const CONFIG_KEY = "mindmesh.github.config";
export const LOCAL_KEY = "mindmesh.pages.envelope";
export const DATA_PATH = "data/app_data.json";

export function emptyEnvelope() {
  return { format: "mindmesh-github", version: 1, updatedAt: new Date().toISOString(), backup: null };
}

export function loadConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    if (!raw?.owner || !raw.repo || !raw.token) return null;
    return {
      owner: String(raw.owner).trim(),
      repo: String(raw.repo).trim(),
      branch: String(raw.branch || "main").trim() || "main",
      token: String(raw.token).trim(),
      path: String(raw.path || DATA_PATH).replace(/^\/+/, ""),
    };
  } catch {
    return null;
  }
}

export function saveConfig(config) {
  const next = {
    owner: config.owner.trim(),
    repo: config.repo.trim(),
    branch: (config.branch || "main").trim() || "main",
    token: config.token.trim(),
    path: DATA_PATH,
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

export function encodeGitContent(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function decodeGitContent(b64) {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function contentsUrl(config) {
  const path = config.path
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path}`;
}

async function gh(config, url, init) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

function errorMessage(status, body) {
  if (status === 401) return "GitHub rejected the token. It needs Contents read and write.";
  try {
    const parsed = JSON.parse(body);
    if (parsed.message) return parsed.message;
  } catch {
    /* ignore */
  }
  return body.slice(0, 180) || `GitHub request failed (${status})`;
}

export async function testConnection(config) {
  const res = await gh(config, `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`);
  if (!res.ok) throw new Error(errorMessage(res.status, await res.text()));
  const repo = await res.json();
  return { fullName: repo.full_name, defaultBranch: repo.default_branch || "main" };
}

export async function readData(config) {
  const res = await gh(config, `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`);
  if (res.status === 404) return { sha: null, envelope: emptyEnvelope() };
  if (!res.ok) throw new Error(errorMessage(res.status, await res.text()));
  const body = await res.json();
  const text = decodeGitContent(body.content || "");
  const envelope = JSON.parse(text);
  if (envelope?.format !== "mindmesh-github") return { sha: body.sha || null, envelope: emptyEnvelope() };
  return { sha: body.sha || null, envelope };
}

export async function writeData(config, envelope, sha) {
  const payload = JSON.stringify(
    { ...envelope, format: "mindmesh-github", version: 1, updatedAt: new Date().toISOString() },
    null,
    2,
  );
  if (payload.length > 900000) throw new Error("Mind is too large for one GitHub file.");
  let currentSha = sha;
  let lastError = "Could not save to GitHub.";
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = {
      message: "mindmesh: save app data",
      content: encodeGitContent(payload),
      branch: config.branch,
    };
    if (currentSha) body.sha = currentSha;
    const res = await gh(config, contentsUrl(config), { method: "PUT", body: JSON.stringify(body) });
    if (res.ok) {
      const saved = await res.json();
      return { sha: saved.content?.sha };
    }
    const text = await res.text();
    lastError = errorMessage(res.status, text);
    if (res.status === 409 || res.status === 422 || /sha/i.test(lastError)) {
      const latest = await readData(config);
      currentSha = latest.sha;
      continue;
    }
    throw new Error(lastError);
  }
  throw new Error(lastError);
}
