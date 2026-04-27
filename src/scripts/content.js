import * as api from "../api/api.js";
import * as exporter from "../core/exporter.js";
import { logInfo, logError, logSuccess, logParty } from "../core/logger.js";
import { CONFIG } from "../core/config.js";

// ===============================
// 🛠️ SETTINGS MANAGEMENT
// ===============================

const SETTINGS_KEY = 'rh_exporter_settings';

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      const stored = result[SETTINGS_KEY];
      if (stored && stored.individual && stored.ira) {
        resolve(stored);
      } else {
        logInfo("Initializing settings with defaults");
        saveSettings(CONFIG.settings);
        resolve(CONFIG.settings);
      }
    });
  });
}

function saveSettings(settings) {
  chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// ===============================
// 🎨 UI OVERLAY
// ===============================

async function createOverlay() {
  if (document.getElementById('rh-overlay-container')) return;

  const settings = await loadSettings();

  try {
    const htmlUrl = chrome.runtime.getURL('popup.html');
    const cssUrl  = chrome.runtime.getURL('popup.css');
    const [htmlResponse, cssResponse] = await Promise.all([fetch(htmlUrl), fetch(cssUrl)]);
    if (!htmlResponse.ok || !cssResponse.ok) throw new Error('Failed to fetch UI assets');

    const style = document.createElement('style');
    style.id = 'rh-overlay-styles';
    style.textContent = await cssResponse.text();
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'rh-overlay-container';
    container.innerHTML = await htmlResponse.text();
    document.body.appendChild(container);

    const launcher = document.createElement('button');
    launcher.id = 'rh-launcher-btn';
    launcher.innerHTML = '<span class="rh-tab-text">EXPORTER</span>';
    document.body.appendChild(launcher);

    const toggleDrawer = (show) => {
      container.classList.toggle('visible', show);
      launcher.classList.toggle('hidden', show);
    };
    launcher.addEventListener('click', () => toggleDrawer(true));
    document.getElementById('rh-close-btn').addEventListener('click', () => toggleDrawer(false));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && container.classList.contains('visible')) toggleDrawer(false);
    });

    // ── Checkbox map ──
    const checkboxMap = {
      'ind_h_stocks':  ['individual', 'holdings',     'stocks'],
      'ind_h_crypto':  ['individual', 'holdings',     'crypto'],
      'ind_t_stocks':  ['individual', 'transactions', 'stocks'],
      'ind_t_options': ['individual', 'transactions', 'options'],
      'ind_t_crypto':  ['individual', 'transactions', 'crypto'],
      'ind_t_div':     ['individual', 'transactions', 'dividend'],
      'ind_t_dep':     ['individual', 'transactions', 'deposits'],
      'ind_t_bonus':   ['individual', 'transactions', 'bonus'],
      'ira_h_stocks':  ['ira', 'holdings',     'stocks'],
      'ira_h_crypto':  ['ira', 'holdings',     'crypto'],
      'ira_t_stocks':  ['ira', 'transactions', 'stocks'],
      'ira_t_options': ['ira', 'transactions', 'options'],
      'ira_t_crypto':  ['ira', 'transactions', 'crypto'],
      'ira_t_div':     ['ira', 'transactions', 'dividend'],
      'ira_t_dep':     ['ira', 'transactions', 'deposits'],
      'ira_t_bonus':   ['ira', 'transactions', 'bonus'],
    };

    // ── Set initial checkbox states ──
    Object.entries(checkboxMap).forEach(([id, [section, group, key]]) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!settings[section][group][key];
    });
    const googleSyncEl = document.getElementById('google_sync');
    const downloadCsvEl = document.getElementById('download_csv');
    const sheetsOwnerEl = document.getElementById('rh-sheets-owner');

    if (googleSyncEl)   googleSyncEl.checked   = !!settings.googleSync?.enabled;
    if (downloadCsvEl)  downloadCsvEl.checked   = settings.downloadCsv !== false; // default true
    if (sheetsOwnerEl)  sheetsOwnerEl.value     = settings.googleSync?.sheetsOwner || "deepika_prod";

    // Show/hide sheets owner row when sync toggled
    const updateSheetsOwnerVisibility = () => {
      const row = document.getElementById('rh-sheets-owner-row');
      if (row) row.classList.toggle('visible', !!googleSyncEl?.checked);
    };
    updateSheetsOwnerVisibility();
    if (googleSyncEl) googleSyncEl.addEventListener('change', updateSheetsOwnerVisibility);

    // ── Persist all settings on any change ──
    const updateSettings = () => {
      const next = JSON.parse(JSON.stringify(settings));
      Object.entries(checkboxMap).forEach(([id, [section, group, key]]) => {
        const el = document.getElementById(id);
        if (el) next[section][group][key] = el.checked;
      });
      next.googleSync = {
        enabled:     googleSyncEl?.checked || false,
        sheetsOwner: sheetsOwnerEl?.value  || "deepika_prod"
      };
      next.downloadCsv = downloadCsvEl?.checked !== false;
      saveSettings(next);
      Object.assign(settings, next);
    };

    [...Object.keys(checkboxMap), 'google_sync', 'download_csv'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', updateSettings);
    });
    sheetsOwnerEl?.addEventListener('change', updateSettings);

    // ── Sticky date ──
    const dateInput = document.getElementById('rh-cutoff-date');
    chrome.storage.local.get(['rh_sticky_date'], (r) => {
      if (r.rh_sticky_date) {
        dateInput.value = r.rh_sticky_date;
      } else {
        const now = new Date();
        dateInput.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      }
    });
    dateInput?.addEventListener('change', (e) => {
      chrome.storage.local.set({ 'rh_sticky_date': e.target.value });
    });

    // ── Download button ──
    document.getElementById('rh-download-btn').addEventListener('click', async () => {
      const btn    = document.getElementById('rh-download-btn');
      const status = document.getElementById('rh-status-txt');
      btn.disabled = true;
      status.textContent = '🚀 Starting...';
      try {
        const cutoffDate = dateInput?.value || null;
        await runRobinhoodPipeline(cutoffDate, status);
        status.textContent = '✅ All done!';
      } catch (e) {
        status.textContent = '❌ ' + e.message;
        logError("Pipeline failed", e);
      } finally {
        setTimeout(() => { btn.disabled = false; status.textContent = ''; }, 4000);
      }
    });

    logSuccess("UI Overlay initialized");
  } catch (err) {
    logError("Failed to initialize UI overlay", err);
  }
}

