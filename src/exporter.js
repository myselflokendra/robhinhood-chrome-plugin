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

function formatDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
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
    stocks: Number(p.clearing_running_quantity || 0),
    price: Number(priceMap.get(p.instrument_id) || 0)
  }));
}

// Merges stock orders and options orders.
function normalizeTransactions(stockOrders, optionsOrders, symbolMap = new Map()) {
  logInfo("Normalizing core transactions");

  const stockRows = stockOrders
    .filter(o => ["filled", "partially_filled"].includes(o.state) || Number(o.cumulative_quantity) > 0)
    .map(o => ({
      _rawDate: o.created_at || "",
      Date: formatDate(o.created_at),
      Quantity: Number(o.cumulative_quantity || o.quantity || 0),
      Price: Number(o.average_price || o.price || 0),
      Type: o.side === "buy" ? "Buy" : "Sell",
      Entity: "Stock",
      Symbol: symbolMap.get(o.instrument) || o.symbol || ""
    }));

  const optRows = optionsOrders
    .filter(o => o.state === "filled")
    .flatMap(o => (o.legs || []).map(leg => {
      const executions = leg.executions || [];
      const totalFilled = executions.reduce((sum, e) => sum + Number(e.quantity), 0);
      const weightedSum = executions.reduce((sum, e) => sum + (Number(e.price) * Number(e.quantity)), 0);
      const avgPrice = totalFilled > 0 ? weightedSum / totalFilled : 0;

      return {
        _rawDate: o.created_at || "",
        Date: formatDate(o.created_at),
        Quantity: Number(o.quantity || 1),
        Price: avgPrice,
        Type: leg.side === "buy" ? "Buy" : "Sell",
        Entity: "Option",
        Symbol: o.chain_symbol || ""
      };
    }));

  return [...stockRows, ...optRows]
    .sort((a, b) => new Date(b._rawDate) - new Date(a._rawDate))
    .map(({ _rawDate, ...rest }) => rest);
}

function normalizeDividends(dividends, label, symbolMap = new Map()) {
  logInfo("Normalizing dividends and lending payments");
  return dividends.map(d => {
    const isLending = d._isLending || d.dividend_type === "lending_payout";
    const date = d.payable_date || d.paid_at || d.record_date || "";
    
    const amount = typeof d.amount === 'object' ? d.amount?.amount : d.amount;
    const symbol = d.symbol || symbolMap.get(d.instrument) || "";

    return {
      _rawDate: date,
      Dividend: formatDate(date),
      Type: isLending ? "Lending Payment" : "Dividend",
      Total: Number(amount || 0),
      Symbol: symbol,
      Entity: d._entityLabel || label || ""
    };
  })
  .sort((a, b) => new Date(b._rawDate) - new Date(a._rawDate))
  .map(({ _rawDate, ...rest }) => rest);
}

function normalizeDeposits(unifiedTransfers, accountNumber) {
  logInfo("Normalizing unified transfers for deposits/withdrawals", { accountNumber });
  
  return unifiedTransfers
    .filter(t => t.receiving_account_id === accountNumber || t.originating_account_id === accountNumber)
    .map(t => {
      const isDeposit = t.receiving_account_id === accountNumber;
      const accountInfo = isDeposit ? t.receiving_transfer_account_info : t.originating_transfer_account_info;
      
      return {
        _rawDate: t.created_at || "",
        date: formatDate(t.created_at),
        price: Number(t.amount || 0),
        type: isDeposit ? "Deposit" : "Withdrawal",
        entity: accountInfo?.account_name_title || "Individual",
        symbol: t.description || t.details?.purpose || "Transfer"
      };
    })
    .sort((a, b) => new Date(b._rawDate) - new Date(a._rawDate))
    .map(({ _rawDate, ...rest }) => rest);
}

