import { cpSync, existsSync, rmSync } from "node:fs";

const src = "node_modules/cesium/Build/Cesium";
const dst = "public/cesium";

if (!existsSync(src)) {
  console.error(`Cesium build not found at ${src} — is cesium installed?`);
  process.exit(1);
}
if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });
console.log(`copied ${src} → ${dst}`);
