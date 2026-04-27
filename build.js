// ===============================
// 🧭 ESBUILD CONTENT SCRIPT BUNDLE
// ===============================

const { execSync } = require("child_process");
const fs = require('fs');
const path = require('path');

try {
  console.log("🚀 Starting build via npx esbuild...");

  // Build scripts from src/scripts
  execSync(
    'npx esbuild src/scripts/content.js src/scripts/interceptor.js src/scripts/background.js ' +
    '--bundle ' +
    '--outdir=dist ' +
    '--format=iife ' +
    '--target=chrome109 ' +
    '--sourcemap ' +
    '--log-level=info',
    { stdio: "inherit" }
  );

  // Ensure dist exists
  if (!fs.existsSync('dist')) fs.mkdirSync('dist');
  
  // Copy UI assets and configuration
  console.log("📂 Copying assets to dist...");
  fs.copyFileSync('src/ui/popup.html', 'dist/popup.html');
  fs.copyFileSync('src/ui/popup.css', 'dist/popup.css');
  fs.copyFileSync('src/assets/icon.png', 'dist/icon.png');
  fs.copyFileSync('manifest.json', 'dist/manifest.json');

  console.log("✅ Build completed successfully!");
  console.log("💡 Tip: Load the 'dist' folder into Chrome as an unpacked extension.");
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
}
