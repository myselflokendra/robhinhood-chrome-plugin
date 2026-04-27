# Robinhood Data Exporter — Chrome Extension

A Chrome extension that exports your Robinhood portfolio data to CSV files and optionally syncs to Google Sheets. Supports multiple accounts (Individual, Roth IRA, Traditional IRA), full transaction history with pagination, and real-time pricing.

---

## ✨ Features

| Category | Details |
|---|---|
| **Holdings** | Current stock positions with live extended-hours prices (pre-market/after-hours preferred) |
| **Transactions** | Stocks + Options merged into one CSV — Date, Quantity, Price, Type (Buy/Sell), Entity, Symbol |
| **Dividends** | Stock dividends + lending payments with symbol resolution; IRA Roth + Traditional merged |
| **Amount Deposited** | Unified transfers via Robinhood's paymenthub API — ACH, credit card cashbacks, IRA conversions |
| **Bonus Credits** | Interest sweeps, Gold deposit boosts, Learn & Earn rewards, referrals |
| **Multi-account** | Dynamically detects Individual, Roth IRA, Traditional IRA accounts |
| **Google Sheets sync** | Pushes data surgically (no duplicates) into per-ticker sheets |
| **CSV on/off** | Toggle CSV downloads independently from Sheets sync |
| **Date cutoff** | "From Date" picker persists across sessions |

---

## 🗂 CSV Output Files

| File | Columns |
|---|---|
| `individual_holdings.csv` | symbol, stocks, price |
| `roth_holdings.csv` | symbol, stocks, price |
| `individual_orders.csv` | Date, Quantity, Price, Type, Entity, Symbol |
| `roth_orders.csv` | Date, Quantity, Price, Type, Entity, Symbol |
| `Individual_dividends.csv` | Dividend, Type, Total, Symbol, Entity |
| `IRA_dividends.csv` | Dividend, Type, Total, Symbol, Entity |
| `individual_amount_deposited.csv` | date, price, type, entity, symbol |
| `individual_bonus_credits.csv` | date, price, type, entity, symbol |
| `crypto_crypto.csv` | id, code, name, quantity, cost_basis, updated_at |

---

## 🔧 Build & Install

### Prerequisites
- Node.js v18+

### Steps

```bash
npm install
node build.js
```

Then in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder

### Development (auto-rebuild on save)
```bash
node watch.js
```

---

## 🚀 Usage

1. Navigate to [robinhood.com/account/investing](https://robinhood.com/account/investing)
2. Click the **EXPORTER** tab on the right edge of the page
3. Select which data to export per account section (Individual / IRA)
4. Set a **From Date** — saved between sessions automatically
5. Toggle **Download CSV** on/off as needed
6. Optionally enable **Sync to Google Sheets** and pick the target account from the dropdown
7. Click **Download & Sync**

---

## ☁️ Google Sheets Sync

Choose the target spreadsheet from the **Sheets Account** dropdown (visible when Sync is enabled):

| Option | Target |
|---|---|
| Deepika — Production | Deepika's live portfolio sheet |
| Lokendra — Production | Lokendra's live portfolio sheet |
| Lokendra — Test | Lokendra's test/staging sheet |

Data is synced surgically — new rows are inserted at the top, existing data is shifted down, and duplicates are skipped (matched within 1 calendar day + amount tolerance). Holdings overwrite the Raw Data sheet directly.

**Sheet column layout (per-ticker sheets):**
```
A–D   Stock transactions  (Date, Qty, Price, Side)
L–N   Dividends           (Date, —, Amount)
P–Q   Lending payments    (Date, Amount)
S–V   Options             (Date, Qty, Price, Side)
```

---

## 🏗 Project Structure

```
src/
  api/
    api.js          — All Robinhood REST API calls + pagination
    auth.js         — Token from sessionStorage
    sheets.js       — Google Sheets client helpers
  core/
    config.js       — Spreadsheet IDs, default settings
    exporter.js     — CSV normalizers + download helpers
    logger.js       — Console logging utilities
  scripts/
    content.js      — UI + pipeline orchestrator (injected into Robinhood page)
    interceptor.js  — fetch patch to capture auth token
    background.js   — Service worker: Google Sheets batch sync engine
  ui/
    popup.html      — Drawer panel markup
    popup.css       — Panel styles
dist/               — Bundled output (load this folder as unpacked extension)
build.js            — esbuild bundler
watch.js            — Dev file watcher
manifest.json       — Chrome MV3 manifest
```

---

## 🐛 Known Limitations

- Crypto transactions are not included in the orders CSV (holdings only for now)
- Amount Deposited uses best-effort account matching; if unified_transfers IDs don't match the account number, all transfers are shown as a fallback with a console warning
- Google Sheets sync requires OAuth consent on first use

---

## 📄 License

ISC
