// ===============================
// 🧭 AUTH TOKEN RESOLUTION
// ===============================

import { logInfo, logError, logSuccess } from "../core/logger.js";

/**
 * Temporary hardcoded dynamic token fragments
 * These will later be injected from content.js
 */
export async function getAuthToken() {
  logInfo("Resolving authorization token from sessionStorage");

  const token = sessionStorage.getItem("rh_token");

  if (!token) {
    logError("No authorization token found in sessionStorage");
    throw new Error("Missing authorization token");
  }

  logSuccess("Authorization token retrieved successfully");
  return `Bearer ${token}`;
}

