// ===============================
// 🧭 DATA EXPORT UTILITIES
// ===============================

import { logInfo, logSuccess, logError } from "./logger.js";

function downloadFile(content, filename, mimeType) {
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

/**
 * Parse a date string to DD/MM/YYYY without UTC-shift bugs.
 * ISO date-only strings (YYYY-MM-DD) are parsed as local date parts directly.
 * Full ISO timestamps are parsed in local timezone via Date object.
 */
function formatDate(dateString) {
  if (!dateString) return "";
  // ISO date-only "YYYY-MM-DD" — extract parts directly (no UTC interpretation)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  // Full timestamp — parse locally
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map(row => headers.map(h => `"${row[h] ?? ""}"`).join(","))
  ].join("\n");
}

// ── Normalizers ──────────────────────────────────────────

function normalizeHoldings(positions, priceMap) {
  if (!positions?.results) return [];
  return positions.results
    .filter(p => Number(p.clearing_running_quantity || 0) > 0)  // drop zero-qty rows
    .map(p => ({
      symbol: p.symbol || "",
      stocks: Number(p.clearing_running_quantity || 0),
      price:  Number(priceMap.get(p.instrument_id) || 0)
    }))
    .filter(r => r.symbol !== "");  // drop rows where symbol lookup failed
}

function normalizeTransactions(stockOrders, optionsOrders, symbolMap = new Map()) {
  logInfo("Normalizing transactions", { stocks: stockOrders.length, options: optionsOrders.length });

  const stockRows = stockOrders
    // Only filled/partially_filled orders with actual quantity
    .filter(o => ["filled", "partially_filled"].includes(o.state) && Number(o.cumulative_quantity) > 0)
    .map(o => {
      const symbol = symbolMap.get(o.instrument) || o.symbol || "";
      return {
        _rawDate: o.created_at || "",
        Date:     formatDate(o.created_at),
        Quantity: Number(o.cumulative_quantity),
        Price:    Number(o.average_price || o.price || 0),
        Type:     o.side === "buy" ? "Buy" : "Sell",
        Entity:   "Stock",
        Symbol:   symbol
      };
    })
    .filter(r => r.Symbol !== "");  // drop blank-symbol rows

  const optRows = optionsOrders
    .filter(o => ["filled", "partially_filled"].includes(o.state))
    .flatMap(o => {
      const legs = o.legs || [];
      const numLegs = legs.length || 1;

      return legs.map(leg => {
        // Leg-specific executions → weighted average price
        const execs = leg.executions || [];
        const totalQty = execs.reduce((s, e) => s + Number(e.quantity), 0);
        let avgPrice;
        if (totalQty > 0) {
          avgPrice = execs.reduce((s, e) => s + Number(e.price) * Number(e.quantity), 0) / totalQty;
        } else {
          // Fallback: split order-level premium equally across legs
          avgPrice = Number(o.processed_premium || 0) / numLegs;
        }

        // Build a unique, readable symbol: e.g.  AMD 150C  or  AMD 160P
        const optType  = (leg.option_type || "").toLowerCase(); // "call" | "put"
        const strike   = leg.strike_price   ? `$${parseFloat(leg.strike_price).toFixed(0)}`   : "";
        const expiry   = leg.expiration_date ? formatDate(leg.expiration_date) : "";
        const symbol   = [o.chain_symbol, strike, optType === "call" ? "Call" : optType === "put" ? "Put" : optType, expiry]
                           .filter(Boolean).join(" ");

        return {
          _rawDate: o.created_at || "",
          Date:     formatDate(o.created_at),
          Quantity: Number(o.quantity || 1),
          Price:    avgPrice,
          Type:     leg.side === "buy" ? "Buy" : "Sell",
          Entity:   "Option",
          Symbol:   symbol || o.chain_symbol || ""
        };
      });
    })
    .filter(r => r.Symbol !== "");

  return [...stockRows, ...optRows]
    .sort((a, b) => new Date(b._rawDate) - new Date(a._rawDate))
    .map(({ _rawDate, ...rest }) => rest);
}

