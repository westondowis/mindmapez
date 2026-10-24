import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { x as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as require_jsx_runtime, i as useQueryClient, t as useMutation } from "../_libs/react+tanstack__react-query.mjs";
import { o as REFLECTION_PROMPTS } from "./types-DAtvk6Qj.mjs";
import { t as AppShell } from "./createSsrRpc-B8lW_4O7.mjs";
import { t as PageHeader } from "./page-header-6fLVxyeQ.mjs";
import { t as RequireAuth } from "./require-auth-C-MSc5Vn.mjs";
import { t as Button } from "./button-DpEjrIC3.mjs";
import { n as Textarea } from "./input-RcJ0F5Jz.mjs";
import { t as createMemory } from "./memories-DLH5CEI3.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/reflect-yvp_6Q1l.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ReflectRoute() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireAuth, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReflectPage, {}) });
}
function ReflectPage() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const prompt = (0, import_react.useMemo)(() => {
		const day = Math.floor(Date.now() / 864e5);
		return REFLECTION_PROMPTS[day % REFLECTION_PROMPTS.length] ?? REFLECTION_PROMPTS[0];
	}, []);
	const [choice, setChoice] = (0, import_react.useState)(prompt);
	const [body, setBody] = (0, import_react.useState)("");
	const save = useMutation({
		mutationFn: createMemory,
		onSuccess: async (res) => {
			await qc.invalidateQueries({ queryKey: ["graph"] });
			if (res.ok) navigate({
				to: "/memory/$id",
				params: { id: res.memory.id }
			});
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-xl",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
				kicker: "Daily reflection",
				title: "A question for today",
				description: "Your answer becomes a node. Future-you will thank you."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-wrap gap-2",
				children: REFLECTION_PROMPTS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setChoice(p),
					className: `rounded-full px-3 py-1.5 text-xs ${choice === p ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`,
					children: p
				}, p))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-8 font-display text-2xl",
				children: choice
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
				className: "mt-4 min-h-40",
				value: body,
				onChange: (e) => setBody(e.target.value),
				placeholder: "Write it while it is still true."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				className: "mt-4 w-full",
				size: "lg",
				disabled: !body.trim() || save.isPending,
				onClick: () => save.mutate({ data: {
					title: choice,
					body: body.trim(),
					memoryType: "reflection"
				} }),
				children: save.isPending ? "Saving…" : "Save as a memory"
			})
		]
	}) });
}
//#endregion
export { ReflectRoute as component };
