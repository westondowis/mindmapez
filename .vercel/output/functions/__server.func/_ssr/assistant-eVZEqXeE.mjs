import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { a as require_jsx_runtime, i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/react+tanstack__react-query.mjs";
import { r as createServerFn } from "./ssr.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { r as createSsrRpc, t as AppShell } from "./createSsrRpc-B8lW_4O7.mjs";
import { t as PageHeader } from "./page-header-6fLVxyeQ.mjs";
import { t as RequireAuth } from "./require-auth-C-MSc5Vn.mjs";
import { t as Button } from "./button-DpEjrIC3.mjs";
import { n as Textarea } from "./input-RcJ0F5Jz.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/assistant-eVZEqXeE.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var listAssistant = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(createSsrRpc("652676d1a3a74e079d144fe1a538ad00d69cf2c0c8b0850aabc3ab5a6994ca91"));
var askAssistant = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(createSsrRpc("be6550846e7bbe303697f2b97eca6a1fb7004fbc20c0e31d574840294f8c96d8"));
var STARTERS = [
	"What are my biggest real estate lessons?",
	"What patterns exist in my golf memories?",
	"What caused my best sales results?",
	"What ideas do I repeatedly return to?",
	"What lessons have I forgotten recently?",
	"What themes are growing strongest in my life?"
];
function AssistantRoute() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireAuth, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AssistantPage, {}) });
}
function AssistantPage() {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: ["assistant"],
		queryFn: () => listAssistant()
	});
	const [prompt, setPrompt] = (0, import_react.useState)("");
	const ask = useMutation({
		mutationFn: askAssistant,
		onSuccess: () => {
			setPrompt("");
			qc.invalidateQueries({ queryKey: ["assistant"] });
		}
	});
	function send(text) {
		const t = text.trim();
		if (!t || ask.isPending) return;
		ask.mutate({ data: { prompt: t } });
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto flex max-w-2xl flex-col",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
			kicker: "Companion",
			title: "Ask the mesh",
			description: "A private assistant that only knows your memories — the lessons, the loops, and the things you keep rediscovering."
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex min-h-[48vh] flex-col rounded-2xl border border-border bg-card/70",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex-1 space-y-4 overflow-y-auto px-4 py-4",
				children: [!q.data?.length && !ask.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid gap-2",
					children: STARTERS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => send(s),
						className: "rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm text-muted-foreground hover:text-foreground",
						children: s
					}, s))
				}) : q.data?.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: `max-w-[92%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "ml-auto bg-secondary text-secondary-foreground" : "bg-background text-foreground"}`,
					children: m.content
				}, m.id)), ask.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-xl bg-background px-3 py-2.5 text-sm text-muted-foreground",
					children: "Listening to the mesh…"
				}) : null]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "border-t border-border p-3",
				onSubmit: (e) => {
					e.preventDefault();
					send(prompt);
				},
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
					className: "min-h-20",
					value: prompt,
					onChange: (e) => setPrompt(e.target.value),
					placeholder: "Ask anything about your memories…"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "submit",
					className: "mt-2 w-full",
					disabled: ask.isPending,
					children: "Send"
				})]
			})]
		})]
	}) });
}
//#endregion
export { AssistantRoute as component };
