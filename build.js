// ===============================
// 🧭 ESBUILD CONTENT SCRIPT BUNDLE
// ===============================

const { execSync } = require("child_process");

try {
  console.log("🚀 Starting build via npx esbuild...");

  execSync(
    'npx esbuild src/content.js src/interceptor.js ' +
    '--bundle ' +
    '--outdir=dist ' +
    '--format=iife ' +
    '--target=chrome109 ' +
    '--sourcemap ' +
    '--log-level=info',
    { stdio: "inherit" }
  );

  const fs = require('fs');
  const path = require('path');
  
  // Ensure dist exists (though esbuild creates it)
  if (!fs.existsSync('dist')) fs.mkdirSync('dist');
  
  // Copy UI assets
  console.log("📂 Copying UI assets to dist...");
  fs.copyFileSync('src/popup.html', 'dist/popup.html');
  fs.copyFileSync('src/popup.css', 'dist/popup.css');

  console.log("✅ Build completed successfully!");
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
}


