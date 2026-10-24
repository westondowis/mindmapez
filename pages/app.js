import {
  LOCAL_KEY,
  clearConfig,
  emptyEnvelope,
  loadConfig,
  readData,
  saveConfig,
  testConnection,
  writeData,
} from "./github-store.js";

const SECTORS = [
  { id: "frontal", label: "Frontal lobe", kicker: "Planning & decisions" },
  { id: "parietal", label: "Parietal lobe", kicker: "Attention & space" },
  { id: "temporal", label: "Temporal lobe", kicker: "Memory & language" },
  { id: "occipital", label: "Occipital lobe", kicker: "What you notice" },
  { id: "cerebellum", label: "Cerebellum", kicker: "Practice & timing" },
  { id: "brainstem", label: "Brain stem", kicker: "Sleep & energy" },
];

const app = document.querySelector("#app");
const statusEl = document.querySelector("#status");
let sha = null;
let envelope = loadLocal();
let sectorId = null;
let branchId = null;
let memoryId = null;
let saveTimer = 0;

function uid() {
  return crypto.randomUUID();
}

function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
    if (raw?.format === "mindmesh-github") return raw;
  } catch {
    /* ignore */
  }
  return emptyEnvelope();
}

function ensureBackup() {
  if (envelope.backup) return envelope.backup;
  const now = new Date().toISOString();
  envelope.backup = {
    format: "mindmesh-backup",
    version: 1,
    exportedAt: now,
    settings: {
      displayName: "Mind",
      age: null,
      onboarded: true,
      plan: "free",
      brainSectorsJson: JSON.stringify(SECTORS.map((s) => ({ id: s.id, label: s.label, kicker: s.kicker, named: true }))),
    },
    concepts: [],
    memories: [],
    memoryConcepts: [],
    connections: [],
    assistantMessages: [],
    draftJson: null,
  };
  return envelope.backup;
}

function sectorLabel(id) {
  const backup = envelope.backup;
  if (backup?.settings?.brainSectorsJson) {
    try {
      const rows = JSON.parse(backup.settings.brainSectorsJson);
      const hit = rows.find((row) => row.id === id && row.label);
      if (hit?.label) return hit.label;
    } catch {
      /* ignore */
    }
  }
  return SECTORS.find((s) => s.id === id)?.label || id;
}

function branchesIn(id) {
  return (envelope.backup?.concepts || []).filter((c) => (c.sectorId || "frontal") === id && !c.parentId);
}

function childrenOf(id) {
  return (envelope.backup?.concepts || []).filter((c) => c.parentId === id);
}

function memoriesOf(id) {
  const links = new Set((envelope.backup?.memoryConcepts || []).filter((l) => l.conceptId === id).map((l) => l.memoryId));
  return (envelope.backup?.memories || []).filter((m) => links.has(m.id));
}

function setStatus(text) {
  statusEl.textContent = text;
}

function scheduleSave() {
  envelope.updatedAt = new Date().toISOString();
  localStorage.setItem(LOCAL_KEY, JSON.stringify(envelope));
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void push(), 1200);
}

async function push() {
  const config = loadConfig();
  if (!config) {
    setStatus("Saved on this device. Add a GitHub token to store it in the repo.");
    return;
  }
  try {
    setStatus("Saving to GitHub…");
    const saved = await writeData(config, envelope, sha);
    sha = saved.sha || sha;
    setStatus("Saved to data/app_data.json.");
  } catch (err) {
    setStatus(err.message || "GitHub save failed.");
  }
}

async function pull() {
  const config = loadConfig();
  if (!config) return;
  setStatus("Reading GitHub…");
  const file = await readData(config);
  sha = file.sha;
  if (file.envelope?.backup) {
    envelope = file.envelope;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(envelope));
    setStatus("Loaded the mind from GitHub.");
  } else {
    setStatus("GitHub file is empty. This device will fill it on the next save.");
  }
  render();
}

function addBranch(parentId) {
  const name = window.prompt(parentId ? "Sub-branch name" : "Branch name");
  if (!name?.trim() || !sectorId) return;
  const backup = ensureBackup();
  const now = new Date().toISOString();
  backup.concepts.push({
    id: uid(),
    name: name.trim(),
    kind: "theme",
    icon: null,
    emoji: "✦",
    color: null,
    positionX: null,
    positionY: null,
    parentId: parentId || null,
    sectorId,
    description: "",
    createdAt: now,
    updatedAt: now,
  });
  scheduleSave();
  render();
}

function addNote() {
  if (!branchId) return;
  const title = document.querySelector("#note-title").value.trim();
  const body = document.querySelector("#note-body").value.trim();
  if (!title && !body) return;
  const backup = ensureBackup();
  const now = new Date().toISOString();
  const id = uid();
  backup.memories.push({
    id,
    title: title || body.slice(0, 80),
    body: body || title,
    memoryType: "text",
    emotion: null,
    importance: 3,
    aiImpact: "medium",
    aiSummary: null,
    transcript: null,
    mediaUrl: null,
    mediaMime: null,
    mediaName: null,
    nodeKind: "note",
    tags: [],
    accessCount: 0,
    positionX: null,
    positionY: null,
    emoji: null,
    color: null,
    sourceUrl: null,
    sourceKind: null,
    createdAt: now,
    updatedAt: now,
  });
  backup.memoryConcepts.push({ memoryId: id, conceptId: branchId });
  memoryId = id;
  scheduleSave();
  render();
}

