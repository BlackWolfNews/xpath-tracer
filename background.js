let db;
let isCapturing = false;
let captureTabId = null;
let grouped = {};
let dbPromise = initDB();

dbPromise.then((database) => {
  db = database;
  console.log("DB initialized");
}).catch((error) => {
  console.error("DB initialization failed:", error);
  reportError("Database failed to initialize");
});

browser.contextMenus.remove("toggle-capture").then(
  () => {
    browser.contextMenus.create(
      { id: "toggle-capture", title: "Toggle Capture", contexts: ["all"] },
      () => console.log("Context menu created")
    );
  },
  () => {
    browser.contextMenus.create(
      { id: "toggle-capture", title: "Toggle Capture", contexts: ["all"] },
      () => console.log("Context menu created")
    );
  }
);

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Log every incoming message for debugging
  console.log("Background received message:", message);

  // Handle Alt-Click data without a specific action (legacy relay)
  if (
    message.data &&
    message.url &&
    message.action !== "saveData" &&
    message.action !== "relayData"
  ) {
    console.log("Relaying alt-click data to management");
    browser.runtime
      .sendMessage({ data: message.data, url: message.url })
      .then(() => console.log("Relay to management succeeded"))
      .catch((err) => {
        const errorMsg = err?.message ? "Relay failed: " + err.message : "Relay failed: Unknown";
        reportError(errorMsg);
        console.error("Relay to management failed:", err);
      });
  } 
  // Relay and save Alt-Click data
  else if (message.action === "relayData") {
    console.log("Relaying sidebar data to management");
    browser.runtime.sendMessage({ data: message.data, url: message.url });
    dbPromise.then((db) => {
      const xpathTx = db.transaction(["xpaths"], "readwrite");
      const xpathStore = xpathTx.objectStore("xpaths");
      const entry = message.data;
      entry.url = message.url;
      entry.id = entry.id || `${entry.url}-${entry.xpath || Date.now()}`;
      entry.xpathSuccess = entry.xpathSuccess || 0;
      entry.xpathFails = entry.xpathFails || 0;
      entry.cssSelectorSuccess = entry.cssSelectorSuccess || 0;
      entry.cssSelectorFails = entry.cssSelectorFails || 0;
      entry.cssPathSuccess = entry.cssPathSuccess || 0;
      entry.cssPathFails = entry.cssPathFails || 0;
      entry.lastUpdated = Date.now();

      const getRequest = xpathStore.get(entry.id);
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (existing) {
          if (entry.results) {
            existing.xpathSuccess += entry.results.xpath ? 1 : 0;
            existing.xpathFails += entry.results.xpath ? 0 : 1;
            existing.cssSelectorSuccess += entry.results.cssSelector ? 1 : 0;
            existing.cssSelectorFails += entry.results.cssSelector ? 0 : 1;
            existing.cssPathSuccess += entry.results.cssPath ? 1 : 0;
            existing.cssPathFails += entry.results.cssPath ? 0 : 1;
          }
          existing.lastUpdated = Date.now();
          xpathStore.put(existing);
        } else {
          xpathStore.put(entry);
        }
      };
      getRequest.onerror = (err) => console.error("Failed to check existing entry:", err);

      if (db.objectStoreNames.contains("changes")) {
        const changeTx = db.transaction(["changes"], "readwrite");
        const changeStore = changeTx.objectStore("changes");
        const changeEntry = {
          pathId: entry.id,
          time: Date.now(),
          results: entry.results || {},
          changes: { value: entry.value || "" }
        };
        changeStore.add(changeEntry).onerror = (err) => console.error("Failed to log change:", err);
      }

      xpathTx.oncomplete = () => loadXPaths();
      xpathTx.onerror = (err) => console.error("XPath transaction failed:", err);
    }).catch((err) => console.error("DB access failed:", err));
  }
  // Handle log messages from other scripts
  else if (message.action === "logMessage") {
    if (!message.message) {
      console.error("No message provided for logMessage");
      return;
    }
    dbPromise.then((db) => {
      const tx = db.transaction(["logs"], "readwrite");
      const store = tx.objectStore("logs");
      const logEntry = {
        id: Date.now(),
        time: Date.now(),
        message: String(message.message)
      };
      const request = store.add(logEntry);
      request.onsuccess = () => {
        debugLog("Log saved to IndexedDB: " + JSON.stringify(logEntry));
      };
      request.onerror = (err) => {
        console.error("Failed to save log to IndexedDB:", err);
      };
    }).catch((err) => {
      reportError("DB access failed for logMessage: " + err.message);
    });
  }
  // Export all logs from IndexedDB for download
  else if (message.action === "exportLogs") {
    console.log("Export logs request received");
    dbPromise.then((db) => {
      const transaction = db.transaction(["logs"], "readonly");
      const store = transaction.objectStore("logs");
      const request = store.getAll();
      request.onsuccess = () => {
        const logs = request.result;
        debugLog("Exporting logs: " + logs.length + " entries");
        browser.runtime.sendMessage({
          action: "logsExported",
          data: JSON.stringify(logs, null, 2)
        });
      };
      request.onerror = (err) => {
        console.error("Failed to export logs:", err);
        reportError("Failed to export logs from database");
      };
    }).catch((err) => {
      console.error("DB access failed during exportLogs:", err);
      reportError("Database access failed during logs export");
    });
  }
  // Store an encryption key in IndexedDB
  else if (message.action === "setKey") {
    dbPromise.then((db) => {
      const tx = db.transaction(["keyStore"], "readwrite");
      const store = tx.objectStore("keyStore");
      store.put({ id: "encryptionKey", value: message.password });
      console.log("Encryption key stored in IndexedDB");
      browser.runtime.sendMessage({ action: "keySet" });
    });
  }
  // Save explicit data (e.g., from sidebar) with detailed stats
  else if (message.action === "saveData" && message.url && message.data) {
    dbPromise.then((db) => {
      const transaction = db.transaction(["xpaths"], "readwrite");
      const store = transaction.objectStore("xpaths");
      const entry = message.data;
      entry.url = message.url;
      entry.id = entry.id || Date.now();
      entry.xpathSuccess = entry.xpathSuccess || 0;
      entry.xpathFails = entry.xpathFails || 0;
      entry.cssSelectorSuccess = entry.cssSelectorSuccess || 0;
      entry.cssSelectorFails = entry.cssSelectorFails || 0;
      entry.cssPathSuccess = entry.cssPathSuccess || 0;
      entry.cssPathFails = entry.cssPathFails || 0;
      entry.lastUpdated = Date.now();
      const checkRequest = store.getAll();
      checkRequest.onsuccess = () => {
        const existing = checkRequest.result.find(
          (e) => e.xpath === entry.xpath && e.url === entry.url
        );
        if (existing) {
          console.log("Duplicate entry skipped:", entry.xpath, entry.url);
        } else {
          const putRequest = store.put(entry);
          putRequest.onsuccess = () => {
            debugLog("Data saved to IndexedDB: " + JSON.stringify(entry));
            loadXPaths();
          };
          putRequest.onerror = (err) => console.error("Save failed:", err);
        }
      };
      checkRequest.onerror = (err) => console.error("GetAll failed:", err);
    }).catch((err) => console.error("DB access failed:", err));
  }
  // Delete an entry from IndexedDB
  else if (message.action === "deleteData") {
    dbPromise.then((db) => {
      const transaction = db.transaction(["xpaths"], "readwrite");
      const store = transaction.objectStore("xpaths");
      store.delete(message.data.id);
      transaction.oncomplete = () => {
        console.log("Deleted from IndexedDB, ID:", message.data.id);
        loadXPaths();
      };
    });
  }
  // Toggle capture mode on/off in content.js
  else if (message.action === "toggleCapture") {
    console.log(
      "Toggle capture received, enabled:",
      message.enabled,
      "for tab:",
      message.tabId
    );
    isCapturing = message.enabled;
    captureTabId = message.enabled ? message.tabId : null;
    browser.tabs.sendMessage(message.tabId, {
      action: "toggleCapture",
      enabled: message.enabled,
    });
    console.log("Toggle sent to content script");
  }
  // Save page context from sidebar.js
  else if (message.action === "pageSet") {
    console.log("Page set received:", message);
    dbPromise.then((db) => {
      const transaction = db.transaction(["xpaths"], "readwrite");
      const store = transaction.objectStore("xpaths");
      const entry = {
        id: Date.now(),
        state: message.currentState,
        page: message.currentPage,
        section: message.currentSection,
        subsection: message.subsection,
        url: message.url,
        lastUpdated: Date.now()
      };
      const putRequest = store.put(entry);
      putRequest.onsuccess = () => {
        debugLog("Page context saved to IndexedDB: " + JSON.stringify(entry));
        loadXPaths();
      };
      putRequest.onerror = (err) => console.error("Page set save failed:", err);
    }).catch((err) => console.error("DB access failed:", err));
  }
  // Load all XPath entries from IndexedDB
  else if (message.action === "loadXPaths") {
    console.log("Loading XPaths");
    dbPromise.then((db) => {
      const transaction = db.transaction(["xpaths"], "readonly");
      const store = transaction.objectStore("xpaths");
      const request = store.getAll();
      request.onsuccess = () => {
        console.log("XPaths loaded:", request.result);
        grouped = request.result.reduce((acc, entry) => {
          const state = entry.state || "Unnamed Workflow";
          const page = entry.page || "Default Page";
          const section = entry.section || "Default Section";
          acc[state] = acc[state] || {};
          acc[state][page] = acc[state][page] || {};
          acc[state][page][section] = acc[state][page][section] || [];
          acc[state][page][section].push(entry);
          return acc;
        }, {});
        browser.runtime.sendMessage({
          action: "xpathsLoaded",
          data: request.result,
        });
      };
      request.onerror = (err) => {
        console.error("Failed to load XPaths:", err);
        reportError("Failed to load XPaths from database");
      };
    }).catch((err) => {
      console.error("DB access failed:", err);
      reportError("Database access failed during loadXPaths");
    });
  }
  // Return current capture state to requester
  else if (message.action === "getCaptureState") {
    sendResponse({ enabled: isCapturing, tabId: captureTabId });
    return true; // Keep message channel open for async response
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    console.log("Tab updated, URL changed from", null, "to", changeInfo.url);
    browser.runtime.sendMessage({
      action: "urlChanged",
      url: changeInfo.url,
      tabId,
    });
  }
});

