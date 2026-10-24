import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseMindBackup } from "@/lib/backup";
import {
  clearGithubConfig,
  loadGithubConfig,
  readGithubData,
  saveGithubConfig,
  testGithubConnection,
  writeGithubData,
  type GithubConfig,
} from "@/lib/github-store";
import { exportMind, importMind } from "@/lib/server/backup";

const stored = loadGithubConfig();

export function GithubSyncCard() {
  const qc = useQueryClient();
  const [owner, setOwner] = useState(stored?.owner ?? "");
  const [repo, setRepo] = useState(stored?.repo ?? "");
  const [branch, setBranch] = useState(stored?.branch ?? "main");
  const [token, setToken] = useState(stored?.token ?? "");
  const [status, setStatus] = useState(stored ? "Token saved in this browser only." : "Not connected.");

  function config(): GithubConfig {
    return saveGithubConfig({
      owner,
      repo,
      branch: branch || "main",
      token,
      path: "data/app_data.json",
    });
  }

  const test = useMutation({
    mutationFn: async () => testGithubConnection(config()),
    onSuccess: (repoInfo) => {
      setStatus(`Connected to ${repoInfo.fullName} (${repoInfo.defaultBranch}).`);
      toast.success("GitHub accepted the token");
    },
    onError: (err: Error) => {
      setStatus(err.message);
      toast.error(err.message);
    },
  });

  const push = useMutation({
    mutationFn: async () => {
      const cfg = config();
      const backup = await exportMind();
      const parsed = parseMindBackup(backup);
      if (!parsed.ok) throw new Error(parsed.error);
      const current = await readGithubData(cfg);
      return writeGithubData(cfg, { ...current.envelope, backup: parsed.backup, format: "mindmesh-github", version: 1, updatedAt: new Date().toISOString() }, current.sha);
    },
    onSuccess: () => {
      setStatus("Mind pushed to data/app_data.json.");
      toast.success("Saved to GitHub");
    },
    onError: (err: Error) => {
      setStatus(err.message);
      toast.error(err.message);
    },
  });

  const pull = useMutation({
    mutationFn: async () => {
      const file = await readGithubData(config());
      if (!file.envelope.backup) throw new Error("GitHub file has no mind yet. Push this account first.");
      const parsed = parseMindBackup(file.envelope.backup);
      if (!parsed.ok) throw new Error(parsed.error);
      return importMind({ data: { backup: parsed.backup } });
    },
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.error);
        setStatus(res.error);
        return;
      }
      await qc.invalidateQueries();
      setStatus(`Restored ${res.summary.branchCount} branches and ${res.summary.memoryCount} memories from GitHub.`);
      toast.success("Restored from GitHub");
    },
    onError: (err: Error) => {
      setStatus(err.message);
      toast.error(err.message);
    },
  });

  const busy = test.isPending || push.isPending || pull.isPending;

  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">GitHub storage</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The token stays in this browser and talks to GitHub directly. It is not saved on the MindMesh server. Use a
        fine-grained personal access token with Contents read and write on one repo.
      </p>
      <div className="mt-4 grid gap-2">
        <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="GitHub owner" autoComplete="off" />
        <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="Repository name" autoComplete="off" />
        <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Branch (main)" autoComplete="off" />
        <Input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Personal access token"
          type="password"
          autoComplete="off"
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{status}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy || !token} onClick={() => test.mutate()}>
          Test token
        </Button>
        <Button type="button" disabled={busy || !token} onClick={() => push.mutate()}>
          Push mind
        </Button>
        <Button type="button" variant="outline" disabled={busy || !token} onClick={() => pull.mutate()}>
          Pull mind
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            clearGithubConfig();
            setToken("");
            setStatus("Token removed from this browser.");
          }}
        >
          Forget token
        </Button>
      </div>
    </section>
  );
}
