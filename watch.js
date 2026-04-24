const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const ASSETS = ['popup.html', 'popup.css'];

// Ensure dist exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

/**
 * 🚀 START ESBUILD WATCHER
 */
function startEsbuild() {
  console.log('🚀 Starting esbuild in watch mode...');

  const esbuild = spawn('npx', [
    'esbuild',
    'src/content.js',
    'src/interceptor.js',
    '--bundle',
    '--outdir=dist',
    '--format=iife',
    '--target=chrome109',
    '--sourcemap',
    '--log-level=info',
    '--watch'
  ], { stdio: 'inherit', shell: true });

  esbuild.on('close', (code) => {
    console.log(`❌ esbuild process exited with code ${code}`);
    process.exit(code);
  });
}

/**
 * 📂 COPY ASSETS
 */
function copyAsset(filename) {
  const srcPath = path.join(SRC_DIR, filename);
  const distPath = path.join(DIST_DIR, filename);

  try {
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, distPath);
      console.log(`✅ Copied ${filename} to dist/`);
    }
  } catch (err) {
    console.error(`❌ Error copying ${filename}:`, err.message);
  }
}

/**
 * 🧭 WATCH ASSETS
 */
function watchAssets() {
  console.log('📂 Watching UI assets for changes...');
  
  // Initial copy
  ASSETS.forEach(copyAsset);

  // Watch for changes
  fs.watch(SRC_DIR, (eventType, filename) => {
    if (filename && ASSETS.includes(filename)) {
      console.log(`🔄 ${filename} changed, re-copying...`);
      copyAsset(filename);
    }
  });
}

// Kick off the processes
startEsbuild();
watchAssets();
