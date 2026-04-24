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
  console.error("❌ ", msg, meta || "");
}

export function logParty(msg, meta) {
  console.log("🎉 ", msg, meta || "");
}

export function logCustom(msg, meta) {
  console.log(msg, meta || "");
}
