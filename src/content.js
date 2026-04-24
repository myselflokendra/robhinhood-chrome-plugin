// ===============================
// 🧭 CONTENT SCRIPT ENTRY POINT
// ===============================

import { fetchAccounts, fetchStockPositions, fetchMarketQuotes, fetchCryptoPositions, fetchOptionsOrders, fetchStockOrders, fetchInstruments, fetchDividends, fetchTransfers, fetchLendingPayments, fetchInterest, fetchRewards, fetchGoldBoosts, fetchUnifiedTransfers } from "./api.js";
import { exportHoldingsCSV, exportTransactionsCSV, exportDividendsCSV, exportDepositsCSV, exportBonusCSV, exportCSV } from "./exporter.js";
import { logSuccess, logInfo, logError, logParty } from "./logger.js";
import { CONFIG } from "./config.js";

// ===============================
// 🛠️ SETTINGS MANAGEMENT
// ===============================

const SETTINGS_KEY = 'rh_exporter_settings';

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      if (result[SETTINGS_KEY]) {
        resolve(result[SETTINGS_KEY]);
      } else {
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
    const htmlUrl = chrome.runtime.getURL('dist/popup.html');
    const cssUrl = chrome.runtime.getURL('dist/popup.css');

    const [htmlResponse, cssResponse] = await Promise.all([
      fetch(htmlUrl),
      fetch(cssUrl)
    ]);

    if (!htmlResponse.ok || !cssResponse.ok) {
      throw new Error(`Failed to fetch UI assets`);
    }

    const htmlContent = await htmlResponse.text();
    const cssContent = await cssResponse.text();

    const style = document.createElement('style');
    style.id = 'rh-overlay-styles';
    style.textContent = cssContent;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'rh-overlay-container';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    const launcher = document.createElement('button');
    launcher.id = 'rh-launcher-btn';
    launcher.innerHTML = '<span class="rh-tab-text">EXPORTER</span>';
    launcher.title = 'Open Robinhood Exporter';
    document.body.appendChild(launcher);

    const toggleDrawer = (show) => {
      container.classList.toggle('visible', show);
      launcher.classList.toggle('hidden', show);
    };

    launcher.addEventListener('click', () => toggleDrawer(true));
    document.getElementById('rh-close-btn').addEventListener('click', () => toggleDrawer(false));

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && container.classList.contains('visible')) {
        toggleDrawer(false);
      }
    });

    document.getElementById('hold_stocks').checked = !!settings.holdings.stocks;
    document.getElementById('hold_crypto').checked = !!settings.holdings.crypto;
    document.getElementById('tx_stocks').checked = !!settings.transactions.stocks;
    document.getElementById('tx_options').checked = !!settings.transactions.options;

    const getVal = (id) => document.getElementById(id).checked;

    const updateSettings = () => {
      saveSettings({
        holdings: { stocks: getVal('hold_stocks'), crypto: getVal('hold_crypto') },
        transactions: { stocks: getVal('tx_stocks'), options: getVal('tx_options') }
      });
    };

    ['hold_stocks', 'hold_crypto', 'tx_stocks', 'tx_options'].forEach(id => {
      document.getElementById(id).addEventListener('change', updateSettings);
    });

    document.getElementById('rh-download-btn').addEventListener('click', async () => {
      const btn = document.getElementById('rh-download-btn');
      const status = document.getElementById('rh-status-txt');

      btn.disabled = true;
      status.textContent = '🚀 Starting...';

      try {
        const cutoffDate = document.getElementById('rh-cutoff-date').value || null;
        await runRobinhoodPipeline(cutoffDate, status);
        status.textContent = '✅ All downloads complete!';
      } catch (e) {
        status.textContent = '❌ Error: ' + e.message;
        logError("Pipeline failed", e);
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          status.textContent = '';
        }, 4000);
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
    logInfo("Injecting interceptor script...");
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dist/interceptor.js');

    script.setAttribute('data-base-url', CONFIG.baseUrl.replace('https://', ''));
    script.setAttribute('data-user-path', CONFIG.userEndpoint);
    script.setAttribute('data-inbox-path', CONFIG.inboxEndpoint);
    script.setAttribute('data-extra-path', CONFIG.extraEndpoint);

    script.onload = () => { script.remove(); resolve(); };
    script.onerror = (err) => { logError("Interceptor injection failed", err); resolve(); };
    (document.head || document.documentElement).appendChild(script);
  });
}

