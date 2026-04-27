import { logInfo, logSuccess, logError } from "../core/logger.js";

(function () {
  logInfo("Initializing Robinhood fetch interceptor...");

  // Get configuration passed from content.js
  const scriptTag = document.currentScript;
  const userPath = scriptTag?.getAttribute('data-user-path') || '/user';
  const inboxPath = scriptTag?.getAttribute('data-inbox-path') || '/inbox/threads/';
  const extraPath = scriptTag?.getAttribute('data-extra-path') || '/live_frontend_log_events';

  logInfo(`Monitoring for calls matching "${userPath}", "${inboxPath}" or "${extraPath}"`);

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    let resource = args[0];
    let config = args[1] || {};
    let url = typeof resource === 'string' ? resource : (resource?.url || '');

    const isMatch = url && (url.includes(userPath) || url.includes(inboxPath) || url.includes(extraPath));

    if (isMatch) {
      logInfo(`Matched Robinhood API call: ${url}`);

      let authHeader = "";
      const headers = config.headers || (resource instanceof Request ? resource.headers : null);

      if (headers) {
        if (typeof headers.get === 'function') {
          authHeader = headers.get('Authorization') || headers.get('authorization');
        } else {
          authHeader = headers['Authorization'] || headers['authorization'];
        }
      }

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        logSuccess("🔑 Token successfully extracted from network call!");

        // Notify content script
        window.postMessage({
          type: 'ROBINHOOD_TOKEN_INTERCEPTED',
          token: token
        }, '*');
      }
    }

    return originalFetch(...args);
  };

  logSuccess("Interceptor is now active and monkey-patching window.fetch");
})();
