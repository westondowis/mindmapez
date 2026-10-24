import type { MindBackup } from "@/lib/backup";

export const GITHUB_CONFIG_KEY = "mindmesh.github.config";
export const GITHUB_DATA_PATH = "data/app_data.json";

export type GithubConfig = {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  path: string;
};

export type GithubEnvelope = {
  format: "mindmesh-github";
  version: 1;
  updatedAt: string;
  backup: MindBackup | null;
};

export type GithubFile = {
  sha: string | null;
  envelope: GithubEnvelope;
};

const API = "https://api.github.com";

export function emptyEnvelope(): GithubEnvelope {
  return {
    format: "mindmesh-github",
    version: 1,
    updatedAt: new Date().toISOString(),
    backup: null,
  };
}

export function loadGithubConfig(): GithubConfig | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = JSON.parse(localStorage.getItem(GITHUB_CONFIG_KEY) || "null") as Partial<GithubConfig> | null;
    if (!raw?.owner || !raw.repo || !raw.token) return null;
    return {
      owner: raw.owner.trim(),
      repo: raw.repo.trim(),
      branch: (raw.branch || "main").trim() || "main",
      token: raw.token.trim(),
      path: (raw.path || GITHUB_DATA_PATH).replace(/^\/+/, ""),
    };
  } catch {
    return null;
  }
}

export function saveGithubConfig(config: GithubConfig) {
  const next: GithubConfig = {
    owner: config.owner.trim(),
    repo: config.repo.trim(),
    branch: (config.branch || "main").trim() || "main",
    token: config.token.trim(),
    path: (config.path || GITHUB_DATA_PATH).replace(/^\/+/, ""),
  };
  localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function clearGithubConfig() {
  localStorage.removeItem(GITHUB_CONFIG_KEY);
}

export function encodeGitContent(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function decodeGitContent(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function parseEnvelope(raw: unknown): GithubEnvelope {
  if (!raw || typeof raw !== "object") return emptyEnvelope();
  const row = raw as Partial<GithubEnvelope>;
  if (row.format !== "mindmesh-github") return emptyEnvelope();
  return {
    format: "mindmesh-github",
    version: 1,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
    backup: row.backup ?? null,
  };
}

function contentsUrl(config: GithubConfig) {
  return `${API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${config.path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function gh(config: GithubConfig, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  return res;
}

function errorMessage(status: number, body: string) {
  if (status === 401) return "GitHub rejected the token. Use a fine-grained PAT with Contents read and write.";
  if (status === 404) return "Repo or file was not found. Check the owner, repo, and that the token can see it.";
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) return parsed.message;
  } catch {
    /* ignore */
  }
  return body.slice(0, 180) || `GitHub request failed (${status})`;
}

export async function testGithubConnection(config: GithubConfig) {
  const res = await gh(config, `${API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`);
  if (!res.ok) throw new Error(errorMessage(res.status, await res.text()));
  const repo = (await res.json()) as { full_name?: string; default_branch?: string };
  return { fullName: repo.full_name || `${config.owner}/${config.repo}`, defaultBranch: repo.default_branch || "main" };
}

export async function readGithubData(config: GithubConfig): Promise<GithubFile> {
  const url = `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`;
  const res = await gh(config, url);
  if (res.status === 404) return { sha: null, envelope: emptyEnvelope() };
  if (!res.ok) throw new Error(errorMessage(res.status, await res.text()));
  const body = (await res.json()) as { sha?: string; content?: string; encoding?: string };
  if (!body.content || body.encoding !== "base64") {
    throw new Error("GitHub did not return file content. The path must be a file, not a folder.");
  }
  const text = decodeGitContent(body.content);
  return { sha: body.sha ?? null, envelope: parseEnvelope(JSON.parse(text)) };
}

export async function writeGithubData(
  config: GithubConfig,
  envelope: GithubEnvelope,
  sha: string | null,
): Promise<{ sha: string }> {
  const payload = JSON.stringify({ ...envelope, format: "mindmesh-github", version: 1, updatedAt: new Date().toISOString() }, null, 2);
  if (payload.length > 900_000) {
    throw new Error("This mind is too large for one GitHub file. Export audio separately or shorten recordings.");
  }
  let currentSha = sha;
  let lastError = "Could not save to GitHub.";
  for (let attempt = 0; attempt < 3; attempt++) {
    const body: Record<string, string> = {
      message: "mindmesh: save app data",
      content: encodeGitContent(payload),
      branch: config.branch,
    };
    if (currentSha) body.sha = currentSha;
    const res = await gh(config, contentsUrl(config), { method: "PUT", body: JSON.stringify(body) });
    if (res.ok) {
      const saved = (await res.json()) as { content?: { sha?: string } };
      const next = saved.content?.sha;
      if (!next) throw new Error("GitHub saved the file but did not return a SHA.");
      return { sha: next };
    }
    const text = await res.text();
    lastError = errorMessage(res.status, text);
    const missingSha = /sha/i.test(lastError);
    if (res.status === 409 || res.status === 422 || missingSha) {
      const latest = await readGithubData(config);
      currentSha = latest.sha;
      continue;
    }
    throw new Error(lastError);
  }
  throw new Error(lastError);
}
