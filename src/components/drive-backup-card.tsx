import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { redirectToLoginIfRequired } from "@/lib/app-data";
import { loadMindFromDrive, saveMindToDrive } from "@/lib/server/drive-backup";

function fail(result: { ok: false; error: string; loginRequired?: boolean; loginUrl?: string }) {
  if (
    redirectToLoginIfRequired({
      ok: false,
      data: null,
      loginRequired: result.loginRequired,
      loginUrl: result.loginUrl,
      errorMessage: result.error,
    })
  ) {
    return;
  }
  toast.error(result.error);
}

export function DriveBackupCard() {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => saveMindToDrive(),
    onSuccess: (result) => {
      if (!result.ok) {
        fail(result);
        return;
      }
      toast.success(result.created ? "Saved MindMesh.json to Google Drive" : "Overwrote MindMesh.json in Google Drive");
    },
    onError: () => toast.error("Could not reach Google Drive."),
  });
  const load = useMutation({
    mutationFn: () => loadMindFromDrive(),
    onSuccess: async (result) => {
      if (!result.ok) {
        fail(result);
        return;
      }
      await qc.invalidateQueries();
      toast.success(`Restored ${result.summary.branchCount} branches and ${result.summary.memoryCount} memories.`);
    },
    onError: () => toast.error("Could not reach Google Drive."),
  });
  const busy = save.isPending || load.isPending;

  return (
    <section className="mt-4 rounded-xl border border-highlight/40 bg-card p-5">
      <h2 className="font-display text-xl">Google Drive</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        One file, named MindMesh.json. Save overwrites that same file. No token to paste.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save to Google Drive"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => load.mutate()}>
          {load.isPending ? "Loading…" : "Load from Google Drive"}
        </Button>
      </div>
    </section>
  );
}
