# Robinhood Data Exporter v2.0

A Chrome extension to fetch and export Robinhood forex quotes and stock positions directly from your browser session.

## 🚀 Quick Start (Automated)

Run the following command in your terminal to install dependencies and build the extension:

```bash
chmod +x setup.sh && ./setup.sh
```

## 🛠 Manual Installation

If you prefer to do it manually:

1.  **Install Node.js**: Ensure you have Node.js (v18+) installed.
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Build the extension**:
    ```bash
    node build.js
    ```
4.  **Load in Chrome**:
    - Open Chrome and navigate to `chrome://extensions/`.
    - Enable "Developer mode" (top right).
    - Click "Load unpacked" and select the `Robinhood2` folder.

## 📡 Dynamic Token Extraction

This version (2.0) introduces **Dynamic Token Extraction**. 
- It automatically intercepts the authentication token from your active Robinhood session.
- No more hardcoding or manual token updates.
- Simply log in to [Robinhood](https://robinhood.com/) and the extension will capture the token from the background API calls.

## 📂 Project Structure

- `src/interceptor.js`: Monkey-patches `fetch` to capture the `Authorization` header.
- `src/content.js`: Injects the interceptor and manages the data pipeline.
- `src/api.js`: Handles communication with Robinhood's REST API.
- `src/auth.js`: Manages token retrieval from `sessionStorage`.
- `dist/`: Contains the bundled files for Chrome (generated after build).

## 📄 License
ISC
