// ===============================
// 🧭 CONTENT SCRIPT ENTRY POINT
// ===============================

import { fetchStockPositions, fetchMarketQuotes, fetchCryptoPositions, fetchOptionsOrders, fetchStockOrders } from "./api.js";
import { exportHoldingsCSV, exportTransactionsCSV, exportCSV } from "./exporter.js";
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
    launcher.innerHTML = '🗂️';
    launcher.title = 'Open Robinhood Exporter';
    document.body.appendChild(launcher);

    // Initialize checkbox states from saved settings
    document.getElementById('hold_stocks').checked = !!settings.holdings.stocks;
    document.getElementById('hold_crypto').checked = !!settings.holdings.crypto;
    document.getElementById('tx_stocks').checked = !!settings.transactions.stocks;
    document.getElementById('tx_options').checked = !!settings.transactions.options;

    launcher.addEventListener('click', () => container.classList.toggle('visible'));

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
// 🚀 PIPELINE (per account)
// ===============================

async function runAccountPipeline(accountNumber, accountLabel, cutoffDate, settings, setStatus) {
  logInfo(`Running pipeline for ${accountLabel}`, { accountNumber, cutoffDate });

  // Holdings
  if (settings.holdings.stocks) {
    setStatus(`📊 Fetching ${accountLabel} holdings...`);
    const positions = await fetchStockPositions(accountNumber);
    if (positions?.results?.length) {
      const instrumentIds = positions.results.map(p => p.instrument_id).filter(Boolean);
      const priceMap = await fetchMarketQuotes(instrumentIds);
      exportHoldingsCSV(positions, priceMap, accountLabel);
      logSuccess(`${accountLabel} holdings exported`);
    }
  }

  // Crypto (not account-specific — same for both, exported once)
  if (settings.holdings.crypto && accountLabel === "normal") {
    setStatus(`🪙 Fetching crypto holdings...`);
    const cryptoPositions = await fetchCryptoPositions();
    if (cryptoPositions?.results?.length) {
      exportCSV(cryptoPositions, "crypto", "crypto");
    }
  }

  // Transactions (stocks + options merged)
  if (settings.transactions.stocks || settings.transactions.options) {
    setStatus(`📋 Fetching ${accountLabel} transactions...`);
    const stockOrders = settings.transactions.stocks
      ? await fetchStockOrders(accountNumber, cutoffDate)
      : [];
    const optionsOrders = settings.transactions.options
      ? await fetchOptionsOrders(accountNumber, cutoffDate)
      : [];
    if (stockOrders.length || optionsOrders.length) {
      exportTransactionsCSV(stockOrders, optionsOrders, accountLabel);
      logSuccess(`${accountLabel} transactions exported`);
    }
  }
}

async function runRobinhoodPipeline(cutoffDate, statusEl) {
  const settings = await loadSettings();
  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  if (!window.location.href.includes('robinhood.com')) {
    throw new Error(`Please navigate to Robinhood first`);
  }

  const token = await waitForToken();
  if (!token) {
    throw new Error("Could not find auth token. Try refreshing the page.");
  }

  await runAccountPipeline(CONFIG.normalAccountNumber, "normal", cutoffDate, settings, setStatus);
  await runAccountPipeline(CONFIG.rothAccountNumber, "roth", cutoffDate, settings, setStatus);

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
    if (document.body) {
      createOverlay();
    } else {
      setTimeout(injectWhenReady, 50);
    }
  };

  injectWhenReady();
};

init();