function normalizeDividends(dividends, label, symbolMap = new Map()) {
  return dividends
    .map(d => {
      const isLending = d._isLending || d.dividend_type === "lending_payout";
      const date = d.payable_date || d.paid_at || d.record_date || "";
      const amount = typeof d.amount === 'object' ? d.amount?.amount : d.amount;
      const symbol = d.symbol || symbolMap.get(d.instrument) || "";
      return {
        _rawDate: date,
        Dividend: formatDate(date),
        Type:     isLending ? "Lending Payment" : "Dividend",
        Total:    Number(amount || 0),
        Symbol:   symbol,
        Entity:   d._entityLabel || label || ""
      };
    })
    .filter(r => r.Total > 0)  // drop zero-amount rows
    .sort((a, b) => new Date(b._rawDate) - new Date(a._rawDate))
    .map(({ _rawDate, ...rest }) => rest);
}

function normalizeDeposits(unifiedTransfers, accountNumber) {
  logInfo("Normalizing unified transfers", { accountNumber, total: unifiedTransfers.length });

  // unified_transfers may use UUID-style account IDs — try exact match first,
  // then substring match (account_number embedded in longer ID), then show all.
  const exact = unifiedTransfers.filter(t => {
    const r = String(t.receiving_account_id   || t.receiving_account_number   || "");
    const o = String(t.originating_account_id || t.originating_account_number || "");
    return r === accountNumber || o === accountNumber;
  });

  const subset = exact.length > 0 ? exact : unifiedTransfers.filter(t => {
    const r = String(t.receiving_account_id   || "");
    const o = String(t.originating_account_id || "");
    return r.includes(accountNumber) || o.includes(accountNumber);
  });

  // If still nothing, fall back to all (better than empty CSV — user can filter manually)
  const toProcess = subset.length > 0 ? subset : unifiedTransfers;

  if (exact.length === 0) {
    logInfo(`⚠️ No exact account match for ${accountNumber} in unified_transfers (${unifiedTransfers.length} total). Showing all.`);
  }

  return toProcess
    .map(t => {
      const isDeposit = String(t.receiving_account_id || "").includes(accountNumber)
        || exact.length === 0; // fallback: treat all as deposit direction
      const info = isDeposit
        ? t.receiving_transfer_account_info
        : t.originating_transfer_account_info;
      return {
        _rawDate: t.created_at || t.updated_at || "",
        date:     formatDate(t.created_at || t.updated_at),
        price:    Number(t.amount || 0),
        type:     isDeposit ? "Deposit" : "Withdrawal",
        entity:   info?.account_name_title || "Individual",
        symbol:   t.description || t.details?.purpose || "Transfer"
      };
    })
    .filter(r => r.price > 0)
    .sort((a, b) => new Date(b._rawDate) - new Date(a._rawDate))
    .map(({ _rawDate, ...rest }) => rest);
}

function normalizeBonus(dividends, transfers, interestPayments = [], rewards = [], goldBoosts = []) {
  const rows = [];

  interestPayments.forEach(i => rows.push({
    _rawDate: i.pay_date || "",
    date:     formatDate(i.pay_date),
    price:    Number(i.amount?.amount || i.amount || 0),
    type:     i.direction === "credit" ? "Deposit" : "Withdrawal",
    entity:   "Interest",
    symbol:   i.reason || "Interest Payment"
  }));

  rewards
    .filter(r => r.data?.reward?.state === "granted")
    .forEach(r => {
      const rew = r.data.reward;
      rows.push({
        _rawDate: rew.created_at || "",
        date:     formatDate(rew.created_at),
        price:    Number(rew.cost_basis_in_money?.amount || rew.cost_basis || 0),
        type:     "Deposit",
        entity:   "Rewards",
        symbol:   rew.description || "Reward Payout"
      });
    });

  goldBoosts.forEach(b => rows.push({
    _rawDate: b.created_at || "",
    date:     formatDate(b.created_at),
    price:    Number(b.amount || 0),
    type:     "Deposit",
    entity:   "Gold Boost",
    symbol:   b.title || "Gold deposit boost payout"
  }));

  // Interest / Gold / Membership from ACH transfers
  transfers
    .filter(t => {
      const desc = t.description || "";
      return desc.includes("Interest") || desc.includes("Gold") || desc.includes("Membership");
    })
    .forEach(t => {
      const desc = t.description || "";
      rows.push({
        _rawDate: t.created_at || "",
        date:     formatDate(t.created_at),
        price:    Number(t.amount || 0),
        type:     t.direction === "deposit" ? "Deposit" : "Withdrawal",
        entity:   desc.includes("Membership") ? "Gold Membership Charges"
                : desc.includes("Interest")   ? "Interest"
                : "Gold Benefits",
        symbol:   desc
      });
    });

  return rows
    .filter(r => r.price > 0)
    .sort((a, b) => new Date(b._rawDate) - new Date(a._rawDate))
    .map(({ _rawDate, ...rest }) => rest);
}

