import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync(new URL("./install-page.html", import.meta.url), "utf8");
writeFileSync(new URL("../server/install-page-template.ts", import.meta.url), "// GENERATED from scripts/install-page.html (kept inline so the server bundle never depends on a filesystem ?raw import).\n// Regenerate: node scripts/sync-install-page.mjs\nexport default " + JSON.stringify(html) + ";\n");
