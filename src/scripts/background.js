// ===============================
// 🛠️ BACKGROUND SERVICE WORKER (V11 - Total Rebuild)
// ===============================

import { CONFIG } from "../core/config.js";
import { logInfo, logError, logSuccess } from "../core/logger.js";

const sheetCache = {};
let spreadsheetMetadata = null;
// Active spreadsheet ID — updated per sync call based on sheetsOwner selection
let activeSpreadsheetId = CONFIG.googleSheets.spreadsheetId;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_BATCH') {
    const { items, sheetsOwner } = message.payload;
    // Pick the right spreadsheet from the owner key
    const ownerKey = sheetsOwner || "deepika_prod";
    activeSpreadsheetId = CONFIG.googleSheets.accounts[ownerKey]?.id
      || CONFIG.googleSheets.spreadsheetId;
    // Reset metadata cache when spreadsheet changes
    spreadsheetMetadata = null;
    logInfo(`Syncing to spreadsheet: ${ownerKey} → ${activeSpreadsheetId}`);
    handleBatchSync(items, sender.tab?.id).then(sendResponse);
    return true;
  }
});

async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        if (!interactive) getAuthToken(true).then(resolve).catch(reject);
        else reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

async function callSheetsAPI(endpoint, method, body = null, retries = 3, backoff = 5000) {
  const token = await getAuthToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${activeSpreadsheetId}${endpoint}`;
  const options = {
    method: method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  if (!response.ok) {
    let errMessage = "Sheets API Error";
    try {
      const err = await response.json();
      errMessage = err.error?.message || errMessage;
    } catch (e) {}

    const isRateLimit = response.status === 429 || (response.status === 403 && (errMessage.toLowerCase().includes('quota') || errMessage.toLowerCase().includes('rate')));

    if (isRateLimit && retries > 0) {
      logInfo(`Rate limit hit. Pausing for ${backoff}ms... (${errMessage})`);
      await new Promise(r => setTimeout(r, backoff));
      return callSheetsAPI(endpoint, method, body, retries - 1, backoff * 1.5);
    }
    
    throw new Error(errMessage);
  }
  return await response.json();
}

async function getSpreadsheetMetadata() {
  if (spreadsheetMetadata) return spreadsheetMetadata;
  const data = await callSheetsAPI('', 'GET');
  spreadsheetMetadata = data.sheets.map(s => ({ title: s.properties.title, id: s.properties.sheetId }));
  return spreadsheetMetadata;
}

async function ensureSheetExists(sheetName) {
  const meta = await getSpreadsheetMetadata();
  const existing = meta.find(m => m.title.toLowerCase() === sheetName.toLowerCase());
  if (existing) return existing.id;

  try {
    logInfo(`Creating sheet: ${sheetName}`);
    const res = await callSheetsAPI(':batchUpdate', 'POST', {
      requests: [{ addSheet: { properties: { title: sheetName } } }]
    });
    const newId = res.replies[0].addSheet.properties.sheetId;
    
    if (sheetName.includes("Raw Data")) {
       await callSheetsAPI(`/values/${encodeURIComponent(sheetName)}!A1:C1?valueInputOption=USER_ENTERED`, 'PUT', { 
         values: [["symbol", "stocks", "price"]] 
       });
    } else {
       await callSheetsAPI(`/values/${encodeURIComponent(sheetName)}!A1:V1?valueInputOption=USER_ENTERED`, 'PUT', { 
         values: [["Date", "Quantity", "Price", "Type", "", "", "", "", "", "", "", "Dividend", "", "Total", "", "Lending", "Total", "", "Date", "Quantity", "Price", "Type"]] 
       });
    }
    
    spreadsheetMetadata.push({ title: sheetName, id: newId });
    return newId;
  } catch (err) {
    if (err.message && err.message.includes("already exists")) {
       logInfo(`Sheet ${sheetName} already exists but wasn't in cache. Invalidating cache.`);
       spreadsheetMetadata = null; // Invalidate cache
       const newMeta = await getSpreadsheetMetadata();
       const newlyFound = newMeta.find(m => m.title.toLowerCase() === sheetName.toLowerCase());
       if (newlyFound) return newlyFound.id;
    }
    throw err;
  }
}

function normalizeDate(dateStr) {
  if (!dateStr) return "";
  // If already in DD/MM/YYYY format, return as-is (normalized)
  const alreadyFormatted = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr);
  if (alreadyFormatted) {
    const d = String(parseInt(alreadyFormatted[1], 10)).padStart(2, '0');
    const m = String(parseInt(alreadyFormatted[2], 10)).padStart(2, '0');
    const y = alreadyFormatted[3];
    return `${d}/${m}/${y}`;
  }
  // ISO date-only string "YYYY-MM-DD" — parse parts directly to avoid UTC shift
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (isoDate) {
    const y = isoDate[1];
    const m = isoDate[2];  // already zero-padded
    const d = isoDate[3];  // already zero-padded
    return `${d}/${m}/${y}`;
  }
  // Full ISO timestamp — parse in local timezone
  const dt = new Date(dateStr);
  if (isNaN(dt.getTime())) return dateStr;
  const d2 = String(dt.getDate()).padStart(2, '0');
  const m2 = String(dt.getMonth() + 1).padStart(2, '0');
  return `${d2}/${m2}/${dt.getFullYear()}`;
}

function sanitizeValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === 'object' && val.amount) return val.amount;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// Returns true if two DD/MM/YYYY date strings are within 1 calendar day of each other
function datesWithinOneDay(dateStrA, dateStrB) {
  if (!dateStrA || !dateStrB) return false;
  const parse = (s) => {
    const p = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!p) return NaN;
    return new Date(parseInt(p[3]), parseInt(p[2]) - 1, parseInt(p[1])).getTime();
  };
  const a = parse(dateStrA);
  const b = parse(dateStrB);
  if (isNaN(a) || isNaN(b)) return dateStrA === dateStrB;
  return Math.abs(a - b) <= 86400000; // 1 day in ms
}

// Shifts only specific columns down, leaving the rest of the row alone
function shiftAndInsert(values, startCol, endCol, newValues) {
  // Add a blank row at the bottom to accommodate the shift
  const blankRow = new Array(22).fill("");
  values.push(blankRow);
  
  // Shift everything down starting from row index 1 (just below header)
  for (let r = values.length - 1; r > 1; r--) {
    // Ensure both rows have 22 columns
    while (values[r].length < 22) values[r].push("");
    while (values[r-1].length < 22) values[r-1].push("");
    
    for (let c = startCol; c <= endCol; c++) {
      values[r][c] = values[r - 1][c] || "";
    }
  }
  
  // Insert new values at row index 1
  while (values[1].length < 22) values[1].push("");
  for (let c = startCol; c <= endCol; c++) {
    values[1][c] = newValues[c - startCol] || "";
  }
}

