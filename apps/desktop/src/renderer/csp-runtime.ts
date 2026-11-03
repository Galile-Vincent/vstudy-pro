// Zod 4's vocabulary parser must not probe JIT compilation under Electron's strict CSP.
const scope = globalThis as typeof globalThis & {__zod_globalConfig?:{jitless?:boolean}};
scope.__zod_globalConfig ??= {};
scope.__zod_globalConfig.jitless = true;
export {};
