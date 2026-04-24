// ===============================
// 🧭 ROBINHOOD API CLIENT
// ===============================

import { CONFIG } from "./config.js";
import { getAuthToken } from "./auth.js";
import { logInfo, logError, logSuccess } from "./logger.js";

function buildHeaders(token, extra = {}) {
  return {
    "Accept": "*/*",
    "Authorization": token,
    "x-hyper-ex": "enabled",
    "x-timezone-id": CONFIG.timezone,
    ...extra
  };
}

// Follows Robinhood's paginated `next` URLs, stopping when cutoffDate is passed.
// Results come newest-first from Robinhood, so we stop as soon as created_at < cutoffDate.
async function fetchAllPages(initialUrl, headers, cutoffDate) {
  const results = [];
  let url = initialUrl;

  while (url) {
    const res = await fetch(url, { method: "GET", headers, credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

    const page = await res.json();
    for (const item of page.results ?? []) {
      if (cutoffDate && new Date(item.created_at) < new Date(cutoffDate)) {
        return results;
      }
      results.push(item);
    }
    url = page.next || null;
  }

  return results;
}

export async function fetchStockPositions(accountNumber) {
  logInfo("Fetching stock positions", { accountNumber });
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}positions/?account_number=${accountNumber}&nonzero=true`;

  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token),
    credentials: "include"
  });

  if (!res.ok) {
    logError("Failed to fetch stock positions", res.status);
    throw new Error("Stock Positions API failed");
  }

  const data = await res.json();
  logSuccess("Fetched stock positions", { count: data.results?.length });
  return data;
}

// Returns a Map<instrument_id → last_trade_price>
export async function fetchMarketQuotes(instrumentIds) {
  if (!instrumentIds.length) return new Map();

  logInfo("Fetching market quotes", { count: instrumentIds.length });
  const token = await getAuthToken();
  const idsParam = instrumentIds.join(",");
  const url = `${CONFIG.baseUrl}marketdata/quotes/?ids=${encodeURIComponent(idsParam)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token),
    credentials: "include"
  });

  if (!res.ok) {
    logError("Failed to fetch market quotes", res.status);
    throw new Error("Market Quotes API failed");
  }

  const data = await res.json();
  const priceMap = new Map(
    (data.results ?? []).map(q => [q.instrument_id, q.last_trade_price])
  );
  logSuccess("Market quotes fetched", { count: priceMap.size });
  return priceMap;
}

export async function fetchCryptoPositions() {
  logInfo("Fetching crypto positions");
  const token = await getAuthToken();

  const res = await fetch(`${CONFIG.nummusBaseUrl}holdings/`, {
    method: "GET",
    headers: {
      "Accept": "*/*",
      "Authorization": token,
      "x-timezone-id": CONFIG.timezone
    },
    credentials: "include"
  });

  if (!res.ok) {
    logError("Failed to fetch crypto positions", res.status);
    throw new Error("Crypto Positions API failed");
  }

  const data = await res.json();
  logSuccess("Fetched crypto positions", { count: data.results?.length });
  return data;
}

export async function fetchStockOrders(accountNumber, cutoffDate) {
  logInfo("Fetching all stock orders", { accountNumber, cutoffDate });
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}orders/?account_number=${accountNumber}`;
  const results = await fetchAllPages(url, buildHeaders(token), cutoffDate);
  logSuccess("Fetched stock orders", { count: results.length });
  return results;
}

export async function fetchOptionsOrders(accountNumber, cutoffDate) {
  logInfo("Fetching all options orders", { accountNumber, cutoffDate });
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}options/orders/?account_number=${accountNumber}`;
  const results = await fetchAllPages(url, buildHeaders(token), cutoffDate);
  logSuccess("Fetched options orders", { count: results.length });
  return results;
}