async function handleBatchSync(items, tabId) {
  const reportProgress = (text) => {
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'SYNC_PROGRESS', text }).catch(() => {});
    }
    logInfo(text);
  };

  try {
    const groups = {};
    for (const item of items) {
      if (!item.payload) continue;
      let sheetName;
      if (item.type === 'DEPOSIT') {
        sheetName = CONFIG.googleSheets.tabs.deposits;
      } else if (item.type === 'HOLDINGS') {
        const accountLabel = item.payload.accountLabel || "Individual";
        sheetName = accountLabel === "Individual" ? "Today's Stock Price - Raw Data" : `Today's ${accountLabel} IRA - Raw Data`;
      } else {
        const ticker = item.payload.ticker || "UNKNOWN";
        const accountLabel = item.payload.accountLabel || "Individual";
        sheetName = (ticker === "UNKNOWN") ? "UNKNOWN_FIX_REQUIRED" : (accountLabel === "Individual" ? ticker : `${ticker} - ${accountLabel}`);
      }
      if (!groups[sheetName]) groups[sheetName] = [];
      groups[sheetName].push(item);
    }

    const results = [];
    for (const [sheetName, groupItems] of Object.entries(groups)) {
      await ensureSheetExists(sheetName);
      
      // ==========================================
      // HOLDINGS PROCESSING (Direct Overwrite)
      // ==========================================
      if (sheetName.includes("Raw Data")) {
         reportProgress(`☁️ Updating ${sheetName} with current holdings...`);
         const rows = [["symbol", "stocks", "price"]];
         for (const item of groupItems) {
           rows.push([item.payload.ticker, item.payload.quantity, item.payload.price]);
         }
         console.log(`[HOLDINGS] Writing ${rows.length - 1} active positions to ${sheetName}`);
         // Clear existing data first
         await callSheetsAPI(`/values/${encodeURIComponent(sheetName)}!A:C:clear`, 'POST');
         // Put new data
         await callSheetsAPI(`/values/${encodeURIComponent(sheetName)}!A:C?valueInputOption=USER_ENTERED`, 'PUT', { values: rows });
         results.push({ sheetName, count: rows.length - 1 });
         continue;
      }

      // ==========================================
      // TRANSACTIONS PROCESSING (Surgical Shift)
      // ==========================================
      reportProgress(`☁️ Syncing data into ${sheetName}...`);
      const data = await callSheetsAPI(`/values/${encodeURIComponent(sheetName)}!A:V`, 'GET');
      const currentValues = data.values || [];
      if (currentValues.length === 0) currentValues.push(new Array(22).fill("")); // Ensure at least a header row exists
      
      for (let i = 0; i < currentValues.length; i++) {
        while (currentValues[i].length < 22) currentValues[i].push("");
      }

      let insertedCount = 0;
      const sortedItems = groupItems.slice().reverse();

      for (const item of sortedItems) {
        const p = item.payload;
        const normDate = normalizeDate(p.date);
        const cleanAmount = sanitizeValue(p.amount);
        const cleanPrice = sanitizeValue(p.price);
        const cleanQty = sanitizeValue(p.quantity);
        const side = (p.side || "N/A").charAt(0).toUpperCase() + (p.side || "n/a").slice(1).toLowerCase();

        const numAmount = parseFloat(cleanAmount) || 0;
        const numQty = parseFloat(cleanQty) || 0;
        const numPrice = parseFloat(cleanPrice) || 0;

        if (item.type === 'DIVIDEND') {
          const exists = currentValues.some(row => datesWithinOneDay(normalizeDate(row[11]), normDate) && Math.abs((parseFloat(row[13]) || 0) - numAmount) < 0.01);
          if (!exists) {
            console.log(`[DIVIDEND] Inserting: ${normDate} | Amount: ${numAmount} into ${sheetName}`);
            shiftAndInsert(currentValues, 11, 13, [normDate, "", numAmount]); // L (11), M (12), N (13)
            insertedCount++;
          } else {
            console.log(`[DIVIDEND] SKIPPING Duplicate: ${normDate} | Amount: ${numAmount} in ${sheetName}`);
          }
        } else if (item.type === 'LENDING') {
          const exists = currentValues.some(row => datesWithinOneDay(normalizeDate(row[15]), normDate) && Math.abs((parseFloat(row[16]) || 0) - numAmount) < 0.01);
          if (!exists) {
            console.log(`[LENDING] Inserting: ${normDate} | Amount: ${numAmount} into ${sheetName}`);
            shiftAndInsert(currentValues, 15, 16, [normDate, numAmount]); // P (15), Q (16)
            insertedCount++;
          } else {
            console.log(`[LENDING] SKIPPING Duplicate: ${normDate} | Amount: ${numAmount} in ${sheetName}`);
          }
        } else if (item.type === 'TRANSACTION') {
          if (p.note && p.note.includes("EXP")) {
             // OPTION (S-V -> 18-21)
             const exists = currentValues.some(row => datesWithinOneDay(normalizeDate(row[18]), normDate) && Math.abs((parseFloat(row[19]) || 0) - numQty) < 0.01 && Math.abs((parseFloat(row[20]) || 0) - numPrice) < 0.01);
             if (!exists) {
               console.log(`[OPTION] Inserting: ${normDate} | Qty: ${numQty} | Price: ${numPrice} | Side: ${side} into ${sheetName}`);
               shiftAndInsert(currentValues, 18, 21, [normDate, numQty, numPrice, side]);
               insertedCount++;
             } else {
               console.log(`[OPTION] SKIPPING Duplicate: ${normDate} | Qty: ${numQty} | Price: ${numPrice} in ${sheetName}`);
             }
          } else {
             // STOCK (A-D -> 0-3)
             const exists = currentValues.some(row => datesWithinOneDay(normalizeDate(row[0]), normDate) && Math.abs((parseFloat(row[1]) || 0) - numQty) < 0.01 && Math.abs((parseFloat(row[2]) || 0) - numPrice) < 0.01);
             if (!exists) {
               console.log(`[STOCK] Inserting: ${normDate} | Qty: ${numQty} | Price: ${numPrice} | Side: ${side} into ${sheetName}`);
               shiftAndInsert(currentValues, 0, 3, [normDate, numQty, numPrice, side]);
               insertedCount++;
             } else {
               console.log(`[STOCK] SKIPPING Duplicate: ${normDate} | Qty: ${numQty} | Price: ${numPrice} in ${sheetName}`);
             }
          }
        } else if (item.type === 'DEPOSIT') {
           const exists = currentValues.some(row => datesWithinOneDay(normalizeDate(row[0]), normDate) && Math.abs((parseFloat(row[1]) || 0) - numAmount) < 0.01);
           if (!exists) {
             console.log(`[DEPOSIT] Inserting: ${normDate} | Amount: ${numAmount} into ${sheetName}`);
             shiftAndInsert(currentValues, 0, 2, [normDate, numAmount, p.note || ""]);
             insertedCount++;
           } else {
             console.log(`[DEPOSIT] SKIPPING Duplicate: ${normDate} | Amount: ${numAmount} in ${sheetName}`);
           }
        }
      }

      if (insertedCount > 0) {
        logInfo(`Surgically shifted and inserted ${insertedCount} items in ${sheetName}`);
        await callSheetsAPI(`/values/${encodeURIComponent(sheetName)}!A:V?valueInputOption=USER_ENTERED`, 'PUT', {
          values: currentValues
        });
      }
      results.push({ sheetName, count: insertedCount });
      
      // Throttle sheet processing to prevent bursting the API and hitting quotas
      await new Promise(r => setTimeout(r, 1500));
    }

    return { success: true, results };
  } catch (err) {
    logError("Sync Failed:", err.message);
    return { success: false, error: err.message };
  }
}
