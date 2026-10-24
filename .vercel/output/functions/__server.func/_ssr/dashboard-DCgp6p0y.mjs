import { y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as require_jsx_runtime, i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/react+tanstack__react-query.mjs";
import { t as AppShell } from "./createSsrRpc-B8lW_4O7.mjs";
import { t as PageHeader } from "./page-header-6fLVxyeQ.mjs";
import { t as RequireAuth } from "./require-auth-C-MSc5Vn.mjs";
import { t as Button } from "./button-DpEjrIC3.mjs";
import { s as setConnectionStatus } from "./memories-DLH5CEI3.mjs";
import { t as MemoryCard } from "./memory-card-CTSK-bS0.mjs";
import { t as getDashboard } from "./dashboard-Br8IbZd4.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/dashboard-DCgp6p0y.js
var import_jsx_runtime = require_jsx_runtime();
function DashboardRoute() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireAuth, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DashboardPage, {}) });
}
function Stat({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border bg-card p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 font-display text-3xl tabular-nums",
			children: value
		})]
	});
}
function DashboardPage() {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: ["dashboard"],
		queryFn: () => getDashboard()
	});
	const decide = useMutation({
		mutationFn: setConnectionStatus,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["dashboard"] });
			qc.invalidateQueries({ queryKey: ["graph"] });
		}
	});
	const d = q.data;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-5xl",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			kicker: "Overview",
			title: "The mesh at a glance",
			description: "What is growing, what is glowing, and which threads the network wants you to confirm."
		}), q.isPending || !d ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid gap-3 sm:grid-cols-4",
			children: Array.from({ length: 4 }).map((_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-24 animate-pulse rounded-xl bg-muted" }, i))
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Memories",
						value: d.memoryCount
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Voice notes",
						value: d.voiceCount
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Connections",
						value: d.connectionCount
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: d.plan === "pro" ? "Plan" : "Free capacity",
						value: d.plan === "pro" ? "Pro" : `${d.memoryCount}/500`
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-8 grid gap-6 lg:grid-cols-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-xl border border-border bg-card p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl",
							children: "Most active topics"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-4 space-y-3",
							children: d.topTopics.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex items-center justify-between text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "tabular-nums text-muted-foreground",
									children: t.count
								})]
							}, t.name))
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-xl border border-border bg-card p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl",
							children: "Fastest growing"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-4 space-y-3",
							children: d.growingConcepts.length ? d.growingConcepts.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex items-center justify-between text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "tabular-nums text-muted-foreground",
									children: ["+", t.count]
								})]
							}, t.name)) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
								className: "text-sm text-muted-foreground",
								children: "Capture more this week to see momentum."
							})
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-xl border border-border bg-card p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl",
							children: "Top emotions"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-4 space-y-3",
							children: d.topEmotions.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex items-center justify-between text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "tabular-nums text-muted-foreground",
									children: t.count
								})]
							}, t.name))
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-xl border border-border bg-card p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl",
							children: "Suggested connections"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-4 space-y-4",
							children: d.suggested.length ? d.suggested.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "rounded-lg border border-border bg-background/50 p-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "text-sm",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-foreground",
												children: s.a.label
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-muted-foreground",
												children: " → "
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-foreground",
												children: s.b.label
											})
										]
									}),
									s.reason ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-xs text-muted-foreground",
										children: s.reason
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-2 flex gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											size: "sm",
											onClick: () => decide.mutate({ data: {
												id: s.id,
												status: "accepted"
											} }),
											children: "Accept"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											size: "sm",
											variant: "ghost",
											onClick: () => decide.mutate({ data: {
												id: s.id,
												status: "rejected"
											} }),
											children: "Dismiss"
										})]
									})
								]
							}, s.id)) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
								className: "text-sm text-muted-foreground",
								children: "No pending suggestions. Keep capturing."
							})
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-8",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-3 flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-xl",
						children: "Favorite insights"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/timeline",
						className: "text-sm text-primary",
						children: "Timeline"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid gap-3 md:grid-cols-2",
					children: d.favorites.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemoryCard, { memory: m }, m.id))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-8",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mb-3 font-display text-xl",
					children: "Recent memories"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid gap-3 md:grid-cols-2",
					children: d.recent.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemoryCard, { memory: m }, m.id))
				})]
			})
		] })]
	}) });
}
//#endregion
export { DashboardRoute as component };
