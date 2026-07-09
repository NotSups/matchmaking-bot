// Entry point for Node-based hosting panels (Pterodactyl / wispbyte).
// The panel runs `node /home/container/${JS_FILE}`; we use this shim to boot
// the TypeScript bot through tsx (no separate build step required).
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const entry = join(__dirname, "packages", "bot", "src", "index.ts");
const res = spawnSync(process.execPath, ["--import", "tsx", entry], {
  stdio: "inherit",
  cwd: __dirname,
});

process.exit(res.status ?? 1);
