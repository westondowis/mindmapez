import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { a as require_jsx_runtime, n as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { i as MEMORY_TYPES, n as EMOTIONS } from "./types-DAtvk6Qj.mjs";
import { t as AppShell } from "./createSsrRpc-B8lW_4O7.mjs";
import { t as PageHeader } from "./page-header-6fLVxyeQ.mjs";
import { t as RequireAuth } from "./require-auth-C-MSc5Vn.mjs";
import { a as listMemories } from "./memories-DLH5CEI3.mjs";
import { t as MemoryCard } from "./memory-card-CTSK-bS0.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/timeline-C6-Vqznd.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function TimelineRoute() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireAuth, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimelinePage, {}) });
}
function TimelinePage() {
	const q = useQuery({
		queryKey: ["memories"],
		queryFn: () => listMemories()
	});
	const [type, setType] = (0, import_react.useState)("all");
	const [emotion, setEmotion] = (0, import_react.useState)("all");
	const [minStars, setMinStars] = (0, import_react.useState)(1);
	const items = (0, import_react.useMemo)(() => {
		return (q.data ?? []).filter((m) => {
			if (type !== "all" && m.memoryType !== type) return false;
			if (emotion !== "all" && m.emotion !== emotion) return false;
			if (m.importance < minStars) return false;
			return true;
		});
	}, [
		q.data,
		type,
		emotion,
		minStars
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-3xl",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
				kicker: "Chronology",
				title: "Replay your life",
				description: "Every capture, in the order it happened. Filter by how it felt, how it arrived, and how much it mattered."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-6 flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: "h-10 rounded-md border border-input bg-card px-3 text-sm",
						value: type,
						onChange: (e) => setType(e.target.value),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "all",
							children: "All types"
						}), MEMORY_TYPES.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: t,
							children: t
						}, t))]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: "h-10 rounded-md border border-input bg-card px-3 text-sm",
						value: emotion,
						onChange: (e) => setEmotion(e.target.value),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "all",
							children: "All emotions"
						}), EMOTIONS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: t,
							children: t
						}, t))]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
						className: "h-10 rounded-md border border-input bg-card px-3 text-sm",
						value: minStars,
						onChange: (e) => setMinStars(Number(e.target.value)),
						children: [
							1,
							2,
							3,
							4,
							5
						].map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
							value: n,
							children: [n, "+ stars"]
						}, n))
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "relative space-y-4 border-l border-border pl-6",
				children: q.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { className: "h-28 animate-pulse rounded-xl bg-muted" }) : items.length ? items.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "relative",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute -left-[29px] top-6 size-2.5 rounded-full bg-primary" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemoryCard, { memory: m })]
				}, m.id)) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "text-sm text-muted-foreground",
					children: "Nothing matches those filters."
				})
			})
		]
	}) });
}
//#endregion
export { TimelineRoute as component };
