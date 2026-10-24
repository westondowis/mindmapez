import { y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { i as formatRelative } from "./utils-KYK7ILYy.mjs";
import { C as Link2, E as Image, M as FileText, a as Type, b as Mic, r as Video } from "../_libs/lucide-react.mjs";
import { a as Stars, i as KIND_TONE, r as KIND_LABEL, t as Badge } from "./stars-BLjsm7i7.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/memory-card-CTSK-bS0.js
var import_jsx_runtime = require_jsx_runtime();
var TYPE_ICON = {
	voice: Mic,
	text: Type,
	photo: Image,
	video: Video,
	document: FileText,
	thought: Type,
	reflection: Type,
	link: Link2
};
function MemoryCard({ memory }) {
	const Icon = TYPE_ICON[memory.memoryType] ?? Type;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
		to: "/memory/$id",
		params: { id: memory.id },
		className: "block rounded-xl border border-border bg-card/80 p-4 transition-colors hover:border-primary/40 hover:bg-card",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2 text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs",
						children: formatRelative(memory.createdAt)
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
					tone: KIND_TONE[memory.nodeKind],
					children: KIND_LABEL[memory.nodeKind]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "mt-2 font-display text-base font-medium tracking-tight text-foreground",
				children: memory.title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 line-clamp-2 text-sm text-muted-foreground",
				children: memory.aiSummary ?? memory.body
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 flex flex-wrap gap-1.5",
				children: memory.tags.slice(0, 4).map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
					tone: "muted",
					children: t
				}, t))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stars, { value: memory.importance }), memory.emotion ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs text-muted-foreground",
					children: memory.emotion
				}) : null]
			})
		]
	});
}
//#endregion
export { MemoryCard as t };