function waitForToken() {
  return new Promise((resolve) => {
    const existingToken = sessionStorage.getItem('rh_token');
    if (existingToken) {
      logInfo("Using existing token from session storage");
      resolve(existingToken);
      return;
    }

    logInfo("Waiting for token interception...");
    const messageListener = (event) => {
      if (event.source !== window) return;
      if (event.data?.type === 'ROBINHOOD_TOKEN_INTERCEPTED') {
        const token = event.data.token;
        sessionStorage.setItem('rh_token', token);
        window.removeEventListener('message', messageListener);
        logSuccess("Token captured from network message");
        resolve(token);
      }
    };
    window.addEventListener('message', messageListener);

    setTimeout(() => {
      window.removeEventListener('message', messageListener);
      resolve(null);
    }, 30000);
  });
}

// ===============================
// 🚀 PIPELINE 
// ===============================

async function fetchFullAccountData(accountNumber, accountLabel, cutoffDate, settings, setStatus, allAccountNumbers = [], globalRewards = [], globalBoosts = [], globalTransfers = []) {
  if (!accountNumber) return null;
  setStatus(`📋 Fetching ${accountLabel} data...`);
  
  const accountQuery = allAccountNumbers.length > 0 ? allAccountNumbers : [accountNumber];

  const [stockOrders, optionsOrders, dividends, transfers, lendingPayments, interestPayments] = await Promise.all([
    settings.transactions.stocks ? fetchStockOrders(accountNumber, cutoffDate) : [],
    settings.transactions.options ? fetchOptionsOrders(accountNumber, cutoffDate) : [],
    settings.transactions.stocks ? fetchDividends(accountNumber, cutoffDate) : [],
    settings.transactions.stocks ? fetchTransfers(cutoffDate) : [],
    settings.transactions.stocks ? fetchLendingPayments(accountQuery, cutoffDate) : [],
    settings.transactions.stocks ? fetchInterest(accountQuery, cutoffDate) : []
  ]);

  const filteredLending = lendingPayments.filter(p => p.account_number === accountNumber);
  filteredLending.forEach(p => p._isLending = true);

  const filteredInterest = interestPayments.filter(p => p.account_number === accountNumber);
  
  const filteredRewards = globalRewards.filter(r => {
    const accNum = r.data?.reward?.rhs_account_number;
    return accNum ? accNum === accountNumber : accountLabel === "Individual";
  });

  const filteredBoosts = globalBoosts.filter(b => b.account_number === accountNumber);

  return { 
    stockOrders, 
    optionsOrders, 
    dividends: [...dividends, ...filteredLending], 
    transfers,
    interest: filteredInterest,
    rewards: filteredRewards,
    boosts: filteredBoosts,
    unifiedTransfers: globalTransfers // Filtered in exporter but we can pass all
  };
}

async function resolveSymbolsForData(orders = [], dividends = []) {
  const instrumentUrls = [
    ...orders.map(o => o.instrument),
    ...dividends.map(d => d.instrument)
  ].filter(Boolean);
  const uniqueUrls = [...new Set(instrumentUrls)];
  if (!uniqueUrls.length) return new Map();
  const instrumentIds = uniqueUrls.map(url => url.split('/').filter(Boolean).pop());
  return await fetchInstruments(instrumentIds);
}

