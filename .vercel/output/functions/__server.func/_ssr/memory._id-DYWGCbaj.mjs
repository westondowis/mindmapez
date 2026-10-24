import { x as useNavigate, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as require_jsx_runtime, i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/react+tanstack__react-query.mjs";
import { r as formatDate } from "./utils-KYK7ILYy.mjs";
import { n as EMOTIONS } from "./types-DAtvk6Qj.mjs";
import { n as Route$1 } from "./router-JzWW0JG9.mjs";
import { t as AppShell } from "./createSsrRpc-B8lW_4O7.mjs";
import { t as RequireAuth } from "./require-auth-C-MSc5Vn.mjs";
import { t as Button } from "./button-DpEjrIC3.mjs";
import { t as TagEditor } from "./tag-editor-BCpF9bTN.mjs";
import { c as suggestMemoryTags, i as getMemory, l as updateMemory, n as deleteMemory } from "./memories-DLH5CEI3.mjs";
import { a as Stars, i as KIND_TONE, r as KIND_LABEL, t as Badge } from "./stars-BLjsm7i7.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/memory._id-DYWGCbaj.js
var import_jsx_runtime = require_jsx_runtime();
function MemoryRoute() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireAuth, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemoryPage, {}) });
}
function MemoryPage() {
	const { id } = Route$1.useParams();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: ["memory", id],
		queryFn: () => getMemory({ data: id })
	});
	const m = q.data;
	const save = useMutation({
		mutationFn: updateMemory,
		onSuccess: () => void qc.invalidateQueries({ queryKey: ["memory", id] })
	});
	const suggest = useMutation({
		mutationFn: suggestMemoryTags,
		onSuccess: (res) => {
			if (!m) return;
			save.mutate({ data: {
				id: m.id,
				tags: res.tags
			} });
		}
	});
	const remove = useMutation({
		mutationFn: () => deleteMemory({ data: id }),
		onSuccess: () => navigate({ to: "/" })
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-2xl pb-10",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/",
			className: "text-sm text-primary",
			children: "Back to mesh"
		}), q.isPending || !m ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-6 h-64 animate-pulse rounded-xl bg-muted" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
						tone: KIND_TONE[m.nodeKind],
						children: KIND_LABEL[m.nodeKind]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs text-muted-foreground",
						children: m.memoryType
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs text-muted-foreground",
						children: formatDate(m.createdAt)
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "mt-3 font-display text-4xl font-medium tracking-tight",
				children: m.title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stars, {
					value: m.importance,
					size: "md",
					onChange: (n) => save.mutate({ data: {
						id: m.id,
						importance: n
					} })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-sm text-muted-foreground",
					children: [m.aiImpact.replace("_", " "), " impact"]
				})]
			}),
			m.aiSummary ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-6 rounded-xl border border-border bg-card px-4 py-4 text-sm leading-relaxed",
				children: m.aiSummary
			}) : null,
			m.sourceUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
				href: m.sourceUrl,
				target: "_blank",
				rel: "noreferrer",
				className: "mt-4 inline-block text-sm text-primary hover:underline",
				children: ["Open original", m.sourceKind ? ` · ${m.sourceKind}` : ""]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90",
				children: m.body
			}),
			m.transcript ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("blockquote", {
				className: "mt-6 border-l-2 border-primary/40 pl-4 text-sm italic text-muted-foreground",
				children: m.transcript
			}) : null,
			m.mediaUrl && m.mediaMime?.startsWith("audio/") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("audio", {
				className: "mt-6 w-full",
				controls: true,
				src: m.mediaUrl
			}) : null,
			m.mediaUrl && m.mediaMime?.startsWith("image/") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: m.mediaUrl,
				alt: "",
				className: "mt-6 w-full rounded-xl object-cover"
			}) : null,
			m.mediaUrl && m.mediaMime?.startsWith("video/") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
				className: "mt-6 w-full rounded-xl",
				controls: true,
				src: m.mediaUrl
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-6",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TagEditor, {
					tags: m.tags,
					onChange: (tags) => save.mutate({ data: {
						id: m.id,
						tags
					} }),
					onSuggest: () => suggest.mutate({ data: {
						memoryId: m.id,
						existing: m.tags
					} }),
					suggesting: suggest.isPending
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-8",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
					children: "Emotion"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 flex flex-wrap gap-1",
					children: EMOTIONS.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => save.mutate({ data: {
							id: m.id,
							emotion: e
						} }),
						className: `rounded-full px-2.5 py-1 text-xs ${m.emotion === e ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`,
						children: e
					}, e))
				})]
			}),
			m.concepts.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-8",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
					children: "Connected concepts"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 flex flex-wrap gap-1.5",
					children: m.concepts.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: c.name }, c.id))
				})]
			}) : null,
			m.related.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-8",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
					children: "Related memories"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-2 space-y-2",
					children: m.related.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/memory/$id",
						params: { id: r.id },
						className: "text-sm text-primary hover:underline",
						children: r.title
					}) }, r.id))
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-10",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					onClick: () => remove.mutate(),
					children: "Remove this memory"
				})
			})
		] })]
	}) });
}
//#endregion
export { MemoryRoute as component };
