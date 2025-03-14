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
  console.log("Background received message:", message);
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
        const errorMsg = err?.message
          ? "Relay failed: " + err.message
          : "Relay failed: Unknown";
        reportError(errorMsg);
        console.error("Relay to management failed:", err);
      });
  } else if (message.action === "relayData") {
    console.log("Relaying sidebar data to management");
    browser.runtime
      .sendMessage({ data: message.data, url: message.url })
      .then(() => console.log("Relay to management succeeded"))
      .catch((err) => {
        const errorMsg = err?.message
          ? "Relay failed: " + err.message
          : "Relay failed: Unknown";
        reportError(errorMsg);
        console.error("Relay to management failed:", err);
      });
  } else if (message.action === "setKey") {
    dbPromise.then((db) => {
      const tx = db.transaction(["keyStore"], "readwrite");
      const store = tx.objectStore("keyStore");
      store.put({ id: "encryptionKey", value: message.password });
      console.log("Encryption key stored in IndexedDB");
      browser.runtime.sendMessage({ action: "keySet" });
    });
  } else if (message.action === "saveData" && message.url && message.data) {
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
  } else if (message.action === "deleteData") {
    dbPromise.then((db) => {
      const transaction = db.transaction(["xpaths"], "readwrite");
      const store = transaction.objectStore("xpaths");
      store.delete(message.data.id);
      transaction.oncomplete = () => {
        console.log("Deleted from IndexedDB, ID:", message.data.id);
        loadXPaths();
      };
    });
  } else if (message.action === "toggleCapture") {
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
  } else if (message.action === "pageSet") {
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
        loadXPaths(); // Refresh sidebar and management
      };
      putRequest.onerror = (err) => console.error("Page set save failed:", err);
    }).catch((err) => console.error("DB access failed:", err));
  } else if (message.action === "loadXPaths") {
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
  } else if (message.action === "getCaptureState") {
    sendResponse({ enabled: isCapturing, tabId: captureTabId });
    return true;
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
    const request = indexedDB.open("XPathDB", 2); // Bump version to 2 for upgrade
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (event.oldVersion < 1) {
        db.createObjectStore("xpaths", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("key", { keyPath: "id" });
      }
      if (event.oldVersion < 2) {
        db.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
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