function render() {
  const backup = envelope.backup;
  const sector = SECTORS.find((s) => s.id === sectorId);
  const branch = (backup?.concepts || []).find((c) => c.id === branchId);
  const memories = branchId ? memoriesOf(branchId) : [];
  const active = memoryId ? memories.find((m) => m.id === memoryId) || null : null;

  app.innerHTML = `
    <p class="kicker">${sector ? sectorLabel(sector.id) : "Brain"}</p>
    <div class="row" style="margin:0.6rem 0 1rem">
      ${sector ? `<button type="button" id="back">Back</button>` : ""}
      ${branch ? `<button type="button" id="up">All branches</button>` : ""}
    </div>
    ${
      !sector
        ? `<div class="grid">${SECTORS.map((s) => {
            const count = (backup?.concepts || []).filter((c) => (c.sectorId || "frontal") === s.id).length;
            return `<button class="sector" data-sector="${s.id}"><span class="kicker">${s.kicker}</span><strong>${sectorLabel(s.id)}</strong><span class="muted">${count} branches</span></button>`;
          }).join("")}</div>`
        : !branch
          ? `<div class="row" style="margin-bottom:0.8rem"><button class="primary" id="add-branch" type="button">Add branch</button></div>
             <div class="grid">${branchesIn(sector.id)
               .map((c) => `<button class="branch" data-branch="${c.id}"><strong>${c.name}</strong><span class="muted">${childrenOf(c.id).length} sub · ${memoriesOf(c.id).length} saved</span></button>`)
               .join("") || `<p class="muted">No branches in this region yet.</p>`}</div>`
          : `<h2 style="font-family:Fraunces,serif;font-weight:560">${branch.name}</h2>
             <div class="row" style="margin-bottom:0.8rem"><button class="primary" id="add-sub" type="button">Add sub-branch</button></div>
             <div class="tabs" role="tablist">
               ${memories.map((m) => `<button type="button" data-memory="${m.id}" aria-selected="${active?.id === m.id}">${m.title}</button>`).join("")}
               <button type="button" id="new-tab" class="gold" aria-selected="${!active}">+ New</button>
             </div>
             ${
               active
                 ? `<article class="card memory" style="padding:1rem;margin-top:0.8rem"><strong>${active.title}</strong><p>${active.transcript || active.body}</p></article>`
                 : `<form id="note" class="card" style="padding:1rem;margin-top:0.8rem"><label>Title<input id="note-title" maxlength="120"></label><label>Note<textarea id="note-body"></textarea></label><div class="row" style="margin-top:0.8rem"><button class="primary" type="submit">Save note</button></div></form>`
             }
             ${childrenOf(branch.id).length ? `<div class="grid" style="margin-top:0.8rem">${childrenOf(branch.id).map((c) => `<button class="branch" data-branch="${c.id}"><strong>${c.name}</strong></button>`).join("")}</div>` : ""}`
    }
  `;

  app.querySelector("#back")?.addEventListener("click", () => {
    sectorId = null;
    branchId = null;
    render();
  });
  app.querySelector("#up")?.addEventListener("click", () => {
    branchId = null;
    memoryId = null;
    render();
  });
  app.querySelectorAll("[data-sector]").forEach((el) =>
    el.addEventListener("click", () => {
      sectorId = el.dataset.sector;
      branchId = null;
      render();
    }),
  );
  app.querySelectorAll("[data-branch]").forEach((el) =>
    el.addEventListener("click", () => {
      branchId = el.dataset.branch;
      const sectorOf = backup?.concepts.find((c) => c.id === branchId);
      if (sectorOf?.sectorId) sectorId = sectorOf.sectorId;
      memoryId = memoriesOf(branchId)[0]?.id || null;
      render();
    }),
  );
  app.querySelector("#add-branch")?.addEventListener("click", () => addBranch(null));
  app.querySelector("#add-sub")?.addEventListener("click", () => addBranch(branchId));
  app.querySelectorAll("[data-memory]").forEach((el) =>
    el.addEventListener("click", () => {
      memoryId = el.dataset.memory;
      render();
    }),
  );
  app.querySelector("#new-tab")?.addEventListener("click", () => {
    memoryId = null;
    render();
  });
  app.querySelector("#note")?.addEventListener("submit", (event) => {
    event.preventDefault();
    addNote();
  });
}

const dialog = document.querySelector("#settings");
document.querySelector("#open-settings").addEventListener("click", () => {
  const config = loadConfig();
  dialog.querySelector("#owner").value = config?.owner || "";
  dialog.querySelector("#repo").value = config?.repo || "";
  dialog.querySelector("#branch").value = config?.branch || "main";
  dialog.querySelector("#token").value = config?.token || "";
  dialog.showModal();
});
dialog.querySelector("#close-settings").addEventListener("click", () => dialog.close());
dialog.querySelector("#forget").addEventListener("click", () => {
  clearConfig();
  setStatus("Token removed from this browser.");
  dialog.close();
});
dialog.querySelector("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const config = saveConfig({
    owner: dialog.querySelector("#owner").value,
    repo: dialog.querySelector("#repo").value,
    branch: dialog.querySelector("#branch").value,
    token: dialog.querySelector("#token").value,
  });
  try {
    const repo = await testConnection(config);
    setStatus(`Connected to ${repo.fullName}.`);
    dialog.close();
    await pull();
  } catch (err) {
    setStatus(err.message);
  }
});

render();
if (loadConfig()) void pull();
else setStatus("Saved on this device until you connect GitHub.");
