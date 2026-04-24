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

export async function fetchAccounts() {
  logInfo("Fetching all accounts");
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}accounts/?default_to_all_accounts=true&include_managed=true&include_multiple_individual=true&is_default=false`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token),
    credentials: "include"
  });

  if (!res.ok) {
    logError("Failed to fetch accounts", res.status);
    throw new Error("Accounts API failed");
  }

  const data = await res.json();
  logSuccess("Fetched accounts", { count: data.results?.length, data: data.results });
  return data.results || [];
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
  logSuccess("Fetched stock positions", { count: data.results?.length, data: data.results });
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
    (data.results ?? []).map(q => [
      q.instrument_id, 
      q.last_extended_hours_trade_price || q.last_trade_price
    ])
  );
  logSuccess("Market quotes fetched", { count: priceMap.size, data: Array.from(priceMap.entries()) });
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
  logSuccess("Fetched crypto positions", { count: data.results?.length, data: data.results });
  return data;
}

export async function fetchInstruments(instrumentIds) {
  if (!instrumentIds.length) return new Map();

  logInfo("Fetching instrument details", { count: instrumentIds.length });
  const token = await getAuthToken();
  const idsParam = instrumentIds.join(",");
  const url = `${CONFIG.baseUrl}instruments/?ids=${encodeURIComponent(idsParam)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token),
    credentials: "include"
  });

  if (!res.ok) {
    logError("Failed to fetch instruments", res.status);
    throw new Error("Instruments API failed");
  }

  const data = await res.json();
  const symbolMap = new Map(
    (data.results ?? [])
      .filter(i => i !== null)
      .map(i => [i.url, i.symbol])
  );
  logSuccess("Instruments fetched", { count: symbolMap.size, data: Array.from(symbolMap.entries()) });
  return symbolMap;
}

export async function fetchStockOrders(accountNumber, cutoffDate) {
  logInfo("Fetching all stock orders", { accountNumber, cutoffDate });
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}orders/?account_number=${accountNumber}`;
  const results = await fetchAllPages(url, buildHeaders(token), cutoffDate);
  logSuccess("Fetched stock orders", { count: results.length, data: results });
  return results;
}

export async function fetchOptionsOrders(accountNumber, cutoffDate) {
  logInfo("Fetching all options orders", { accountNumber, cutoffDate });
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}options/orders/?account_number=${accountNumber}`;
  const results = await fetchAllPages(url, buildHeaders(token), cutoffDate);
  logSuccess("Fetched options orders", { count: results.length, data: results });
  return results;
}

export async function fetchDividends(accountNumber, cutoffDate) {
  logInfo("Fetching all dividends", { accountNumber, cutoffDate });
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}dividends/?account_number=${accountNumber}`;
  const results = await fetchAllPages(url, buildHeaders(token), cutoffDate);
  logSuccess("Fetched dividends", { count: results.length, data: results });
  return results;
}

export async function fetchTransfers(cutoffDate) {
  logInfo("Fetching all transfers", { cutoffDate });
  const token = await getAuthToken();
  // ACH Transfers endpoint
  const url = `${CONFIG.baseUrl}ach/transfers/`;
  const results = await fetchAllPages(url, buildHeaders(token), cutoffDate);
  logSuccess("Fetched transfers", { count: results.length, data: results });
  return results;
}

export async function fetchLendingPayments(accountNumbers, cutoffDate) {
  logInfo("Fetching stock lending payments", { accountNumbers, cutoffDate });
  const token = await getAuthToken();
  const accs = Array.isArray(accountNumbers) ? accountNumbers.join(",") : accountNumbers;
  const url = `${CONFIG.baseUrl}accounts/stock_loan_payments/?account_numbers=${encodeURIComponent(accs)}`;
  const results = await fetchAllPages(url, buildHeaders(token), cutoffDate);
  logSuccess("Fetched lending payments", { count: results.length, data: results });
  return results;
}

export async function fetchInterest(accountNumbers, cutoffDate) {
  logInfo("Fetching interest (sweeps)", { accountNumbers, cutoffDate });
  const token = await getAuthToken();
  const accs = Array.isArray(accountNumbers) ? accountNumbers.join(",") : accountNumbers;
  const url = `${CONFIG.baseUrl}accounts/sweeps/?account_numbers=${encodeURIComponent(accs)}&default_to_all_accounts=true&include_managed=true`;
  const results = await fetchAllPages(url, buildHeaders(token), cutoffDate);
  logSuccess("Fetched interest payments", { count: results.length, data: results });
  return results;
}

export async function fetchRewards() {
  logInfo("Fetching rewards (bonfire)");
  const token = await getAuthToken();
  const url = `https://bonfire.robinhood.com/rewards/reward/stocks/`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token),
    credentials: "include"
  });

  if (!res.ok) {
    logError("Failed to fetch rewards", res.status);
    return [];
  }

  const sections = await res.json();
  const allItems = sections.flatMap(s => s.items || []);
  logSuccess("Fetched rewards", { count: allItems.length, data: allItems });
  return allItems;
}

export async function fetchGoldBoosts() {
  logInfo("Fetching Gold deposit boosts");
  const token = await getAuthToken();
  const url = `https://bonfire.robinhood.com/gold/deposit_boost_paid_payouts/`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token),
    credentials: "include"
  });

  if (!res.ok) {
    logError("Failed to fetch gold boosts", res.status);
    return [];
  }

  const data = await res.json();
  logSuccess("Fetched gold boosts", { count: data.results?.length, data: data.results });
  return data.results || [];
}

export async function fetchUnifiedTransfers(cutoffDate) {
  logInfo("Fetching unified transfers (paymenthub)");
  const token = await getAuthToken();
  const url = `https://bonfire.robinhood.com/paymenthub/unified_transfers/`;
  
  const results = await fetchAllPages(url, buildHeaders(token), cutoffDate);
  logSuccess("Fetched unified transfers", { count: results.length, data: results });
  return results;
}
