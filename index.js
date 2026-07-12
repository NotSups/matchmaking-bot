// Entry point for Node-based hosting panels (Pterodactyl / wispbyte).
const { spawnSync, spawn } = require("node:child_process");
const { join } = require("node:path");
const fs = require("node:fs");

const tsxBin = join(__dirname, "node_modules", ".bin", "tsx");

// Auto-install dependencies if node_modules is missing
if (!fs.existsSync(tsxBin)) {
  console.log("[matchmaking] Installing dependencies...");
  const install = spawnSync("npm", ["install"], {
    stdio: "inherit",
    cwd: __dirname,
  });
  if (install.status !== 0) {
    console.error("[matchmaking] npm install failed!");
    process.exit(1);
  }
  console.log("[matchmaking] Dependencies installed!");
}

const entry = join(__dirname, "packages", "bot", "src", "index.ts");

const res = spawnSync(tsxBin, [entry], {
  stdio: "inherit",
  cwd: __dirname,
});

process.exit(res.status ?? 1);
