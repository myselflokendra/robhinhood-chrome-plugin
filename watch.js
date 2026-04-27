const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const DIST_DIR = path.join(__dirname, 'dist');
const ASSETS_MAP = [
  { src: 'src/ui/popup.html', dist: 'popup.html' },
  { src: 'src/ui/popup.css', dist: 'popup.css' },
  { src: 'src/assets/icon.png', dist: 'icon.png' },
  { src: 'manifest.json', dist: 'manifest.json' }
];

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
    'src/scripts/content.js',
    'src/scripts/interceptor.js',
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
function copyAsset(asset) {
  const srcPath = path.join(__dirname, asset.src);
  const distPath = path.join(DIST_DIR, asset.dist);

  try {
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, distPath);
      console.log(`✅ Copied ${asset.src} to dist/${asset.dist}`);
    }
  } catch (err) {
    console.error(`❌ Error copying ${asset.src}:`, err.message);
  }
}

/**
 * 🧭 WATCH ASSETS
 */
function watchAssets() {
  console.log('📂 Watching assets for changes...');
  
  // Initial copy
  ASSETS_MAP.forEach(copyAsset);

  // Watch for changes recursively in src and root for manifest
  const watchPaths = [
    path.join(__dirname, 'src/ui'),
    path.join(__dirname, 'src/assets'),
    path.join(__dirname, 'manifest.json')
  ];

  watchPaths.forEach(watchPath => {
    if (!fs.existsSync(watchPath)) return;
    
    fs.watch(watchPath, (eventType, filename) => {
      const asset = ASSETS_MAP.find(a => a.src.includes(filename) || path.basename(a.src) === filename);
      if (asset) {
        console.log(`🔄 ${filename} changed, re-copying...`);
        copyAsset(asset);
      }
    });
  });
}

// Kick off the processes
startEsbuild();
watchAssets();
