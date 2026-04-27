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

  // Google Sheets Integration
  googleSheets: {
    // All available spreadsheet targets
    accounts: {
      deepika_prod:   { id: "1vhFpjRSkltFRUPZ4PVypXeQHDqV6p6LxWEsvcCi1t-o", label: "Deepika — Production" },
      lokendra_prod:  { id: "1hzciH_CW2OWlMMkC5BZgA2J2SsPjsLcqCxVfSR4Pe9w", label: "Lokendra — Production" },
      lokendra_test:  { id: "1K4-wNGXC8jVsjmfu00_pCsho5puOy1KKhN1Au-r9h8k", label: "Lokendra — Test" }
    },
    // Default (overridden at runtime by sheetsOwner setting)
    spreadsheetId: "1vhFpjRSkltFRUPZ4PVypXeQHDqV6p6LxWEsvcCi1t-o",
    clientId: "23244760300-jfl09g2h4ctqip2tvpjlfh6hf4ck3d5c.apps.googleusercontent.com",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    tabs: {
      deposits: "Amount deposited",
      interest: "Interest",
      rewards: "Rewards"
    }
  },

  settings: {
    individual: {
      holdings:     { stocks: true, crypto: true },
      transactions: { stocks: true, options: true, crypto: false, dividend: true, deposits: true, bonus: true }
    },
    ira: {
      holdings:     { stocks: true, crypto: false },
      transactions: { stocks: true, options: true, crypto: false, dividend: true, deposits: true, bonus: true }
    },
    googleSync: {
      enabled: false,
      sheetsOwner: "deepika_prod"  // key into googleSheets.accounts
    },
    downloadCsv: true
  }
};

logInfo("Loaded config", CONFIG);
