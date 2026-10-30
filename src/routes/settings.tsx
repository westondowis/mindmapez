import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AccountSignOut } from "@/components/account-sign-out";
import { DriveBackupCard } from "@/components/drive-backup-card";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  downloadBackupFile,
  parseMindBackup,
  summarizeBackup,
  type BackupSummary,
  type MindBackup,
} from "@/lib/backup";
import { exportMind, importMind } from "@/lib/server/backup";
import { getGraph } from "@/lib/server/memories";
import { getDashboard, resetSampleMind, setPlan } from "@/lib/server/dashboard";
import { getAccountDraft } from "@/lib/server/persist";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { FREE_MEMORY_LIMIT } from "@/lib/types";
import { formatRelative } from "@/lib/utils";

export const Route = createFileRoute("/settings")({ component: SettingsRoute });

function SettingsRoute() {
  return (
    <RequireAuth>
      <SettingsPage />
    </RequireAuth>
  );
}

function SettingsPage() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<{ backup: MindBackup; summary: BackupSummary } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const draft = useQuery({ queryKey: ["account-draft"], queryFn: () => getAccountDraft() });
  const plan = useMutation({
    mutationFn: setPlan,
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success("Plan updated");
    },
  });
  const reset = useMutation({
    mutationFn: () => resetSampleMind(),
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success("Sample mind restored");
    },
  });
  const [exporting, setExporting] = useState(false);
  async function exportJson() {
    setExporting(true);
    try {
      const graph = await getGraph();
      const payload = {
        format: "mindmesh-export",
        exportedAt: new Date().toISOString(),
        sectors: graph.sectors ?? [],
        concepts: graph.concepts ?? [],
        memories: graph.memories ?? [],
        connections: graph.connections ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `memory_brain_export_${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success(`Exported ${payload.concepts.length} branches and ${payload.memories.length} memories.`);
    } catch {
      toast.error("Could not export your mind. Try again.");
    } finally {
      setExporting(false);
    }
  }
  const imp = useMutation({
    mutationFn: (backup: MindBackup) => importMind({ data: { backup } }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPendingBackup(null);
      setPaste("");
      setPasteOpen(false);
      await qc.invalidateQueries();
      toast.success(
        `Restored ${res.summary.branchCount} branches and ${res.summary.memoryCount} memories.`,
      );
    },
    onError: () => toast.error("Could not restore that backup."),
  });
  const d = q.data;

  function stageBackup(raw: unknown) {
    const parsed = parseMindBackup(raw);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    setPendingBackup({ backup: parsed.backup, summary: summarizeBackup(parsed.backup) });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <PageHeader kicker="Account" title="Settings" description="Your mesh, your plan, your data." />
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">You</h2>
          <p className="mt-2 text-sm text-foreground">{user?.displayName ?? "Signed in"}</p>
          {user?.primaryEmail ? <p className="text-sm text-muted-foreground">{user.primaryEmail}</p> : null}
          <p className="mt-3 text-xs text-muted-foreground">
            {draft.data?.lastSavedAt
              ? `Last saved ${formatRelative(draft.data.lastSavedAt)}`
              : "Your mesh saves to this account as you capture and move nodes."}
          </p>
          <div className="mt-4">
            <AccountSignOut />
          </div>
        </section>
        <DriveBackupCard />
        <section className="mt-4 rounded-xl border border-highlight/40 bg-card p-5">
          <h2 className="font-display text-xl">Backup & restore</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Download a JSON snapshot of your whole mind — branches, nested maps, recordings,
            transcripts, tags, and the eight main brain labels. After a reset or a new account,
            bring that file back and your mesh returns.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {d
              ? `${d.memoryCount} memories · ${d.voiceCount} recordings · ${d.connectionCount} links on this account.`
              : "Loading counts…"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void exportJson()} disabled={exporting}>
              {exporting ? "Preparing file…" : "Export JSON"}
            </Button>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              Restore from file
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPasteOpen((v) => !v)}>
              Paste JSON
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void file.text().then((text) => stageBackup(text));
            }}
          />
          {pasteOpen ? (
            <div className="mt-4">
              <label className="block text-xs text-muted-foreground" htmlFor="backup-paste">
                Paste a MindMesh JSON backup
              </label>
              <Textarea
                id="backup-paste"
                className="mt-1 min-h-28 font-mono text-xs"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder='{ "format": "mindmesh-backup", ... }'
              />
              <Button
                type="button"
                className="mt-2"
                variant="secondary"
                disabled={!paste.trim()}
                onClick={() => stageBackup(paste)}
              >
                Read pasted backup
              </Button>
            </div>
          ) : null}
          {pendingBackup ? (
            <div className="mt-4 rounded-lg border border-highlight/50 bg-highlight/10 p-4">
              <p className="font-display text-lg">Ready to restore {pendingBackup.summary.displayName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pendingBackup.summary.branchCount} branches · {pendingBackup.summary.memoryCount} memories ·{" "}
                {pendingBackup.summary.voiceCount} recordings
                {pendingBackup.summary.exportedAt
                  ? ` · exported ${formatRelative(pendingBackup.summary.exportedAt)}`
                  : ""}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                This replaces the mind on this account. Export first if you want to keep what is here now.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="highlight"
                  disabled={imp.isPending}
                  onClick={() => imp.mutate(pendingBackup.backup)}
                >
                  {imp.isPending ? "Restoring…" : "Replace my mind"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setPendingBackup(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </section>
        <section className="mt-4 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Account memory</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Nodes, layout, voice recordings, and transcripts belong to this sign-in. Switching devices or
            coming back later restores the same mesh. Signing out writes any unsaved capture first so
            nothing is left in the tab. Use Export JSON before a rebuild if you want a file you can hold onto.
          </p>
        </section>
        <section className="mt-4 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Plan</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Free holds {FREE_MEMORY_LIMIT} memories with the basic mesh. Pro unlocks unlimited capture, the
            assistant, and advanced search.
          </p>
          <p className="mt-3 text-sm">
            Current: <span className="text-primary">{d?.plan === "pro" ? "Pro" : "Free"}</span>
            {d ? ` · ${d.memoryCount} memories` : null}
          </p>
          <div className="mt-4 flex gap-2">
            {d?.plan === "pro" ? (
              <Button variant="outline" onClick={() => plan.mutate({ data: "free" })}>
                Switch to Free
              </Button>
            ) : (
              <Button variant="highlight" onClick={() => plan.mutate({ data: "pro" })}>
                Upgrade to Pro
              </Button>
            )}
          </div>
        </section>
        <section className="mt-4 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Sample mind</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Restore the starter network of golf, real estate, family, and mindset memories. This replaces your
            current mesh for this account.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => reset.mutate()}>
            Reset sample mind
          </Button>
        </section>
      </div>
    </AppShell>
  );
}
