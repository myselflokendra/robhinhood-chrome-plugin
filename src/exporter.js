// ===============================
// 🧭 DATA EXPORT UTILITIES
// ===============================

import { logInfo, logSuccess, logError } from "./logger.js";

function downloadFile(content, filename, mimeType) {
  logInfo("Preparing file download", { filename, mimeType });
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logSuccess("File downloaded", filename);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map(row => headers.map(h => `"${row[h] ?? ""}"`).join(","))
  ].join("\n");
}

// Holdings: joins positions with a priceMap (instrument_id → last_trade_price)
function normalizeHoldings(positions, priceMap) {
  logInfo("Normalizing holdings for export");
  if (!positions?.results) {
    logError("Invalid positions data", positions);
    return [];
  }
  return positions.results.map(p => ({
    symbol: p.symbol || "",
    quantity: Number(p.clearing_running_quantity || 0),
    price: Number(priceMap.get(p.instrument_id) || 0)
  }));
}

// Merges stock orders and options orders into one unified list sorted by Date ascending.
function normalizeTransactions(stockOrders, optionsOrders) {
  logInfo("Normalizing transactions for export");

  const stockRows = stockOrders.map(o => ({
    Date: o.created_at || "",
    Quantity: Number(o.cumulative_quantity || o.quantity || 0),
    Price: Number(o.average_price || o.price || 0),
    Type: o.side === "buy" ? "Buy" : "Sell"
  }));

  const optRows = optionsOrders.map(o => ({
    Date: o.created_at || "",
    Quantity: 1,
    Price: Number(o.legs?.[0]?.executions?.[0]?.price || 0),
    Type: o.legs?.[0]?.side === "buy" ? "Buy" : "Sell"
  }));

  return [...stockRows, ...optRows].sort(
    (a, b) => new Date(a.Date) - new Date(b.Date)
  );
}

function normalizeCrypto(data) {
  logInfo("Normalizing crypto positions for export");
  if (!data?.results) {
    logError("Invalid crypto data format for export", data);
    return [];
  }
  return data.results.map(p => ({
    id: p.id,
    code: p.currency?.code || "",
    name: p.currency?.name || "",
    quantity: Number(p.quantity || 0),
    quantity_available: Number(p.quantity_available || 0),
    cost_basis: Number(p.cost_bases?.[0]?.direct_cost_basis || 0),
    updated_at: p.updated_at || ""
  }));
}

// Export holdings CSV — requires positions data and a priceMap.
export function exportHoldingsCSV(positions, priceMap, accountLabel) {
  try {
    const rows = normalizeHoldings(positions, priceMap);
    if (!rows.length) return;
    const filename = `${accountLabel}_holdings_${Date.now()}.csv`;
    downloadFile(toCsv(rows), filename, "text/csv");
  } catch (err) {
    logError("Holdings CSV export failed", err);
  }
}

// Export merged stock + options transactions CSV.
export function exportTransactionsCSV(stockOrders, optionsOrders, accountLabel) {
  try {
    const rows = normalizeTransactions(stockOrders, optionsOrders);
    if (!rows.length) return;
    const filename = `${accountLabel}_transactions_${Date.now()}.csv`;
    downloadFile(toCsv(rows), filename, "text/csv");
  } catch (err) {
    logError("Transactions CSV export failed", err);
  }
}

// Generic CSV export kept for crypto and any future use.
export function exportCSV(data, type = "data", accountLabel = "") {
  try {
    logInfo(`Exporting ${type} as CSV`);
    let rows = [];
    if (type === "crypto") {
      rows = normalizeCrypto(data);
    }
    if (!rows.length) return;
    const prefix = accountLabel ? `${accountLabel}_` : "";
    const filename = `${prefix}${type}_${Date.now()}.csv`;
    downloadFile(toCsv(rows), filename, "text/csv");
  } catch (err) {
    logError(`${type} CSV export failed`, err);
  }
}

export function exportJSON(data, type = "data") {
  try {
    logInfo(`Exporting ${type} as JSON`);
    const filename = `${type}_${Date.now()}.json`;
    downloadFile(JSON.stringify(data, null, 2), filename, "application/json");
  } catch (err) {
    logError(`${type} JSON export failed`, err);
  }
}