function loadXPaths() {
  dbPromise.then((db) => {
    const transaction = db.transaction(["xpaths"], "readonly");
    const store = transaction.objectStore("xpaths");
    const request = store.getAll();
    request.onsuccess = () => {
      grouped = request.result.reduce((acc, entry) => {
        const state = entry.state || "Unnamed Workflow";
        const page = entry.page || "Default Page";
        const section = entry.section || "Default Section";
        acc[state] = acc[state] || {};
        acc[state][page] = acc[state][page] || {};
        acc[state][page][section] = acc[state][page][section] || [];
        acc[state][page][section].push(entry);
        return acc;
      }, {});
      browser.runtime.sendMessage({
        action: "xpathsLoaded",
        data: request.result,
      });
    };
  });
}

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("XPathDB", 3);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (event.oldVersion < 1) {
        db.createObjectStore("xpaths", { keyPath: "id" });
        db.createObjectStore("key", { keyPath: "id" });
      }
      if (event.oldVersion < 2) {
        db.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
      }
      if (event.oldVersion < 3) {
        db.createObjectStore("changes", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function debugLog(message) {
  console.log(message);
  dbPromise.then((db) => {
    const transaction = db.transaction(["logs"], "readwrite");
    const store = transaction.objectStore("logs");
    const entry = {
      id: Date.now(),
      time: Date.now(),
      message: message
    };
    const request = store.add(entry);
    request.onerror = (err) => console.error("Failed to save log:", err);
  }).catch((err) => console.error("DB access failed in debugLog:", err));
}

function reportError(message) {
  debugLog("ERROR: " + message);
  browser.runtime.sendMessage({ action: "error", message });
}

browser.browserAction.onClicked.addListener(() => {
  console.log("Browser action clicked, opening management tab");
  browser.tabs.create({ url: browser.runtime.getURL("management.html") });
});