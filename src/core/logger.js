// ===============================
// 🧭 SHARED LOGGER UTILITIES
// ===============================

export function logSuccess(msg, meta) {
  console.log("✅ ", msg, meta || "");
}

export function logInfo(msg, meta) {
  console.log("ℹ️ ", msg, meta || "");
}

export function logError(msg, meta) {
  console.log(`%c❌ ${msg}`, "color: #ff0000; font-weight: bold; font-size: 14px; border: 1px solid #ff0000; padding: 2px;", meta || "");
}

export function logParty(msg, meta) {
  console.log("🎉 ", msg, meta || "");
}

export function logCustom(msg, meta) {
  console.log(msg, meta || "");
}
