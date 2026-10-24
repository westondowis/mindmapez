import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { n as cn } from "./utils-KYK7ILYy.mjs";
import { d as Sparkles, t as X } from "../_libs/lucide-react.mjs";
import { n as normalizeTags } from "./tags-7fTG6o7M.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tag-editor-BCpF9bTN.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function TagEditor({ tags, onChange, onSuggest, suggesting, hint = "AI tags this node. Add or remove anything you want." }) {
	const [draft, setDraft] = (0, import_react.useState)("");
	function add(raw) {
		onChange(normalizeTags([...tags, raw]));
		setDraft("");
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
				children: "Tags"
			}), onSuggest ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: onSuggest,
				disabled: suggesting,
				className: "inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { className: "size-3" }), suggesting ? "Generating…" : "Regenerate with AI"]
			}) : null]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-2 flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5",
			children: [tags.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "inline-flex items-center gap-1 rounded-full bg-primary/15 py-1 pl-2.5 pr-1 text-xs text-primary",
				children: [t, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": `Remove ${t}`,
					onClick: () => onChange(tags.filter((x) => x !== t)),
					className: "flex size-5 items-center justify-center rounded-full hover:bg-primary/20",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-3" })
				})]
			}, t)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				value: draft,
				onChange: (e) => setDraft(e.target.value),
				onKeyDown: (e) => {
					if (e.key === "Enter" || e.key === ",") {
						e.preventDefault();
						if (draft.trim()) add(draft);
					}
					if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
				},
				onBlur: () => {
					if (draft.trim()) add(draft);
				},
				placeholder: tags.length ? "Add a tag" : "Add a tag or let AI name them",
				className: cn("h-8 min-w-32 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground")
			})]
		}),
		hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1.5 text-xs text-muted-foreground",
			children: hint
		}) : null
	] });
}
//#endregion
export { TagEditor as t };
