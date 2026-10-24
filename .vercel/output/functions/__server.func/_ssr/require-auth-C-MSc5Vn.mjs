import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { b as Navigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { a as useCurrentUserState } from "./router-JzWW0JG9.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/require-auth-C-MSc5Vn.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Auth state components — plain wrappers around `useCurrentUserState()`.
*
* With auth on, visitors are signed out until they authenticate — in the sandbox
* live preview too, which does real sign-in. The shared dev user appears only
* when auth is disabled (`VITE_AUTH_ENABLED=false`, the shipped default).
* While the session is still resolving, gates that care about signed-out state
* render nothing so there's no signed-out flash on hard reload.
*/
/** Where `RedirectToSignIn` sends signed-out visitors. Create this route. */
var SIGN_IN_PATH = "/login";
/**
* Client-side redirect to the sign-in route (TanStack `<Navigate>` — NOT a full
* `window.location` reload). A hard navigation re-bootstraps the SPA and re-runs
* session loading, which feels like a second "Loading…" on /login.
*
* Guard routes by waiting out `isPending` first (see `use-current-user`), then
* render this.
*/
function RedirectToSignIn({ to = SIGN_IN_PATH }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigate, { to });
}
/** Session fetch can stall behind the preview gate. Don't block the UI forever. */
var SESSION_WAIT_MS = 6e3;
function useAuthGate() {
	const { user, isPending } = useCurrentUserState();
	const [timedOut, setTimedOut] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		if (!isPending) {
			setTimedOut(false);
			return;
		}
		const t = window.setTimeout(() => setTimedOut(true), SESSION_WAIT_MS);
		return () => window.clearTimeout(t);
	}, [isPending]);
	return {
		user,
		isPending,
		waiting: isPending && !timedOut
	};
}
function RequireAuth({ children }) {
	const { user, waiting } = useAuthGate();
	if (waiting) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mesh-field grid min-h-dvh place-items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col items-center gap-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "relative flex size-16 items-center justify-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-0 rounded-full bg-highlight/30 animate-pulse-ring" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "relative size-5 rounded-full bg-highlight" })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-display text-2xl tracking-tight",
					children: "MindMesh AI"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Opening your mesh…"
				})
			]
		})
	});
	if (!user) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RedirectToSignIn, {});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
//#endregion
export { useAuthGate as n, RequireAuth as t };