// ===============================
// 🔍 UTILS
// ===============================

async function injectInterceptor() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('interceptor.js');
    script.setAttribute('data-base-url',    CONFIG.baseUrl.replace('https://', ''));
    script.setAttribute('data-user-path',   CONFIG.userEndpoint);
    script.setAttribute('data-inbox-path',  CONFIG.inboxEndpoint);
    script.setAttribute('data-extra-path',  CONFIG.extraEndpoint);
    script.onload  = () => { script.remove(); resolve(); };
    script.onerror = (err) => { logError("Interceptor injection failed", err); resolve(); };
    (document.head || document.documentElement).appendChild(script);
  });
}

function waitForToken() {
  return new Promise((resolve) => {
    const existing = sessionStorage.getItem('rh_token');
    if (existing) { resolve(existing); return; }

    const handler = (event) => {
      if (event.source !== window) return;
      if (event.data?.type === 'ROBINHOOD_TOKEN_INTERCEPTED') {
        const token = event.data.token;
        sessionStorage.setItem('rh_token', token);
        window.removeEventListener('message', handler);
        resolve(token);
      }
    };
    window.addEventListener('message', handler);
    setTimeout(() => { window.removeEventListener('message', handler); resolve(null); }, 30000);
  });
}

async function resolveSymbolsForData(orders = [], dividends = []) {
  const urls = [...orders.map(o => o.instrument), ...dividends.map(d => d.instrument)].filter(Boolean);
  const unique = [...new Set(urls)];
  if (!unique.length) return new Map();
  const ids = unique.map(u => u.split('/').filter(Boolean).pop());
  return await api.fetchInstruments(ids);
}

// ===============================
// 🚀 PIPELINE
// ===============================

