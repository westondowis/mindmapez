//#region node_modules/.nitro/vite/services/ssr/assets/node-colors-CZ-tbA2V.js
var NODE_COLORS = [
	{
		id: "gold",
		label: "Gold",
		css: "var(--color-highlight)"
	},
	{
		id: "cyan",
		label: "Cyan",
		css: "var(--color-primary)"
	},
	{
		id: "teal",
		label: "Teal",
		css: "var(--color-secondary)"
	},
	{
		id: "sky",
		label: "Sky",
		css: "var(--color-learning)"
	},
	{
		id: "green",
		label: "Green",
		css: "var(--color-success)"
	},
	{
		id: "rose",
		label: "Rose",
		css: "var(--color-problem)"
	},
	{
		id: "violet",
		label: "Violet",
		css: "var(--color-idea)"
	},
	{
		id: "slate",
		label: "Slate",
		css: "var(--color-archived)"
	}
];
function nodeColorCss(id) {
	return NODE_COLORS.find((c) => c.id === id)?.css ?? "var(--color-primary)";
}
//#endregion
export { nodeColorCss as n, NODE_COLORS as t };
