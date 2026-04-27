// ===============================
// 📊 GOOGLE SHEETS API CLIENT
// ===============================

import { CONFIG } from "../core/config.js";
import { logInfo, logError, logSuccess } from "../core/logger.js";

/**
 * Get OAuth2 Access Token
 */
export async function getGoogleAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        logError("OAuth2 Error:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        logSuccess("Google OAuth2 Token acquired");
        resolve(token);
      }
    });
  });
}

/**
 * Append a row to a Google Sheet
 */
export async function appendSheetRow(sheetName, rowData) {
  const token = await getGoogleAuthToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.googleSheets.spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [rowData]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    logError(`Failed to append to ${sheetName}:`, err);
    throw new Error(`Sheets API error: ${err.error.message}`);
  }

  logSuccess(`Data appended to sheet: ${sheetName}`);
}

/**
 * Get sheet values to check for duplicates
 */
export async function getSheetValues(range) {
  const token = await getGoogleAuthToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.googleSheets.spreadsheetId}/values/${encodeURIComponent(range)}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) return [];
  const data = await response.json();
  return data.values || [];
}

/**
 * Sync a Dividend payment to a ticker sheet
 * Dividends in the user's sheet are in Column L (12th column)
 */
export async function syncDividendToSheet(ticker, date, amount, accountLabel) {
  const sheetName = accountLabel === "Individual" ? ticker : `${ticker} - ${accountLabel}`;
  logInfo(`Syncing dividend for ${ticker} on ${date}...`);

  const values = await getSheetValues(`${sheetName}!A:L`);
  if (!values.length) {
    logError(`Sheet ${sheetName} not found or empty`);
    return;
  }

  // Find the row by date (Column A is usually date)
  // Note: Date format in sheet might be MM/DD/YYYY, Robinhood is YYYY-MM-DD
  const formattedDate = new Date(date).toLocaleDateString('en-US');
  
  let rowIndex = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === formattedDate) {
      rowIndex = i + 1; // 1-indexed
      break;
    }
  }

  if (rowIndex === -1) {
    logInfo(`Date ${formattedDate} not found in ${sheetName}. Appending new row...`);
    // Format: [Date, Ticker, Buy/Sell, Quantity, Price, Comm, Total, State, Zip, Yield, Cost, Dividend]
    // We only have Date and Dividend here. The rest might need manual entry or more Robinhood data.
    const newRow = [formattedDate, ticker, "DIVIDEND", "", "", "", "", "", "", "", "", amount];
    await appendSheetRow(sheetName, newRow);
  } else {
    logInfo(`Updating row ${rowIndex} in ${sheetName} with dividend ${amount}`);
    await updateCell(`${sheetName}!L${rowIndex}`, amount);
  }
}

async function updateCell(range, value) {
  const token = await getGoogleAuthToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.googleSheets.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [[value]] })
  });
}
