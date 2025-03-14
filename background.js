let db;
let isCapturing = false;
let captureTabId = null;
let grouped = {};
let dbPromise = initDB();

dbPromise.then((database) => {
  db = database;
  console.log("DB initialized");
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
      .sendMessage({ data: message.data, url: message.url }) // Send to management.js or sidebar.js
      .then(() => console.log("Relay to management succeeded"))
      .catch((err) => {
        const errorMsg = err?.message ? "Relay failed: " + err.message : "Relay failed: Unknown";
        reportError(errorMsg); // Log error to IndexedDB and notify UI
        console.error("Relay to management failed:", err);
      });
  } 
  // Handle Alt-Click data with "relayData" action from content.js, relay and save it
  else if (message.action === "relayData") {
    console.log("Relaying sidebar data to management");
    browser.runtime
      .sendMessage({ data: message.data, url: message.url })
      .then(() => console.log("Relay to management succeeded"))
      .catch((err) => {
        const errorMsg = err?.message ? "Relay failed: " + err.message : "Relay failed: Unknown";
        reportError(errorMsg);
        console.error("Relay to management failed:", err);
      });
  
    dbPromise.then((db) => {
      const xpathTx = db.transaction(["xpaths"], "readwrite");
      const xpathStore = xpathTx.objectStore("xpaths");
      const entry = message.data;
      entry.url = message.url;
      entry.id = entry.id || `${entry.url}-${entry.xpath || Date.now()}`; // Consistent ID, fallback if no xpath
      // Initialize stats if new
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
          // Update stats only if results provided
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
          // Save new path
          xpathStore.put(entry);
        }
      };
      getRequest.onerror = (err) => console.error("Failed to check existing entry:", err);
  
      // Log changes separately if changes store exists
      if (db.objectStoreNames.contains("changes")) {
        const changeTx = db.transaction(["changes"], "readwrite");
        const changeStore = changeTx.objectStore("changes");
        const changeEntry = {
          pathId: entry.id,
          time: Date.now(),
          results: entry.results || {}, // Pass/fail and timing, default empty if missing
          changes: { value: entry.value || "" } // Log value changes, default empty
        };
        changeStore.add(changeEntry).onerror = (err) => console.error("Failed to log change:", err);
      }
  
      xpathTx.oncomplete = () => loadXPaths();
      xpathTx.onerror = (err) => console.error("XPath transaction failed:", err);
    }).catch((err) => console.error("DB access failed:", err));
  }
  // Store an encryption key in IndexedDB
  else if (message.action === "setKey") {
    dbPromise.then((db) => {
      const tx = db.transaction(["keyStore"], "readwrite");
      const store = tx.objectStore("keyStore");
      store.put({ id: "encryptionKey", value: message.password }); // Save key with fixed ID
      console.log("Encryption key stored in IndexedDB");
      browser.runtime.sendMessage({ action: "keySet" }); // Notify UI of success
    });
  } 
  // Save explicit data (e.g., from sidebar) with detailed stats
  else if (message.action === "saveData" && message.url && message.data) {
    dbPromise.then((db) => {
      const transaction = db.transaction(["xpaths"], "readwrite");
      const store = transaction.objectStore("xpaths");
      const entry = message.data; // Data object from sender
      entry.url = message.url; // Add URL to the entry
      entry.id = entry.id || Date.now(); // Use existing ID or generate new one
      entry.xpathSuccess = entry.xpathSuccess || 0; // Track successful XPath uses
      entry.xpathFails = entry.xpathFails || 0; // Track failed XPath uses
      entry.cssSelectorSuccess = entry.cssSelectorSuccess || 0; // Track CSS selector successes
      entry.cssSelectorFails = entry.cssSelectorFails || 0; // Track CSS selector failures
      entry.cssPathSuccess = entry.cssPathSuccess || 0; // Track CSS path successes
      entry.cssPathFails = entry.cssPathFails || 0; // Track CSS path failures
      entry.lastUpdated = Date.now(); // Update timestamp
      const checkRequest = store.getAll(); // Check for duplicates
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
            loadXPaths(); // Refresh UI
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
      store.delete(message.data.id); // Remove entry by ID
      transaction.oncomplete = () => {
        console.log("Deleted from IndexedDB, ID:", message.data.id);
        loadXPaths(); // Refresh UI
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
    isCapturing = message.enabled; // Set global capture state
    captureTabId = message.enabled ? message.tabId : null; // Track active tab
    browser.tabs.sendMessage(message.tabId, { // Notify content.js
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
      const entry = { // Build entry from message
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
        loadXPaths(); // Refresh sidebar and management
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
      const request = store.getAll(); // Fetch all entries
      request.onsuccess = () => {
        console.log("XPaths loaded:", request.result);
        grouped = request.result.reduce((acc, entry) => { // Group by state, page, section
          const state = entry.state || "Unnamed Workflow";
          const page = entry.page || "Default Page";
          const section = entry.section || "Default Section";
          acc[state] = acc[state] || {};
          acc[state][page] = acc[state][page] || {};
          acc[state][page][section] = acc[state][page][section] || [];
          acc[state][page][section].push(entry);
          return acc;
        }, {});
        browser.runtime.sendMessage({ // Send data to UI
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
  // Export all logs from IndexedDB for download
  else if (message.action === "exportLogs") {
    console.log("Export logs request received");
    dbPromise.then((db) => {
      const transaction = db.transaction(["logs"], "readonly");
      const store = transaction.objectStore("logs");
      const request = store.getAll(); // Fetch all log entries
      request.onsuccess = () => {
        const logs = request.result;
        debugLog("Exporting logs: " + logs.length + " entries");
        browser.runtime.sendMessage({ // Send JSON string to management.js
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
  } else if (message.action === "exportLogs") {
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
  } else if (message.action === "getCaptureState") {
    sendResponse({ enabled: isCapturing, tabId: captureTabId });
    return true;
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
    const request = indexedDB.open("XPathDB", 3); // Bump version
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
        db.createObjectStore("changes", { keyPath: "id", autoIncrement: true }); // New store for deltas
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function reportError(message) {
  debugLog("ERROR: " + message); // Route errors through debugLog
  browser.runtime.sendMessage({ action: "error", message });
}

dbPromise.catch((error) => {
  console.error("DB initialization failed:", error);
  reportError("Database failed to initialize");
});

browser.browserAction.onClicked.addListener(() => {
  console.log("Browser action clicked, opening management tab");
  browser.tabs.create({ url: browser.runtime.getURL("management.html") });
});

function debugLog(message) {
  console.log(message);
  dbPromise.then((db) => {
    const transaction = db.transaction(["logs"], "readwrite");
    const store = transaction.objectStore("logs");
    const entry = {
      id: Date.now(), // Unique ID for each log entry
      time: Date.now(),
      message: message
    };
    const request = store.add(entry);
    request.onerror = (err) => console.error("Failed to save log:", err);
  }).catch((err) => console.error("DB access failed in debugLog:", err));
}