import { useEffect } from "react";
import { parseMindBackup } from "@/lib/backup";
import { registerAccountFlusher } from "@/lib/account-persist";
import { loadGithubConfig, readGithubData, writeGithubData } from "@/lib/github-store";
import { exportMind } from "@/lib/server/backup";

export function GithubSyncHost() {
  useEffect(() => {
    return registerAccountFlusher(async () => {
      const config = loadGithubConfig();
      if (!config) return;
      const backup = await exportMind();
      const parsed = parseMindBackup(backup);
      if (!parsed.ok) return;
      const current = await readGithubData(config);
      await writeGithubData(
        config,
        {
          format: "mindmesh-github",
          version: 1,
          updatedAt: new Date().toISOString(),
          backup: parsed.backup,
        },
        current.sha,
      );
    });
  }, []);
  return null;
}
