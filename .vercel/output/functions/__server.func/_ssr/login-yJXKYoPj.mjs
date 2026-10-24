import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { b as Navigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { r as signIn, t as authClient } from "./client-B40BzJxt.mjs";
import { t as GROK_PROVIDERS } from "./server-DJe0bw02.mjs";
import { n as useAuthGate } from "./require-auth-C-MSc5Vn.mjs";
import { t as Button } from "./button-DpEjrIC3.mjs";
import { t as Input } from "./input-RcJ0F5Jz.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/login-yJXKYoPj.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Live-preview iframes block the session cookie, so Better Auth also returns
* the session on `set-auth-token`. Store it where `@/lib/auth/client` already
* reads the popup bearer from — that is what keeps you signed in after email.
*/
var PREVIEW_BEARER_KEY = "grok-auth.bearer-token";
function persistPreviewBearer(response) {
	const token = response.headers.get("set-auth-token");
	if (!token) return;
	try {
		window.sessionStorage.setItem(PREVIEW_BEARER_KEY, token);
	} catch {}
}
function Login() {
	const { user, waiting } = useAuthGate();
	const [email, setEmail] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [name, setName] = (0, import_react.useState)("");
	const [mode, setMode] = (0, import_react.useState)("in");
	const [error, setError] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(null);
	if (!waiting && user) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigate, { to: "/" });
	async function onEmail(e) {
		e.preventDefault();
		setError(null);
		setBusy("email");
		try {
			const fetchOptions = { onSuccess(ctx) {
				persistPreviewBearer(ctx.response);
			} };
			if (mode === "up") {
				const { error: err } = await authClient.signUp.email({
					email,
					password,
					name: name || email.split("@")[0],
					fetchOptions
				});
				if (err) throw new Error(err.message ?? "Could not create account");
			} else {
				const { error: err } = await authClient.signIn.email({
					email,
					password,
					fetchOptions
				});
				if (err) throw new Error(err.message ?? "Could not sign in");
			}
			await authClient.getSession();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Sign-in failed");
		} finally {
			setBusy(null);
		}
	}
	async function onProvider(providerId) {
		setError(null);
		setBusy("oauth");
		try {
			await signIn(providerId, { callbackURL: "/" });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Sign-in failed");
		} finally {
			setBusy(null);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mesh-field relative grid min-h-dvh place-items-center px-4 py-10",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dot-grid pointer-events-none absolute inset-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative w-full max-w-sm",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-8 flex flex-col items-center text-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "relative mb-4 flex size-16 items-center justify-center",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-0 rounded-full bg-highlight/30 animate-pulse-ring" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "relative size-5 rounded-full bg-highlight shadow-[0_0_24px_var(--color-highlight)]" })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] font-medium uppercase tracking-[0.22em] text-primary",
						children: "MindMesh"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-2 font-display text-4xl font-medium tracking-tight",
						children: "Your second brain, alive"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-sm text-muted-foreground",
						children: "Capture a thought once. Watch it find every other thought it belongs to."
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-2xl border border-border bg-card/80 p-5 shadow-soft backdrop-blur-md",
				children: waiting ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-24 animate-pulse rounded-lg bg-muted" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-2",
					children: [
						GROK_PROVIDERS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							className: "w-full",
							disabled: busy !== null,
							onClick: () => void onProvider(p.providerId),
							children: busy === "oauth" ? "Connecting…" : `Continue with ${p.label}`
						}, p.providerId)),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "my-4 flex items-center gap-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-px flex-1 bg-border" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
									children: "or email"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-px flex-1 bg-border" })
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
							onSubmit: onEmail,
							className: "space-y-2",
							children: [
								mode === "up" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									placeholder: "Name",
									value: name,
									onChange: (e) => setName(e.target.value),
									autoComplete: "name"
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									placeholder: "Email",
									type: "email",
									required: true,
									value: email,
									onChange: (e) => setEmail(e.target.value),
									autoComplete: "email"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									placeholder: "Password",
									type: "password",
									required: true,
									minLength: 8,
									value: password,
									onChange: (e) => setPassword(e.target.value),
									autoComplete: mode === "up" ? "new-password" : "current-password"
								}),
								error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-problem",
									children: error
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "submit",
									className: "w-full",
									disabled: busy !== null,
									children: busy === "email" ? "Working…" : mode === "up" ? "Create account" : "Sign in"
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "w-full pt-2 text-center text-xs text-muted-foreground hover:text-foreground",
							onClick: () => {
								setMode(mode === "up" ? "in" : "up");
								setError(null);
							},
							children: mode === "up" ? "Already have an account? Sign in" : "Need an account? Create one"
						})
					]
				})
			})]
		})]
	});
}
//#endregion
export { Login as component };