async function fetchAccountData(accountNumber, accountLabel, cutoffDate, settings, setStatus, allAccountIds, globalRewards, globalBoosts, globalTransfers) {
  if (!accountNumber) return null;
  setStatus(`📋 Fetching ${accountLabel} data...`);

  const isIra = accountLabel !== "Individual";
  const s = isIra ? settings.ira.transactions : settings.individual.transactions;
  const accountQuery = allAccountIds.length > 0 ? allAccountIds : [accountNumber];

  const [stockOrders, optionsOrders, dividends, transfers, lendingPayments, interestPayments] = await Promise.all([
    s.stocks   ? api.fetchStockOrders(accountNumber, cutoffDate)       : [],
    s.options  ? api.fetchOptionsOrders(accountNumber, cutoffDate)     : [],
    s.dividend ? api.fetchDividends(accountNumber, cutoffDate)         : [],
    s.deposits ? api.fetchTransfers(cutoffDate)                        : [],
    s.stocks   ? api.fetchLendingPayments(accountQuery, cutoffDate)    : [],
    s.bonus    ? api.fetchInterest(accountQuery, cutoffDate)           : []
  ]);

  const filteredLending = lendingPayments.filter(p => p.account_number === accountNumber);
  filteredLending.forEach(p => p._isLending = true);

  return {
    stockOrders,
    optionsOrders,
    dividends:       [...dividends, ...filteredLending],
    lendingPayments: filteredLending,
    transfers,
    interest:        interestPayments.filter(p => p.account_number === accountNumber),
    rewards:         globalRewards.filter(r => {
      const n = r.data?.reward?.rhs_account_number;
      return n ? n === accountNumber : !isIra;
    }),
    boosts:          globalBoosts.filter(b => b.account_number === accountNumber),
    unifiedTransfers: globalTransfers
  };
}

