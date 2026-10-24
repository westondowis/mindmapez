import { r as createServerFn } from "./ssr.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { r as createSsrRpc } from "./createSsrRpc-B8lW_4O7.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/persist-Cbg-Rdx4.js
var saveAccountDraft = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(createSsrRpc("d39aefc7c913812a403e1f6f0e4c19c72b4e77dff3ec3149e77bda57c3c1b6d0"));
var getAccountDraft = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(createSsrRpc("2dac4c6affefb0a30820cb9407eb8f310bbca94d9d36dbb24b15417419be0dcf"));
var clearAccountDraft = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(createSsrRpc("4f382e6b44e27ecccb552986d93c512ce59b54673f163fad438870ea995a5f43"));
//#endregion
export { getAccountDraft as n, saveAccountDraft as r, clearAccountDraft as t };
