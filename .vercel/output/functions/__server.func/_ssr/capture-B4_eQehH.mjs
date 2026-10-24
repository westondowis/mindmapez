import { x as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { r as Route$8 } from "./router-JzWW0JG9.mjs";
import { t as AppShell } from "./createSsrRpc-B8lW_4O7.mjs";
import { t as PageHeader } from "./page-header-6fLVxyeQ.mjs";
import { t as RequireAuth } from "./require-auth-C-MSc5Vn.mjs";
import { t as CapturePanel } from "./capture-panel-D_8zTHYg.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/capture-B4_eQehH.js
var import_jsx_runtime = require_jsx_runtime();
function CaptureRoute() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireAuth, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CapturePage, {}) });
}
function CapturePage() {
	const navigate = useNavigate();
	const search = Route$8.useSearch();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-2xl",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			kicker: "Capture",
			title: "Don't lose this thought",
			description: "Import from Files, drop something from another app, or paste a long note. Voice, photos, links, and documents all weave into the mesh."
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CapturePanel, {
			seed: {
				title: search.title,
				body: search.text,
				sourceUrl: search.url
			},
			onCreated: (id) => navigate({
				to: "/memory/$id",
				params: { id }
			})
		})]
	}) });
}
//#endregion
export { CaptureRoute as component };