async function runRobinhoodPipeline(cutoffDate, statusEl) {
  const settings = await loadSettings();
  const dl = settings.downloadCsv !== false;  // CSV download enabled?
  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  if (!window.location.href.includes('robinhood.com')) throw new Error('Please navigate to Robinhood first');

  const token = await waitForToken();
  if (!token) throw new Error("Could not find auth token. Try refreshing the page.");

  // 1. Discover accounts
  setStatus("🔍 Discovering accounts...");
  const accounts = await api.fetchAccounts();
  if (!accounts.length) throw new Error("No accounts found.");
  const allAccountIds = accounts.map(a => a.account_number);
  const syncBatch = [];

  // 2. Global data (fetched once regardless of which account)
  setStatus("🎁 Fetching rewards...");
  const globalRewards = await api.fetchRewards();
  setStatus("🚀 Fetching Gold boosts...");
  const globalBoosts = await api.fetchGoldBoosts();
  setStatus("💸 Fetching unified transfers...");
  const globalTransfers = await api.fetchUnifiedTransfers(cutoffDate);

  const individualAccounts = accounts.filter(a => a.brokerage_account_type === 'individual');
  const iraAccounts        = accounts.filter(a => a.brokerage_account_type.startsWith('ira_'));

  // ── 3. Holdings ──
  const processHoldings = async (acc, label, settingsKey) => {
    if (!settings[settingsKey].holdings.stocks) return;
    setStatus(`📊 Fetching ${label} holdings...`);
    const positions = await api.fetchStockPositions(acc.account_number);
    if (!positions?.results?.length) return;

    const instrumentIds = positions.results.map(p => p.instrument_id).filter(Boolean);
    const priceMap      = await api.fetchMarketQuotes(instrumentIds);

    // Resolve symbols for instrument URLs (positions only have instrument URLs, not symbols)
    const symMap = await resolveSymbolsForData(positions.results.map(p => ({ instrument: p.instrument })), []);
    positions.results.forEach(p => { p.symbol = symMap.get(p.instrument) || p.symbol || ""; });

    const rows = exporter.exportHoldingsCSV(positions, priceMap, label.toLowerCase(), dl);

    if (settings.googleSync?.enabled) {
      for (const p of positions.results.filter(p => p.symbol)) {
        syncBatch.push({
          type: 'HOLDINGS',
          payload: {
            ticker:       p.symbol,
            quantity:     Number(p.clearing_running_quantity || 0),
            price:        Number(priceMap.get(p.instrument_id) || 0),
            accountLabel: label
          }
        });
      }
    }
  };

  for (const acc of individualAccounts) await processHoldings(acc, "Individual", "individual");
  for (const acc of iraAccounts) {
    const label = acc.brokerage_account_type === 'ira_roth' ? 'Roth' : 'Traditional';
    await processHoldings(acc, label, "ira");
  }

  if (settings.individual.holdings.crypto || settings.ira.holdings.crypto) {
    setStatus("🪙 Fetching crypto holdings...");
    const crypto = await api.fetchCryptoPositions();
    if (crypto?.results?.length) exporter.exportCSV(crypto, "crypto", "crypto", dl);
  }

  // ── 4. Individual accounts ──
  for (const acc of individualAccounts) {
    const s    = settings.individual.transactions;
    const data = await fetchAccountData(acc.account_number, "Individual", cutoffDate, settings, setStatus, allAccountIds, globalRewards, globalBoosts, globalTransfers);
    if (!data) continue;

    const symbolMap = await resolveSymbolsForData(data.stockOrders, data.dividends);

    // ✅ FIX: pass data.optionsOrders (was [] before)
    if (s.stocks || s.options) {
      exporter.exportTransactionsCSV(data.stockOrders, data.optionsOrders, "individual", symbolMap, dl);

      if (settings.googleSync?.enabled) {
        // Stock transactions
        for (const o of data.stockOrders.filter(o => ["filled","partially_filled"].includes(o.state))) {
          syncBatch.push({
            type: 'TRANSACTION',
            payload: {
              ticker:       symbolMap.get(o.instrument) || o.symbol || "UNKNOWN",
              date:         o.last_transaction_at || o.updated_at,
              quantity:     o.cumulative_quantity,
              price:        o.average_price,
              side:         o.side,
              accountLabel: "Individual"
            }
          });
        }
        // Sync ALL legs of each options order (multi-leg spreads = multiple rows)
        for (const o of data.optionsOrders.filter(o => ["filled","partially_filled"].includes(o.state))) {
          const legs    = o.legs || [];
          const numLegs = legs.length || 1;
          for (const leg of legs) {
            const execs    = leg.executions || [];
            const totalQty = execs.reduce((s, e) => s + Number(e.quantity), 0);
            const avgPx    = totalQty > 0
              ? execs.reduce((s, e) => s + Number(e.price) * Number(e.quantity), 0) / totalQty
              : Number(o.processed_premium || 0) / numLegs;
            syncBatch.push({
              type: 'TRANSACTION',
              payload: {
                ticker:       o.chain_symbol || "UNKNOWN",
                date:         o.created_at,
                quantity:     o.quantity,
                price:        avgPx,
                side:         leg.side || "N/A",
                accountLabel: "Individual",
                // note triggers "option column" in background.js
                note: `${o.quantity} ${(leg.option_type||'OPTION').toUpperCase()} $${leg.strike_price} EXP ${leg.expiration_date}`
              }
            });
          }
        }
      }
    }

    if (s.dividend) {
      exporter.exportDividendsCSV(data.dividends, "Individual", symbolMap, dl);
      if (settings.googleSync?.enabled) {
        for (const d of data.dividends) {
          const isLending = d._isLending || d.dividend_type === "lending_payout";
          const amount = typeof d.amount === 'object' ? d.amount?.amount : d.amount;
          syncBatch.push({
            type:    isLending ? 'LENDING' : 'DIVIDEND',
            payload: {
              ticker:       d.symbol || symbolMap.get(d.instrument) || "UNKNOWN",
              date:         d.payable_date || d.pay_date || d.paid_at || d.record_date || "",
              amount,
              accountLabel: "Individual"
            }
          });
        }
      }
    }

    if (s.deposits) {
      exporter.exportDepositsCSV(data.unifiedTransfers, acc.account_number, "individual", dl);
      if (settings.googleSync?.enabled) {
        for (const ut of data.unifiedTransfers) {
          syncBatch.push({
            type: 'DEPOSIT',
            payload: {
              date:   ut.created_at || ut.updated_at,
              amount: ut.amount,
              note:   ut.receiving_transfer_account_info?.account_name_title
            }
          });
        }
      }
    }

    if (s.bonus) exporter.exportBonusCSV(data.dividends, data.transfers, data.interest, data.rewards, data.boosts, "individual", dl);
  }

  // ── 5. IRA accounts ──
  if (iraAccounts.length) {
    let allIraDivs  = [];
    let allIraOrders = [];

    for (const acc of iraAccounts) {
      const label = acc.brokerage_account_type === 'ira_roth' ? 'Roth' : 'Traditional';
      const s     = settings.ira.transactions;
      const data  = await fetchAccountData(acc.account_number, label, cutoffDate, settings, setStatus, allAccountIds, globalRewards, globalBoosts, globalTransfers);
      if (!data) continue;

      const symbolMap = await resolveSymbolsForData(data.stockOrders, data.dividends);

      if (s.dividend) allIraDivs.push(...data.dividends.map(d => ({ ...d, _entityLabel: label })));
      if (s.stocks)   allIraOrders.push(...data.stockOrders);

      // ✅ FIX: pass data.optionsOrders (was [] before)
      if (s.stocks || s.options) {
        exporter.exportTransactionsCSV(data.stockOrders, data.optionsOrders, label.toLowerCase(), symbolMap, dl);

        if (settings.googleSync?.enabled) {
          for (const o of data.stockOrders.filter(o => ["filled","partially_filled"].includes(o.state))) {
            syncBatch.push({
              type: 'TRANSACTION',
              payload: {
                ticker:       o.symbol || symbolMap.get(o.instrument) || "UNKNOWN",
                date:         o.last_transaction_at || o.updated_at,
                quantity:     o.cumulative_quantity,
                price:        o.average_price,
                side:         o.side,
                accountLabel: label
              }
            });
          }
          // Sync ALL legs of each options order (multi-leg spreads = multiple rows)
          for (const o of data.optionsOrders.filter(o => ["filled","partially_filled"].includes(o.state))) {
            const legs    = o.legs || [];
            const numLegs = legs.length || 1;
            for (const leg of legs) {
              const execs    = leg.executions || [];
              const totalQty = execs.reduce((s, e) => s + Number(e.quantity), 0);
              const avgPx    = totalQty > 0
                ? execs.reduce((s, e) => s + Number(e.price) * Number(e.quantity), 0) / totalQty
                : Number(o.processed_premium || 0) / numLegs;
              syncBatch.push({
                type: 'TRANSACTION',
                payload: {
                  ticker:       o.chain_symbol || "UNKNOWN",
                  date:         o.created_at,
                  quantity:     o.quantity,
                  price:        avgPx,
                  side:         leg.side || "N/A",
                  accountLabel: label,
                  note: `${o.quantity} ${(leg.option_type||'OPTION').toUpperCase()} $${leg.strike_price} EXP ${leg.expiration_date}`
                }
              });
            }
          }
        }
      }

      if (s.deposits) exporter.exportDepositsCSV(data.unifiedTransfers, acc.account_number, label.toLowerCase(), dl);
      if (s.bonus)    exporter.exportBonusCSV(data.dividends, data.transfers, data.interest, data.rewards, data.boosts, label.toLowerCase(), dl);

      if (s.dividend && settings.googleSync?.enabled) {
        for (const d of data.dividends) {
          const isLending = d._isLending || d.dividend_type === "lending_payout";
          const amount = typeof d.amount === 'object' ? d.amount?.amount : d.amount;
          syncBatch.push({
            type:    isLending ? 'LENDING' : 'DIVIDEND',
            payload: {
              ticker:       d.symbol || symbolMap.get(d.instrument) || "UNKNOWN",
              date:         d.payable_date || d.pay_date || d.paid_at || d.record_date || "",
              amount,
              accountLabel: label
            }
          });
        }
      }
    }

    if (allIraDivs.length) {
      const symbolMap = await resolveSymbolsForData(allIraOrders, allIraDivs);
      exporter.exportDividendsCSV(allIraDivs, "IRA", symbolMap, dl);
    }
  }

  // ── 6. Google Sheets batch sync ──
  if (settings.googleSync?.enabled && syncBatch.length > 0) {
    setStatus(`☁️ Syncing ${syncBatch.length} items to Google Sheets...`);
    const response = await chrome.runtime.sendMessage({
      type:    'SYNC_BATCH',
      payload: { items: syncBatch, sheetsOwner: settings.googleSync?.sheetsOwner || "deepika_prod" }
    });
    if (response?.success) {
      logSuccess(`Batch sync complete: ${response.results?.length || 0} sheets updated.`);
    } else {
      logError(`Batch sync failed: ${response?.error}`);
      throw new Error(`Google Sync Failed: ${response?.error}`);
    }
  }

  logParty("Pipeline completed for all accounts");
}

// ===============================
// 🏁 INITIALIZATION
// ===============================

const init = async () => {
  if (!window.location.hostname.includes('robinhood.com')) return;
  logInfo("Robinhood detected, starting interceptor...");

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SYNC_PROGRESS') {
      const el = document.getElementById('rh-status-txt');
      if (el) el.textContent = message.text;
    }
  });

  if (!sessionStorage.getItem('rh_clear_flag')) {
    sessionStorage.removeItem('rh_token');
    sessionStorage.setItem('rh_clear_flag', 'true');
  }

  injectInterceptor();
  (async () => { const t = await waitForToken(); if (t) logSuccess("Token pre-captured"); })();

  const injectWhenReady = () => {
    if (document.body) createOverlay();
    else setTimeout(injectWhenReady, 50);
  };
  injectWhenReady();
};

init();
