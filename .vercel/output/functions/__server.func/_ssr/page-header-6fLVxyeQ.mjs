import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/page-header-6fLVxyeQ.js
var import_jsx_runtime = require_jsx_runtime();
function PageHeader({ kicker, title, description, action }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "mb-6 flex flex-wrap items-end justify-between gap-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
			kicker ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-primary",
				children: kicker
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "font-display text-3xl font-medium tracking-tight sm:text-4xl",
				children: title
			}),
			description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-xl text-sm text-muted-foreground",
				children: description
			}) : null
		] }), action]
	});
}
//#endregion
export { PageHeader as t };
