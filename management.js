console.log("management.js loaded");

let grouped = {};
let currentState = null;
let currentPage = null;
let currentSection = null;
let currentSubsection = null;

function getElement(id) {
  const el = document.getElementById(id);
  if (!el) console.error(`${id} not found`);
  return el;
}

function debounceLoadXPaths() {
  browser.runtime.sendMessage({ action: "loadXPaths" });
}

function showEditDialog(entry) {
  const dialog = document.getElementById("edit-dialog");
  document.getElementById("edit-label").value = entry.customLabel || entry.label;
  dialog.style.display = "block";
  document.getElementById("save-edit").onclick = () => {
    entry.customLabel = document.getElementById("edit-label").value;
    browser.runtime.sendMessage({ action: "saveData", url: entry.url, data: entry });
    dialog.style.display = "none";
    renderWorkflowList();
  };
  document.getElementById("cancel-edit").onclick = () => {
    dialog.style.display = "none";
  };
}

function initSortable() {
  document.querySelectorAll(".sortable-sections").forEach((sections) => {
    new Sortable(sections, {
      group: "sections",
      handle: ".grab",
      animation: 150,
      onEnd: (evt) => {
        const section = evt.item.dataset.section;
        const oldPage = evt.from.parentElement.dataset.page;
        const newPage = evt.to.parentElement.dataset.page;
        console.log("Section moved:", section, "from", oldPage, "to", newPage);
        if (oldPage !== newPage) {
          const entries = grouped[currentState][oldPage][section];
          grouped[currentState][oldPage][section] = [];
          grouped[currentState][newPage][section] = entries;
          entries.forEach((entry) => {
            entry.page = newPage;
            browser.runtime.sendMessage({
              action: "saveData",
              url: entry.url,
              data: entry,
            });
          });
          debounceLoadXPaths();
        }
      },
    });
  });

  document.querySelectorAll(".sortable-entries").forEach((entries) => {
    new Sortable(entries, {
      group: "entries-shared",
      handle: ".grab",
      animation: 150,
      onEnd: (evt) => {
        const id = parseInt(evt.item.dataset.id);
        const oldSection = evt.from.parentElement.dataset.section;
        const oldPage = evt.from.parentElement.dataset.page;
        const newSection = evt.to.parentElement.dataset.section;
        const newPage = evt.to.parentElement.dataset.page;
        console.log(
          "Entry moved, ID:",
          id,
          "from",
          oldPage,
          ">",
          oldSection,
          "to",
          newPage,
          ">",
          newSection
        );
        if (oldPage !== newPage || oldSection !== newSection) {
          const entry = grouped[currentState][oldPage][oldSection].find(
            (e) => e.id === id
          );
          grouped[currentState][oldPage][oldSection] = grouped[currentState][oldPage][
            oldSection
          ].filter((e) => e.id !== id);
          grouped[currentState][newPage][newSection].push(entry);
          entry.page = newPage;
          entry.section = newSection;
          browser.runtime.sendMessage({
            action: "saveData",
            url: entry.url,
            data: entry,
          });
          debounceLoadXPaths();
        }
      },
    });
  });
}

function showEditDialog(entry) {
  const dialog = document.getElementById("edit-dialog");
  document.getElementById("edit-label").value = entry.customLabel || entry.label;
  dialog.style.display = "block";
  document.getElementById("save-edit").onclick = () => {
    entry.customLabel = document.getElementById("edit-label").value;
    browser.runtime.sendMessage({ action: "saveData", url: entry.url, data: entry });
    dialog.style.display = "none";
    renderWorkflowList();
  };
  document.getElementById("cancel-edit").onclick = () => {
    dialog.style.display = "none";
  };
}

  getElement("save-edit").addEventListener("click", () => {
    const newLabel = getElement("edit-label").value.trim();
    if (newLabel) {
      entry.customLabel = newLabel;
      browser.runtime.sendMessage({
        action: "saveData",
        url: entry.url,
        data: entry,
      });
      debounceLoadXPaths();
      document.body.removeChild(dialog);
    }
  });

  getElement("cancel-edit").addEventListener("click", () => {
    document.body.removeChild(dialog);
  });

function updateDropdown() {
  const dropdown = getElement("workflow-dropdown");
  dropdown.innerHTML =
    '<option value="">Select Workflow</option>' +
    Object.keys(grouped)
      .map((state) => `<option value="${state}">${state}</option>`)
      .join("");
  dropdown.value = currentState || "";
}

