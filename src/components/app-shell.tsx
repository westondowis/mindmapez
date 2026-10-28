import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarRange,
  Compass,
  LayoutDashboard,
  MessageSquareText,
  Network,
  Plus,
  Search,
  Settings,
  Sunrise,
} from "lucide-react";
import { useRef } from "react";
import { ImportDropHost } from "@/components/import-drop-host";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Mesh", icon: Network, exact: true },
  { to: "/capture", label: "Capture", icon: Plus },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/timeline", label: "Timeline", icon: CalendarRange },
  { to: "/search", label: "Search", icon: Search },
  { to: "/assistant", label: "Assistant", icon: MessageSquareText },
  { to: "/reflect", label: "Reflect", icon: Sunrise },
] as const;

export function AppShell({
  children,
  bleed = false,
  locked = false,
}: {
  children: React.ReactNode;
  bleed?: boolean;
  locked?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const meshTap = useRef(0);

  function onMeshPress(event: React.MouseEvent | React.TouchEvent) {
    const now = Date.now();
    if (pathname === "/" && now - meshTap.current < 450) {
      event.preventDefault();
      window.dispatchEvent(new Event("mindmesh-home"));
    }
    meshTap.current = now;
  }

  return (
    <div className="mesh-field relative min-h-dvh">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-70" />
      {!locked ? (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center border-r border-border bg-background/80 py-4 backdrop-blur-md md:flex">
          <Link to="/" className="mb-6 flex size-10 items-center justify-center" aria-label="MindMesh">
            <span className="relative flex size-8 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-highlight/30 animate-pulse-ring" />
              <span className="relative size-3.5 rounded-full bg-highlight shadow-[0_0_16px_var(--color-highlight)]" />
            </span>
          </Link>
          <nav className="flex flex-1 flex-col items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.to || ("exact" in item && item.exact ? false : pathname.startsWith(item.to) && item.to !== "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  onClick={item.to === "/" ? onMeshPress : undefined}
                  onDoubleClick={
                    item.to === "/"
                      ? (event) => {
                          event.preventDefault();
                          window.dispatchEvent(new Event("mindmesh-home"));
                        }
                      : undefined
                  }
                  className={cn(
                    "flex size-11 items-center justify-center rounded-md transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
                  )}
                >
                  <Icon className="size-5" />
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col items-center gap-2">
            <Link
              to="/settings"
              title="Settings"
              className={cn(
                "flex size-11 items-center justify-center rounded-md",
                pathname.startsWith("/settings")
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
              )}
            >
              <Settings className="size-5" />
            </Link>
            <div className="flex size-11 items-center justify-center">
              {isPending ? (
                <div className="size-8 animate-pulse rounded-full bg-secondary" />
              ) : user ? (
                <Link
                  to="/settings"
                  className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-medium text-primary"
                  title="Account"
                >
                  {(user.displayName ?? user.primaryEmail ?? "ME").charAt(0).toUpperCase()}
                </Link>
              ) : null}
            </div>
          </div>
        </aside>
      ) : null}

      <main
        className={cn(
          "relative z-10 min-h-dvh",
          locked ? "pb-0 md:pl-0" : "pb-20 md:pb-0 md:pl-16",
          !bleed && "px-4 py-5 sm:px-6 lg:px-8",
        )}
      >
        {children}
      </main>

      {!locked ? (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-border bg-background/90 px-1 py-1.5 backdrop-blur-md touch-manipulation md:hidden" style={{ transform: "none", zoom: 1 }}>
          {(
            [
              NAV[0],
              NAV[2],
              NAV[1],
              NAV[4],
              NAV[5],
              { to: "/settings", label: "More", icon: Compass },
            ] as const
          ).map((item) => {
            const active = "exact" in item && item.exact ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={item.to === "/" ? onMeshPress : undefined}
                onDoubleClick={
                  item.to === "/"
                    ? (event) => {
                        event.preventDefault();
                        window.dispatchEvent(new Event("mindmesh-home"));
                      }
                    : undefined
                }
                className={cn(
                  "flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {!locked ? <ImportDropHost /> : null}
    </div>
  );
}
