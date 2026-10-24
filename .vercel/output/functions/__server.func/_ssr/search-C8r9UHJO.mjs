import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { a as require_jsx_runtime, t as useMutation } from "../_libs/react+tanstack__react-query.mjs";
import { r as createServerFn } from "./ssr.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { r as createSsrRpc, t as AppShell } from "./createSsrRpc-B8lW_4O7.mjs";
import { t as PageHeader } from "./page-header-6fLVxyeQ.mjs";
import { t as RequireAuth } from "./require-auth-C-MSc5Vn.mjs";
import { t as Button } from "./button-DpEjrIC3.mjs";
import { t as Input } from "./input-RcJ0F5Jz.mjs";
import { t as MemoryCard } from "./memory-card-CTSK-bS0.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/search-C8r9UHJO.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var searchMemories = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(createSsrRpc("c4d0eff44955d9b5a39b049d939c9b450a625e8156a554b3f0f2d9cbc7aa3394"));
var EXAMPLES = [
	"What golf thought helped me stop slicing?",
	"What were my best seller financing lessons?",
	"What have I learned about negotiation?",
	"Show me all memories connected to confidence."
];
function SearchRoute() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireAuth, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchPage, {}) });
}
function SearchPage() {
	const [query, setQuery] = (0, import_react.useState)("");
	const [semantic, setSemantic] = (0, import_react.useState)(true);
	const search = useMutation({ mutationFn: searchMemories });
	function run(q) {
		setQuery(q);
		search.mutate({ data: {
			query: q,
			semantic
		} });
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-3xl",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
				kicker: "Retrieval",
				title: "Ask your mind",
				description: "Search by intent, not just keywords. The mesh understands what you meant."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "flex flex-col gap-2 sm:flex-row",
				onSubmit: (e) => {
					e.preventDefault();
					run(query);
				},
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					value: query,
					onChange: (e) => setQuery(e.target.value),
					placeholder: "What should future-you remember about seller calls?",
					className: "flex-1"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "submit",
					disabled: search.isPending,
					children: search.isPending ? "Searching…" : "Search"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "mt-3 flex items-center gap-2 text-sm text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "checkbox",
					checked: semantic,
					onChange: (e) => setSemantic(e.target.checked)
				}), "Advanced semantic search"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4 flex flex-wrap gap-2",
				children: EXAMPLES.map((ex) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => run(ex),
					className: "rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground",
					children: ex
				}, ex))
			}),
			search.data?.interpretation ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground/90",
				children: search.data.interpretation
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-6 grid gap-3",
				children: search.data?.results.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "No matching memories yet."
				}) : search.data?.results.map((m) => m ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemoryCard, { memory: m }, m.id) : null)
			})
		]
	}) });
}
//#endregion
export { SearchRoute as component };
