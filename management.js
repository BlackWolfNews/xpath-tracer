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

function renderWorkflowList() {
  const list = document.getElementById("workflow-list");
  console.log(
    "Rendering workflow list, currentState:",
    currentState,
    "grouped:",
    grouped
  );
  list.innerHTML = currentState && Object.keys(grouped[currentState] || {}).length
    ? ""
    : "<p>No workflow selected</p>";

  if (currentState && grouped[currentState]) {
    let totalEntries = 0;
    let html = `<ul class="sortable-pages">`;
    Object.keys(grouped[currentState]).forEach((page) => {
      const sections = grouped[currentState][page];
      const pageEntries = Object.values(sections).flatMap(subs => Object.values(subs).flat()).length;
      totalEntries += pageEntries;
      html += `<li class="page" data-page="${page}"><strong>${page}</strong> (${pageEntries} items)<button class="add-section small-btn">+</button><button class="remove-page small-btn remove">-</button><small>${Object.values(sections).flat()[0]?.url || "No URL"}</small><ul class="sortable-sections">`;
      html += `<li class="section" data-section="${section}"><strong>${section}</strong><button class="add-subsection small-btn">+</button><button class="remove-section small-btn remove">-</button><ul class="sortable-subsections">`;
      html += `<li class="subsection" data-subsection="${subsection}">${subsection}<button class="remove-subsection small-btn remove">-</button><ul>`;
      html += `<li class="entry" data-id="${entry.id}">${displayLabel} (${entry.type || "unknown"}) - ${displayValue}<br><small>${paths}</small><span class="grab">^v</span><button class="edit-btn" data-id="${entry.id}">Edit</button><button class="delete-btn" data-id="${entry.id}">Delete</button></li>`;

      Object.keys(sections).forEach((section) => {
        if (section) { // Skip unnamed/empty sections
          html += `<li class="section" data-section="${section}"><strong>${section}</strong>`;
          html += `<button class="add-subsection" data-page="${page}" data-section="${section}">+</button><ul class="sortable-subsections">`;
          const subsections = sections[section];
          Object.keys(subsections).forEach((subsection) => {
            if (subsection) { // Skip unnamed/empty subsections
              html += `<li class="subsection" data-subsection="${subsection}">${subsection}<button class="remove-subsection" data-page="${page}" data-section="${section}" data-subsection="${subsection}">-</button><ul>`;
              const entries = subsections[subsection];
              if (entries.length === 0) {
                html += `<li class="placeholder">Empty subsection</li>`;
              } else {
                entries.forEach((entry) => {
                  const displayLabel = entry.customLabel || entry.label || entry.xpath;
                  const displayValue = entry.encrypted ? "[Encrypted]" : entry.value || "";
                  const paths = `XPath: ${entry.xpath}<br>CSS: ${entry.cssSelector || "N/A"}<br>Path: ${entry.cssPath || "N/A"}`;
                  html += `<li class="entry" data-id="${entry.id}"><input type="checkbox" class="delete-checkbox" data-id="${entry.id}">${displayLabel} (${entry.type || "unknown"}) - ${displayValue}<br><small>${paths}</small><span class="grab">^v</span><button class="edit" data-id="${entry.id}">Edit</button><button class="delete" data-id="${entry.id}">Delete</button></li>`;
                });
              }
              html += `</ul></li>`;
            }
          });
          html += `</ul></li>`;
        }
      });
      html += `</ul></li>`;
    });
    html += `</ul>`;
    list.innerHTML = html;
    console.log("Rendered list with total entries:", totalEntries);

    // Reattach event listeners
    document.querySelectorAll(".add-subsection").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.dataset.page;
        const section = button.dataset.section;
        const subsection = prompt("Subsection name (leave blank for none):");
        if (subsection !== null) {
          if (!grouped[currentState][page][section][subsection]) {
            grouped[currentState][page][section][subsection] = [];
          }
          renderWorkflowList();
        }
      });
    });

    document.querySelectorAll(".remove-subsection").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.dataset.page;
        const section = button.dataset.section;
        const subsection = button.dataset.subsection;
        if (confirm(`Remove subsection "${subsection}"?`)) {
          delete grouped[currentState][page][section][subsection];
          renderWorkflowList();
        }
      });
    });

    document.querySelectorAll(".delete").forEach((button) => {
      button.addEventListener("click", () => {
        const id = parseInt(button.dataset.id);
        console.log("Delete clicked for ID:", id);
        const entry = Object.values(grouped[currentState])
          .flatMap((sections) => Object.values(sections).flat())
          .find((e) => e.id === id);
        if (confirm(`Delete ${entry?.customLabel || "entry"} (ID: ${id})?`)) {
          browser.runtime.sendMessage({ action: "deleteData", data: { id } });
          debounceLoadXPaths();
        }
      });
    });

    document.querySelectorAll(".edit").forEach((button) => {
      button.addEventListener("click", () => {
        const id = parseInt(button.dataset.id);
        const entry = Object.values(grouped[currentState])
          .flatMap((sections) => Object.values(sections).flat())
          .find((e) => e.id === id);
        showEditDialog(entry);
      });
    });

    document.querySelectorAll(".add-section").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.parentElement.dataset.page;
        const section = prompt("Section name:");
        if (section) {
          grouped[currentState][page][section] = {};
          renderWorkflowList();
        }
      });
    });
    document.querySelectorAll(".remove-page").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.parentElement.dataset.page;
        if (confirm(`Remove page "${page}"?`)) {
          delete grouped[currentState][page];
          renderWorkflowList();
        }
      });
    });
    document.querySelectorAll(".remove-section").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.parentElement.parentElement.dataset.page;
        const section = button.parentElement.dataset.section;
        if (confirm(`Remove section "${section}"?`)) {
          delete grouped[currentState][page][section];
          renderWorkflowList();
        }
      });
    });

    initSortable();
  }
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