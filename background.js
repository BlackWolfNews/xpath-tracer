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
      const transaction = db.transaction(["key"], "readwrite");
      const store = transaction.objectStore("key");
      store.put({ id: 1, value: message.password });
      transaction.oncomplete = () => {
        console.log("Encryption key stored in IndexedDB");
        console.log("Key set, sending response");
        browser.runtime.sendMessage({ action: "keySet" });
      };
    });
  } else if (message.action === "saveData" && message.url && message.data) {
    dbPromise.then((db) => {
      const transaction = db.transaction(["xpaths"], "readwrite");
      const store = transaction.objectStore("xpaths");
      const entry = message.data;
      entry.url = message.url; // Ensure URL is attached
      entry.id = entry.id || Date.now(); // Unique ID if not set
      const request = store.getAll();
      request.onsuccess = () => {
        const existing = request.result.find(
          (e) => e.xpath === entry.xpath && e.url === entry.url
        );
        if (existing) {
          console.log("Duplicate entry skipped:", entry.xpath, entry.url);
        } else {
          store.put(entry).then(() => {
            console.log("Data saved to IndexedDB:", entry);
            loadXPaths(); // Sync UI after save
          }).catch((err) => console.error("Save failed:", err));
        }
      };
      request.onerror = (err) => console.error("GetAll failed:", err);
    }).catch((err) => console.error("DB access failed:", err));
  } else if (message.action === "loadXPaths") {
    console.log("Loading XPaths");
    dbPromise.then((db) => {
      const transaction = db.transaction(["xpaths"], "readonly");
      const store = transaction.objectStore("xpaths");
      const request = store.getAll();
      request.onsuccess = () => {
        console.log("XPaths loaded, sending to all");
        browser.runtime.sendMessage({
          action: "xpathsLoaded",
          data: request.result,
        });
      };
    });
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
    const request = indexedDB.open("XPathDB", 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore("xpaths", { keyPath: "id", autoIncrement: true });
      db.createObjectStore("key", { keyPath: "id" });
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function reportError(message) {
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