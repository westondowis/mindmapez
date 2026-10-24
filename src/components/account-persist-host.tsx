import { useEffect } from "react";
import { flushAccount } from "@/lib/account-persist";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function AccountPersistHost({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUserState();

  useEffect(() => {
    if (!user) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") void flushAccount("idle");
    };
    const onHide = () => {
      void flushAccount("unload");
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [user]);

  return <>{children}</>;
}
