import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useState } from "react";
import { Toaster } from "sonner";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AccountPersistHost } from "@/components/account-persist-host";
import { GithubSyncHost } from "@/components/github-sync-host";
import { AuthProvider } from "@/lib/auth/provider";
import appCss from "../styles.css?url";

const APP_NAME = "MindMesh AI";

/** Same public-host guard the injector uses for og:image (no Vercel system hosts). */
function publicShareHost(): string {
  const raw = String(
    (typeof process !== "undefined" ? process.env?.VITE_PUBLIC_HOSTNAME : "") ||
      (typeof import.meta !== "undefined" ? import.meta.env?.VITE_PUBLIC_HOSTNAME : "") ||
      "",
  );
  const host = raw.split(",")[0]?.trim().split(":")[0]?.toLowerCase() ?? "";
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
  if (host === "vercel.app" || host.endsWith(".vercel.app") || host.endsWith(".vercel.com")) {
    return "";
  }
  return host;
}

const host = publicShareHost();
const xBanner = host ? `https://${host}/x-banner.jpg` : "";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#00171c" },
      {
        name: "description",
        content: "A living visual memory network. Capture thoughts, and watch them connect.",
      },
      ...(xBanner ? [{ property: "x:game:image", content: xBanner }] : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap",
      },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground">
        <PreviewHostBridge />
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AccountPersistHost>
              <GithubSyncHost />
              <Outlet />
              <Toaster theme="dark" position="bottom-center" richColors={false} />
            </AccountPersistHost>
          </AuthProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