function normalizeBonus(dividends, transfers, interestPayments = [], rewards = [], goldBoosts = []) {
  logInfo("Normalizing interest, gold, rewards, and boosts");
  
  const bonusFromDivs = dividends
    .filter(d => d.dividend_type === "interest" || (d.description || "").includes("Gold"))
    .map(d => ({
      _rawDate: d.payable_date || d.paid_at || d.record_date || "",
      date: formatDate(d.payable_date || d.paid_at || d.record_date),
      price: Number(d.amount || 0),
      type: "Deposit",
      entity: (d.description || "").includes("Interest") ? "Interest" : "Gold Benefits",
      symbol: d.description || "Bonus Payout"
    }));

  const bonusFromTransfers = transfers
    .filter(t => {
      const desc = t.description || "";
      return desc.includes("Interest") || desc.includes("Gold") || desc.includes("Membership");
    })
    .map(t => ({
      _rawDate: t.created_at || "",
      date: formatDate(t.created_at),
      price: Number(t.amount || 0),
      type: t.direction === "deposit" ? "Deposit" : "Withdrawal",
      entity: t.description.includes("Membership") ? "Gold Membership Charges" : (t.description.includes("Interest") ? "Interest" : "Gold Benefits"),
      symbol: t.description
    }));

  const bonusFromInterest = interestPayments
    .map(i => ({
      _rawDate: i.pay_date || "",
      date: formatDate(i.pay_date),
      price: Number(i.amount?.amount || 0),
      type: i.direction === "credit" ? "Deposit" : "Withdrawal",
      entity: "Interest",
      symbol: i.reason || "Interest Payment"
    }));

  const bonusFromRewards = rewards
    .filter(r => r.data?.reward?.state === "granted")
    .map(r => {
      const rew = r.data.reward;
      return {
        _rawDate: rew.created_at || "",
        date: formatDate(rew.created_at),
        price: Number(rew.cost_basis_in_money?.amount || rew.cost_basis || 0),
        type: "Deposit",
        entity: "Rewards",
        symbol: rew.description || "Reward Payout"
      };
    });

  const bonusFromGoldBoosts = goldBoosts
    .map(b => ({
      _rawDate: b.created_at || "",
      date: formatDate(b.created_at),
      price: Number(b.amount || 0),
      type: "Deposit",
      entity: "Gold Boost",
      symbol: b.title || "Gold deposit boost payout"
    }));

  return [...bonusFromDivs, ...bonusFromTransfers, ...bonusFromInterest, ...bonusFromRewards, ...bonusFromGoldBoosts]
    .sort((a, b) => new Date(b._rawDate) - new Date(a._rawDate))
    .map(({ _rawDate, ...rest }) => rest);
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
    logSuccess(`${accountLabel} holdings exported`, { count: rows.length, data: rows });
  } catch (err) {
    logError("Holdings CSV export failed", err);
  }
}

// Export merged stock + options transactions CSV.
export function exportTransactionsCSV(stockOrders, optionsOrders, accountLabel, symbolMap) {
  try {
    const rows = normalizeTransactions(stockOrders, optionsOrders, symbolMap);
    if (!rows.length) return;
    const filename = `${accountLabel}_orders_${Date.now()}.csv`;
    downloadFile(toCsv(rows), filename, "text/csv");
    logSuccess(`${accountLabel} orders exported`, { count: rows.length, data: rows });
  } catch (err) {
    logError("Orders CSV export failed", err);
  }
}

export function exportDividendsCSV(dividends, label, symbolMap) {
  try {
    const rows = normalizeDividends(dividends, label, symbolMap);
    if (!rows.length) return;
    const filename = `${label}_dividends_${Date.now()}.csv`;
    downloadFile(toCsv(rows), filename, "text/csv");
    logSuccess(`${label} dividends exported`, { count: rows.length, data: rows });
  } catch (err) {
    logError("Dividends CSV export failed", err);
  }
}

export function exportDepositsCSV(unifiedTransfers, accountNumber, accountLabel) {
  try {
    const rows = normalizeDeposits(unifiedTransfers, accountNumber);
    if (!rows.length) return;
    const filename = `${accountLabel}_amount_deposited_${Date.now()}.csv`;
    downloadFile(toCsv(rows), filename, "text/csv");
    logSuccess(`${accountLabel} deposits exported`, { count: rows.length, data: rows });
  } catch (err) {
    logError("Deposits CSV export failed", err);
  }
}

export function exportBonusCSV(dividends, transfers, interest, rewards, boosts, accountLabel) {
  try {
    const rows = normalizeBonus(dividends, transfers, interest, rewards, boosts);
    if (!rows.length) return;
    const filename = `${accountLabel}_bonus_credits_${Date.now()}.csv`;
    downloadFile(toCsv(rows), filename, "text/csv");
    logSuccess(`${accountLabel} bonus credits exported`, { count: rows.length, data: rows });
  } catch (err) {
    logError("Bonus credits CSV export failed", err);
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
    logSuccess(`${type} exported as CSV`, { count: rows.length, data: rows });
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
