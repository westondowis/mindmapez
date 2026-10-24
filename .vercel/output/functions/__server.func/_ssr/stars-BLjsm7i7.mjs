import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { n as cn } from "./utils-KYK7ILYy.mjs";
import { l as Star } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/stars-BLjsm7i7.js
var import_jsx_runtime = require_jsx_runtime();
function Badge({ className, tone = "default", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide", tone === "default" && "bg-primary/15 text-primary", tone === "gold" && "bg-gold/15 text-gold", tone === "learning" && "bg-learning/15 text-learning", tone === "success" && "bg-success/15 text-success", tone === "problem" && "bg-problem/15 text-problem", tone === "idea" && "bg-idea/15 text-idea", tone === "muted" && "bg-muted text-muted-foreground", className),
		...props
	});
}
var KIND_TONE = {
	breakthrough: "gold",
	learning: "learning",
	success: "success",
	problem: "problem",
	idea: "idea",
	archived: "muted"
};
var KIND_COLOR = {
	breakthrough: "var(--color-gold)",
	learning: "var(--color-learning)",
	success: "var(--color-success)",
	problem: "var(--color-problem)",
	idea: "var(--color-idea)",
	archived: "var(--color-archived)"
};
var KIND_LABEL = {
	breakthrough: "Breakthrough",
	learning: "Learning",
	success: "Success",
	problem: "Problem",
	idea: "Idea",
	archived: "Archived"
};
function Stars({ value, onChange, size = "sm" }) {
	const cls = size === "md" ? "size-5" : "size-3.5";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "inline-flex items-center gap-0.5",
		children: [
			1,
			2,
			3,
			4,
			5
		].map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			disabled: !onChange,
			onClick: () => onChange?.(n),
			className: cn("text-gold", !onChange && "cursor-default"),
			"aria-label": `${n} star${n === 1 ? "" : "s"}`,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Star, {
				className: cls,
				fill: n <= value ? "currentColor" : "none"
			})
		}, n))
	});
}
//#endregion
export { Stars as a, KIND_TONE as i, KIND_COLOR as n, KIND_LABEL as r, Badge as t };
