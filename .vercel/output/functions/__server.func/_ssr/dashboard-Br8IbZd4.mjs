import { r as createServerFn } from "./ssr.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { r as createSsrRpc } from "./createSsrRpc-B8lW_4O7.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/dashboard-Br8IbZd4.js
var getDashboard = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(createSsrRpc("9db85427a1c24a4946624e0d3df9e6cbf4f6db0a0617124b39eec33b6ee26c12"));
var setPlan = createServerFn({ method: "POST" }).validator((plan) => plan).middleware([authMiddleware]).handler(createSsrRpc("1e3549b578a09170b0fc35dbdae0c2b53c3114a6da71a19c1fa3cc65a6f876e6"));
var resetSampleMind = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(createSsrRpc("e5d55205c5a98d468670611db23ea4ad9983b199e1c640dfc451ec33420703a3"));
//#endregion
export { resetSampleMind as n, setPlan as r, getDashboard as t };