getElement("save-key").addEventListener("click", () => {
  const password = getElement("key-input").value;
  console.log("Save Key clicked");
  if (password) {
    browser.runtime.sendMessage({ action: "setKey", password }).then(() => {
      getElement("encryption-controls").style.display = "none";
      getElement("key-input").value = "";
    });
  }
});

getElement("start-workflow").addEventListener("click", () => {
  const url = getElement("url-input").value.trim();
  if (url) {
    console.log("Start Workflow clicked with URL:", url);
    browser.sidebarAction.open();
    browser.tabs
      .create({ url })
      .then((tab) => console.log("Tab created:", tab.id))
      .catch((err) => console.error("Tab creation failed:", err));
  }
});

getElement("workflow-search").addEventListener("input", (e) => {
  const search = e.target.value.toLowerCase();
  const filtered = Object.keys(grouped).filter((state) =>
    state.toLowerCase().includes(search)
  );
  updateDropdown(filtered);
});

getElement("workflow-dropdown").addEventListener("change", (e) => {
  currentState = e.target.value || null;
  renderWorkflowList();
});

browser.storage.local
  .get(["currentState", "currentPage", "currentSection", "subsection"])
  .then((result) => {
    currentState = result.currentState || null;
    currentPage = result.currentPage || null;
    currentSection = result.currentSection || null;
    currentSubsection = result.subsection || null;
    console.log("Loaded from storage:", {
      currentState,
      currentPage,
      currentSection,
      currentSubsection,
    });
    renderWorkflowList();
    debounceLoadXPaths();
  });

browser.runtime.onMessage.addListener((message) => {
  console.log("Management received message:", message);
  if (message.action === "workflowSet") {
    currentState = message.currentState;
    currentPage = message.currentPage;
    currentSection = message.currentSection;
    console.log("Workflow set from sidebar:", {
      currentState,
      currentPage,
      currentSection,
    });
    renderWorkflowList();
    debounceLoadXPaths();
  } else if (message.action === "error") {
    getElement("error-message").textContent = message.message;
  } else if (message.action === "pageSet") {
    currentPage = message.currentPage;
    currentSection = message.currentSection;
    currentSubsection = message.subsection;
    console.log("Page set from sidebar:", {
      currentState,
      currentPage,
      currentSection,
      currentSubsection,
    });
    renderWorkflowList();
    debounceLoadXPaths();
  } else if (message.action === "relayData" && message.url && message.data) {
    const entry = message.data;
    currentState = currentState || "Default Workflow"; // Default if null
    entry.state = currentState;
    entry.page = currentPage || "Default Page";
    entry.section = currentSection || "Default Section";
    entry.subsection = currentSubsection || "Default Subsection";
    entry.url = message.url;
    grouped[currentState] = grouped[currentState] || {};
    grouped[currentState][entry.page] = grouped[currentState][entry.page] || {};
    grouped[currentState][entry.page][entry.section] =
      grouped[currentState][entry.page][entry.section] || {};
    grouped[currentState][entry.page][entry.section][entry.subsection] =
      grouped[currentState][entry.page][entry.section][entry.subsection] || [];
    grouped[currentState][entry.page][entry.section][entry.subsection].push(entry);
    browser.runtime.sendMessage({
      action: "saveData",
      url: entry.url,
      data: entry,
    });
    renderWorkflowList();
    debounceLoadXPaths();
  } else if (message.action === "xpathsLoaded") {
    grouped = message.data.reduce((acc, entry) => {
      const state = entry.state || "Unnamed Workflow";
      const page = entry.page || "Default Page";
      const section = entry.section || "Default Section";
      const subsection = entry.subsection || "Default Subsection";
      acc[state] = acc[state] || {};
      acc[state][page] = acc[state][page] || {};
      acc[state][page][section] = acc[state][page][section] || {};
      acc[state][page][section][subsection] =
        acc[state][page][section][subsection] || [];
      acc[state][page][section][subsection].push(entry);
      return acc;
    }, {});
    console.log("XPaths loaded, grouped:", grouped);
    renderWorkflowList();
  } else if (message.action === "keySet") {
    console.log("Encryption key set successfully, hiding controls");
    getElement("encryption-controls").style.display = "none";
  }
});


function debugLog(message) {
  console.log(message); // For now, later to IndexedDB
  // dbPromise.then(db => db.transaction(["logs"], "readwrite").objectStore("logs").add({ time: Date.now(), message }));
}