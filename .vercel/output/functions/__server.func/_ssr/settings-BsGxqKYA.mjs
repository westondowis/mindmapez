import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { a as require_jsx_runtime, i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/react+tanstack__react-query.mjs";
import { i as formatRelative } from "./utils-KYK7ILYy.mjs";
import { i as signOut } from "./client-B40BzJxt.mjs";
import { a as hasGateSessionMarker } from "./server-DJe0bw02.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { i as useCurrentUser, o as flushAccount } from "./router-JzWW0JG9.mjs";
import { t as AppShell } from "./createSsrRpc-B8lW_4O7.mjs";
import { t as PageHeader } from "./page-header-6fLVxyeQ.mjs";
import { t as RequireAuth } from "./require-auth-C-MSc5Vn.mjs";
import { t as Button } from "./button-DpEjrIC3.mjs";
import { t as createMemory } from "./memories-DLH5CEI3.mjs";
import { n as getAccountDraft, t as clearAccountDraft } from "./persist-Cbg-Rdx4.mjs";
import { n as resetSampleMind, r as setPlan, t as getDashboard } from "./dashboard-Br8IbZd4.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/settings-BsGxqKYA.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var subscribeToNothing = () => () => {};
var noGateOnServer = () => false;
function AccountSignOut() {
	const user = useCurrentUser();
	const [busy, setBusy] = (0, import_react.useState)(false);
	const gateSession = (0, import_react.useSyncExternalStore)(subscribeToNothing, hasGateSessionMarker, noGateOnServer);
	if (!user || gateSession) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
		variant: "outline",
		disabled: busy,
		onClick: () => {
			setBusy(true);
			(async () => {
				try {
					await flushAccount("logout");
					const c = (await getAccountDraft()).capture;
					if (c && (c.title.trim() || c.body.trim() || c.transcript.trim() || c.mediaUrl || c.sourceUrl.trim())) {
						const text = c.body.trim() || c.transcript.trim();
						await createMemory({ data: {
							title: c.title.trim() || void 0,
							body: text || c.title || c.mediaName || c.sourceUrl || "Captured memory",
							memoryType: c.mode === "thought" ? "thought" : c.mode || "text",
							transcript: c.transcript.trim() || null,
							mediaUrl: c.mediaUrl,
							mediaMime: c.mediaMime,
							mediaName: c.mediaName,
							emoji: c.emoji,
							color: c.color,
							tags: c.tags,
							sourceUrl: c.sourceUrl || null,
							sourceKind: c.sourceKind ?? null
						} });
						await clearAccountDraft();
					}
					toast.success("Mesh and transcripts saved to your account");
					await signOut("/login");
				} catch {
					setBusy(false);
					toast.error("Couldn’t sign out. Your mesh is still saved — try again.");
				}
			})();
		},
		children: busy ? "Saving & signing out…" : "Sign out"
	});
}
function SettingsRoute() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireAuth, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsPage, {}) });
}
function SettingsPage() {
	const user = useCurrentUser();
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: ["dashboard"],
		queryFn: () => getDashboard()
	});
	const draft = useQuery({
		queryKey: ["account-draft"],
		queryFn: () => getAccountDraft()
	});
	const plan = useMutation({
		mutationFn: setPlan,
		onSuccess: async () => {
			await qc.invalidateQueries();
			toast.success("Plan updated");
		}
	});
	const reset = useMutation({
		mutationFn: () => resetSampleMind(),
		onSuccess: async () => {
			await qc.invalidateQueries();
			toast.success("Sample mind restored");
		}
	});
	const d = q.data;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-xl",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
				kicker: "Account",
				title: "Settings",
				description: "Your mesh, your plan, your data."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl border border-border bg-card p-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-xl",
						children: "You"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-foreground",
						children: user?.displayName ?? "Signed in"
					}),
					user?.primaryEmail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted-foreground",
						children: user.primaryEmail
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-xs text-muted-foreground",
						children: draft.data?.lastSavedAt ? `Last saved ${formatRelative(draft.data.lastSavedAt)}` : "Your mesh saves to this account as you capture and move nodes."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSignOut, {})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-4 rounded-xl border border-border bg-card p-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl",
					children: "Account memory"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "Nodes, layout, voice recordings, and transcripts belong to this sign-in. Switching devices or coming back later restores the same mesh. Signing out writes any unsaved capture first so nothing is left in the tab."
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-4 rounded-xl border border-border bg-card p-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-xl",
						children: "Plan"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 text-sm text-muted-foreground",
						children: [
							"Free holds ",
							500,
							" memories with the basic mesh. Pro unlocks unlimited capture, the assistant, and advanced search."
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-sm",
						children: [
							"Current: ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-primary",
								children: d?.plan === "pro" ? "Pro" : "Free"
							}),
							d ? ` · ${d.memoryCount} memories` : null
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4 flex gap-2",
						children: d?.plan === "pro" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "outline",
							onClick: () => plan.mutate({ data: "free" }),
							children: "Switch to Free"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "highlight",
							onClick: () => plan.mutate({ data: "pro" }),
							children: "Upgrade to Pro"
						})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-4 rounded-xl border border-border bg-card p-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-xl",
						children: "Sample mind"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted-foreground",
						children: "Restore the starter network of golf, real estate, family, and mindset memories. This replaces your current mesh for this account."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "mt-4",
						variant: "outline",
						onClick: () => reset.mutate(),
						children: "Reset sample mind"
					})
				]
			})
		]
	}) });
}
//#endregion
export { SettingsRoute as component };