async function runRobinhoodPipeline(cutoffDate, statusEl) {
  const settings = await loadSettings();
  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  if (!window.location.href.includes('robinhood.com')) {
    throw new Error(`Please navigate to Robinhood first`);
  }

  const token = await waitForToken();
  if (!token) throw new Error("Could not find auth token. Try refreshing the page.");

  // 1. Discover all accounts
  setStatus("🔍 Discovering accounts...");
  const accounts = await fetchAccounts();
  if (!accounts.length) throw new Error("No accounts found.");

  const allAccountIds = accounts.map(a => a.account_number);
  
  // 2. Fetch Rewards globally once
  setStatus("🎁 Fetching rewards...");
  const globalRewards = await fetchRewards();

  setStatus("🚀 Fetching Gold boosts...");
  const globalBoosts = await fetchGoldBoosts();

  setStatus("💸 Fetching unified transfers...");
  const globalTransfers = await fetchUnifiedTransfers(cutoffDate);

  // Categorize accounts
  const individualAccounts = accounts.filter(a => a.brokerage_account_type === 'individual');
  const iraAccounts = accounts.filter(a => a.brokerage_account_type.startsWith('ira_'));

  // 3. Process Holdings
  if (settings.holdings.stocks) {
    for (const acc of accounts) {
      const label = acc.brokerage_account_type.replace('ira_', '').toUpperCase();
      setStatus(`📊 Fetching ${label} holdings...`);
      const positions = await fetchStockPositions(acc.account_number);
      if (positions?.results?.length) {
        const instrumentIds = positions.results.map(p => p.instrument_id).filter(Boolean);
        const priceMap = await fetchMarketQuotes(instrumentIds);
        exportHoldingsCSV(positions, priceMap, label.toLowerCase());
      }
    }
  }

  // Crypto
  if (settings.holdings.crypto) {
    setStatus("🪙 Fetching crypto holdings...");
    const cryptoPositions = await fetchCryptoPositions();
    if (cryptoPositions?.results?.length) exportCSV(cryptoPositions, "crypto", "crypto");
  }

  // 4. Process Individual Accounts (Orders, Dividends, etc.)
  for (const acc of individualAccounts) {
    const data = await fetchFullAccountData(acc.account_number, "Individual", cutoffDate, settings, setStatus, allAccountIds, globalRewards, globalBoosts, globalTransfers);
    if (data) {
      const symbolMap = await resolveSymbolsForData(data.stockOrders, data.dividends);
      exportTransactionsCSV(data.stockOrders, data.optionsOrders, "individual", symbolMap);
      exportDividendsCSV(data.dividends, "Individual", symbolMap);
      exportDepositsCSV(data.unifiedTransfers, acc.account_number, "individual");
      exportBonusCSV(data.dividends, data.transfers, data.interest, data.rewards, data.boosts, "individual");
    }
  }

  // 5. Process IRA Accounts (Merged Dividends, separate Orders)
  if (iraAccounts.length) {
    let allIraDivs = [];
    let allIraOrders = [];

    for (const acc of iraAccounts) {
      const label = acc.brokerage_account_type === 'ira_roth' ? 'Roth' : 'Traditional';
      const data = await fetchFullAccountData(acc.account_number, label, cutoffDate, settings, setStatus, allAccountIds, globalRewards, globalBoosts, globalTransfers);
      if (data) {
        allIraDivs.push(...data.dividends.map(d => ({ ...d, _entityLabel: label })));
        allIraOrders.push(...data.stockOrders);
        
        // Export separate orders/deposits for this IRA
        const symbolMap = await resolveSymbolsForData(data.stockOrders, data.dividends);
        exportTransactionsCSV(data.stockOrders, data.optionsOrders, label.toLowerCase(), symbolMap);
        exportDepositsCSV(data.unifiedTransfers, acc.account_number, label.toLowerCase());
        exportBonusCSV(data.dividends, data.transfers, data.interest, data.rewards, data.boosts, label.toLowerCase());
      }
    }

    if (allIraDivs.length) {
      const symbolMap = await resolveSymbolsForData(allIraOrders, allIraDivs);
      exportDividendsCSV(allIraDivs, "IRA", symbolMap);
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
  if (!sessionStorage.getItem('rh_clear_flag')) {
    sessionStorage.removeItem('rh_token');
    sessionStorage.setItem('rh_clear_flag', 'true');
  }
  injectInterceptor();
  (async () => {
    const token = await waitForToken();
    if (token) logSuccess("Token pre-captured on page load");
  })();
  const injectWhenReady = () => {
    if (document.body) createOverlay();
    else setTimeout(injectWhenReady, 50);
  };
  injectWhenReady();
};

init();
