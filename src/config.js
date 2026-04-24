// ===============================
// 🧭 ROBINHOOD CONFIG
// ===============================

import { logInfo } from "./logger.js";

export const CONFIG = {
  baseUrl: "https://api.robinhood.com/",
  nummusBaseUrl: "https://nummus.robinhood.com/",
  userEndpoint: "/user",
  inboxEndpoint: "/inbox/threads/",
  extraEndpoint: "/live_frontend_log_events",
  legendUrl: "https://robinhood.com/account/investing",
  tokenHeader: "authorization",
  timezone: "America/Los_Angeles",
  normalAccountNumber: "860527670",
  rothAccountNumber: "667987341",
  settings: {
    holdings: {
      stocks: true,
      crypto: true
    },
    transactions: {
      stocks: true,
      options: true
    }
  }
};


logInfo("Loaded config", CONFIG);
