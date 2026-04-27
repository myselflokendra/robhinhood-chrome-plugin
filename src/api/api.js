// ===============================
// 🧭 ROBINHOOD API CLIENT
// ===============================

import { CONFIG } from "../core/config.js";
import { getAuthToken } from "./auth.js";
import { logInfo, logError, logSuccess } from "../core/logger.js";

function buildHeaders(token, extra = {}) {
  return {
    "Accept": "*/*",
    "Authorization": token,
    "x-hyper-ex": "enabled",
    "x-timezone-id": CONFIG.timezone,
    ...extra
  };
}

/**
 * Follows Robinhood's paginated `next` URLs.
 * Stops when the date in `dateField` is older than `cutoffDate`.
 */
async function fetchAllPages(initialUrl, headers, cutoffDate, dateField = 'created_at') {
  const results = [];
  let url = initialUrl;

  while (url) {
    try {
      // Ensure HTTPS to prevent Mixed Content blocked by Chrome extensions
      url = url.replace(/^http:\/\//i, 'https://');
      
      const res = await fetch(url, { method: "GET", headers, credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

      const page = await res.json();
      const items = page.results || page.items || [];
      
      for (const item of items) {
        // Find the best date field if the specified one is missing
        const itemDate = item[dateField] || item.created_at || item.updated_at || item.payable_date || item.updated_at;
        
        if (cutoffDate && itemDate && new Date(itemDate) < new Date(cutoffDate)) {
          logInfo(`Reached cutoff date (${cutoffDate}) in ${dateField}`);
          return results;
        }
        results.push(item);
      }
      url = page.next || null;
    } catch (err) {
      logError(`Failed to fetch page: ${url}`, err);
      break; // Stop paginating, but return what we have so far
    }
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

  if (!res.ok) throw new Error("Accounts API failed");
  const data = await res.json();
  return data.results || [];
}

export async function fetchStockPositions(accountNumber) {
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}positions/?account_number=${accountNumber}&nonzero=true`;
  const res = await fetch(url, { method: "GET", headers: buildHeaders(token), credentials: "include" });
  return res.json();
}

export async function fetchMarketQuotes(instrumentIds) {
  if (!instrumentIds.length) return new Map();
  const token = await getAuthToken();
  const idsParam = instrumentIds.join(",");
  const url = `${CONFIG.baseUrl}marketdata/quotes/?ids=${encodeURIComponent(idsParam)}`;
  const res = await fetch(url, { method: "GET", headers: buildHeaders(token), credentials: "include" });
  const data = await res.json();
  return new Map((data.results ?? []).map(q => [q.instrument_id, q.last_extended_hours_trade_price || q.last_trade_price]));
}

export async function fetchCryptoPositions() {
  const token = await getAuthToken();
  const res = await fetch(`${CONFIG.nummusBaseUrl}holdings/`, {
    method: "GET",
    headers: { "Accept": "*/*", "Authorization": token, "x-timezone-id": CONFIG.timezone },
    credentials: "include"
  });
  return res.json();
}

export async function fetchInstruments(instrumentIds) {
  if (!instrumentIds.length) return new Map();
  const token = await getAuthToken();
  const idsParam = instrumentIds.join(",");
  const url = `${CONFIG.baseUrl}instruments/?ids=${encodeURIComponent(idsParam)}`;
  const res = await fetch(url, { method: "GET", headers: buildHeaders(token), credentials: "include" });
  const data = await res.json();
  return new Map((data.results ?? []).filter(i => i !== null).map(i => [i.url, i.symbol]));
}

export async function fetchStockOrders(accountNumber, cutoffDate) {
  logInfo("Fetching stock orders...", { accountNumber, cutoffDate });
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}orders/?account_number=${accountNumber}`;
  return await fetchAllPages(url, buildHeaders(token), cutoffDate, 'created_at');
}

export async function fetchOptionsOrders(accountNumber, cutoffDate) {
  logInfo("Fetching options orders...", { accountNumber, cutoffDate });
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}options/orders/?account_number=${accountNumber}`;
  return await fetchAllPages(url, buildHeaders(token), cutoffDate, 'updated_at');
}

export async function fetchDividends(accountNumber, cutoffDate) {
  logInfo("Fetching dividends...", { accountNumber, cutoffDate });
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}dividends/?account_number=${accountNumber}`;
  return await fetchAllPages(url, buildHeaders(token), cutoffDate, 'payable_date');
}

export async function fetchTransfers(cutoffDate) {
  const token = await getAuthToken();
  const url = `${CONFIG.baseUrl}ach/transfers/`;
  return await fetchAllPages(url, buildHeaders(token), cutoffDate, 'created_at');
}

export async function fetchLendingPayments(accountNumbers, cutoffDate) {
  const token = await getAuthToken();
  const accs = Array.isArray(accountNumbers) ? accountNumbers.join(",") : accountNumbers;
  const url = `${CONFIG.baseUrl}accounts/stock_loan_payments/?account_numbers=${encodeURIComponent(accs)}`;
  return await fetchAllPages(url, buildHeaders(token), cutoffDate, 'pay_date');
}

export async function fetchInterest(accountNumbers, cutoffDate) {
  const token = await getAuthToken();
  const accs = Array.isArray(accountNumbers) ? accountNumbers.join(",") : accountNumbers;
  const url = `${CONFIG.baseUrl}accounts/sweeps/?account_numbers=${encodeURIComponent(accs)}&default_to_all_accounts=true&include_managed=true`;
  return await fetchAllPages(url, buildHeaders(token), cutoffDate, 'pay_date');
}

export async function fetchRewards() {
  const token = await getAuthToken();
  const url = `https://bonfire.robinhood.com/rewards/reward/stocks/`;
  const res = await fetch(url, { method: "GET", headers: buildHeaders(token), credentials: "include" });
  if (!res.ok) return [];
  const sections = await res.json();
  return sections.flatMap(s => s.items || []);
}

export async function fetchGoldBoosts() {
  const token = await getAuthToken();
  const url = `https://bonfire.robinhood.com/gold/deposit_boost_paid_payouts/`;
  const res = await fetch(url, { method: "GET", headers: buildHeaders(token), credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

export async function fetchUnifiedTransfers(cutoffDate) {
  const token = await getAuthToken();
  const url = `https://bonfire.robinhood.com/paymenthub/unified_transfers/`;
  return await fetchAllPages(url, buildHeaders(token), cutoffDate, 'updated_at');
}