function normalizeCrypto(data) {
  if (!data?.results) return [];
  return data.results.map(p => ({
    id:                 p.id,
    code:               p.currency?.code || "",
    name:               p.currency?.name || "",
    quantity:           Number(p.quantity || 0),
    quantity_available: Number(p.quantity_available || 0),
    cost_basis:         Number(p.cost_bases?.[0]?.direct_cost_basis || 0),
    updated_at:         p.updated_at || ""
  }));
}

// ── Export helpers ────────────────────────────────────────

function maybeDownload(rows, filename, downloadEnabled) {
  if (!rows.length) return;
  if (downloadEnabled) downloadFile(toCsv(rows), filename, "text/csv");
  return rows;  // always return rows so caller can use them for Sheets sync
}

export function exportHoldingsCSV(positions, priceMap, accountLabel, downloadEnabled = true) {
  try {
    const rows = normalizeHoldings(positions, priceMap);
    maybeDownload(rows, `${accountLabel}_holdings_${Date.now()}.csv`, downloadEnabled);
    logSuccess(`${accountLabel} holdings`, { count: rows.length });
    return rows;
  } catch (err) { logError("Holdings export failed", err); return []; }
}

export function exportTransactionsCSV(stockOrders, optionsOrders, accountLabel, symbolMap, downloadEnabled = true) {
  try {
    const rows = normalizeTransactions(stockOrders, optionsOrders, symbolMap);
    maybeDownload(rows, `${accountLabel}_orders_${Date.now()}.csv`, downloadEnabled);
    logSuccess(`${accountLabel} orders`, { count: rows.length });
    return rows;
  } catch (err) { logError("Orders export failed", err); return []; }
}

export function exportDividendsCSV(dividends, label, symbolMap, downloadEnabled = true) {
  try {
    const rows = normalizeDividends(dividends, label, symbolMap);
    maybeDownload(rows, `${label}_dividends_${Date.now()}.csv`, downloadEnabled);
    logSuccess(`${label} dividends`, { count: rows.length });
    return rows;
  } catch (err) { logError("Dividends export failed", err); return []; }
}

export function exportDepositsCSV(unifiedTransfers, accountNumber, accountLabel, downloadEnabled = true) {
  try {
    const rows = normalizeDeposits(unifiedTransfers, accountNumber);
    maybeDownload(rows, `${accountLabel}_amount_deposited_${Date.now()}.csv`, downloadEnabled);
    logSuccess(`${accountLabel} deposits`, { count: rows.length });
    return rows;
  } catch (err) { logError("Deposits export failed", err); return []; }
}

export function exportBonusCSV(dividends, transfers, interest, rewards, boosts, accountLabel, downloadEnabled = true) {
  try {
    const rows = normalizeBonus(dividends, transfers, interest, rewards, boosts);
    maybeDownload(rows, `${accountLabel}_bonus_credits_${Date.now()}.csv`, downloadEnabled);
    logSuccess(`${accountLabel} bonus`, { count: rows.length });
    return rows;
  } catch (err) { logError("Bonus export failed", err); return []; }
}

export function exportCSV(data, type = "data", accountLabel = "", downloadEnabled = true) {
  try {
    let rows = [];
    if (type === "crypto") rows = normalizeCrypto(data);
    if (!rows.length) return;
    const prefix = accountLabel ? `${accountLabel}_` : "";
    maybeDownload(rows, `${prefix}${type}_${Date.now()}.csv`, downloadEnabled);
    logSuccess(`${type} exported`, { count: rows.length });
  } catch (err) { logError(`${type} export failed`, err); }
}

export function exportJSON(data, type = "data") {
  try {
    downloadFile(JSON.stringify(data, null, 2), `${type}_${Date.now()}.json`, "application/json");
  } catch (err) { logError(`${type} JSON export failed`, err); }
}
