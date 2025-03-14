console.log("management.js loaded");

let grouped = {};
let currentState = null;
let currentPage = null;
let currentSection = null;
let currentSubsection = null;
let logs = [];

console.log("management.js loaded");

// Render the workflow data in the management UI
function renderManagementList(data) {
  const container = getElement("workflow-list"); // Target #workflow-list, not #container
  // Check if data is missing or invalid
  if (!data) {
    const p = document.createElement("p");
    p.textContent = "No workflows found.";
    container.appendChild(p);
    console.log("No valid data received:", data);
    return;
  }

  // Clear existing content
  container.innerHTML = "";

  // Handle both array (multiple entries) and object (single entry) formats
  const entry = Array.isArray(data) ? data[0] : data; // Use first entry if array
  // Check if entry lacks a state (core identifier)
  if (!entry.state) {
    const p = document.createElement("p");
    p.textContent = "No workflow data available.";
    container.appendChild(p);
    return;
  }

  // Create main workflow div
  const stateDiv = document.createElement("div");
  stateDiv.className = "workflow";

  // Add workflow state title
  const h2 = document.createElement("h2");
  h2.textContent = entry.state || "Unnamed Workflow";
  stateDiv.appendChild(h2);

  // Add page field group
  const pageDiv = document.createElement("div");
  pageDiv.className = "page field-group";
  const pageLabel = document.createElement("label");
  pageLabel.textContent = entry.page || "Default Page";
  pageDiv.appendChild(pageLabel);
  const pageBtnGroup = document.createElement("div");
  pageBtnGroup.className = "button-group";
  pageBtnGroup.innerHTML = `
    <button class="edit-btn" data-type="page" data-name="${entry.page || "Default Page"}">Edit</button>
    <button class="add-subsection">+</button>
    <button class="remove-subsection">-</button>
  `;
  pageDiv.appendChild(pageBtnGroup);
  stateDiv.appendChild(pageDiv);

  // Add section field group
  const sectionDiv = document.createElement("div");
  sectionDiv.className = "section field-group";
  const sectionLabel = document.createElement("label");
  sectionLabel.textContent = entry.section || "Default Section";
  sectionDiv.appendChild(sectionLabel);
  const sectionBtnGroup = document.createElement("div");
  sectionBtnGroup.className = "button-group";
  sectionBtnGroup.innerHTML = `
    <button class="edit-btn" data-type="section" data-name="${entry.section || "Default Section"}">Edit</button>
    <button class="add-subsection">+</button>
    <button class="remove-subsection">-</button>
  `;
  sectionDiv.appendChild(sectionBtnGroup);
  stateDiv.appendChild(sectionDiv);

  // Add subsection field group
  const subsectionDiv = document.createElement("div");
  subsectionDiv.className = "subsection field-group";
  const subsectionLabel = document.createElement("label");
  subsectionLabel.textContent = entry.subsection || "Default Subsection";
  subsectionDiv.appendChild(subsectionLabel);
  const subsectionBtnGroup = document.createElement("div");
  subsectionBtnGroup.className = "button-group";
  subsectionBtnGroup.innerHTML = `
    <button class="edit-btn" data-type="subsection" data-name="${entry.subsection || "Default Subsection"}">Edit</button>
    <button class="add-subsection">+</button>
    <button class="remove-subsection">-</button>
  `;
  subsectionDiv.appendChild(subsectionBtnGroup);
  stateDiv.appendChild(subsectionDiv);

  // Append the workflow to the container
  container.appendChild(stateDiv);

  // Bind event listeners for Edit buttons
  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type; // Get type (page, section, subsection)
      const name = btn.dataset.name; // Get current name
      const dialog = getElement("edit-dialog"); // Show edit dialog
      const input = getElement("edit-label");
      input.value = name;
      dialog.showModal();
      getElement("save-edit").onclick = () => { // Save new name
        const newName = input.value.trim();
        if (newName) console.log(`Edited ${type}: ${name} to ${newName}`);
        dialog.close();
      };
      getElement("cancel-edit").onclick = () => dialog.close(); // Cancel edit
    });
  });

  // Bind event listeners for Add buttons
  document.querySelectorAll(".add-subsection").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.closest(".field-group").className.split(" ")[0]; // Get type from class
      const newName = prompt(`New ${type} name:`); // Prompt for new name
      if (newName) console.log(`Added ${type}: ${newName}`);
    });
  });

  // Bind event listeners for Remove buttons
  document.querySelectorAll(".remove-subsection").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.closest(".field-group").className.split(" ")[0]; // Get type from class
      const name = btn.closest(".field-group").querySelector("label").textContent; // Get current name
      if (confirm(`Remove ${type}: ${name}?`)) console.log(`Removed ${type}: ${name}`);
    });
  });
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    getElement(btn.dataset.tab).classList.add("active");
  });
});

// Export logs
getElement("export-logs").addEventListener("click", () => {
  browser.runtime.sendMessage({ action: "exportLogs" });
});

browser.runtime.onMessage.addListener((message) => {
  console.log("Management received message:", message);
  if (message.action === "xpathsLoaded") {
    renderManagementList(message.data);
  } else if (message.action === "logsExported") {
    const blob = new Blob([message.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "xpath-tracer-logs.json";
    a.click();
    URL.revokeObjectURL(url);
    console.log("Logs exported to file");
  }
});

browser.runtime.sendMessage({ action: "loadXPaths" });

function getElement(id) {
  const el = document.getElementById(id);
  if (!el) console.error(`${id} not found`);
  return el;
}

function updateLogs() {
  const logOutput = getElement("log-output");
  if (logOutput) logOutput.textContent = logs.join("\n");
}

function debounceLoadXPaths() {
  browser.runtime.sendMessage({ action: "loadXPaths" });
}

function renderWorkflowList() {
  const list = getElement("workflow-list");
  console.log("Rendering workflow list, currentState:", currentState, "grouped:", grouped);
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
      Object.keys(sections).forEach((section) => {
        if (section) {
          html += `<li class="section" data-section="${section}"><strong>${section}</strong><button class="add-subsection small-btn">+</button><button class="remove-section small-btn remove">-</button><ul class="sortable-subsections">`;
          const subsections = sections[section];
          Object.keys(subsections).forEach((subsection) => {
            if (subsection) {
              html += `<li class="subsection" data-subsection="${subsection}">${subsection}<button class="remove-subsection small-btn remove">-</button><ul>`;
              const entries = subsections[subsection];
              if (entries.length === 0) {
                html += `<li class="placeholder">Empty subsection</li>`;
              } else {
                entries.forEach((entry) => {
                  const displayLabel = entry.customLabel || entry.label || entry.xpath;
                  const displayValue = entry.encrypted ? "[Encrypted]" : entry.value || "";
                  const xpathSpeed = Math.min(10, Math.max(1, 10 - Math.floor((entry.xpathTime || 0) / 1)));
                  const cssSpeed = Math.min(10, Math.max(1, 10 - Math.floor((entry.cssSelectorTime || 0) / 1)));
                  const pathSpeed = Math.min(10, Math.max(1, 10 - Math.floor((entry.cssPathTime || 0) / 1)));
                  const xpathBars = `<span class="speed-bars" data-speed="${xpathSpeed}" style="${entry.xpathFails > entry.xpathSuccess ? 'opacity: 0.5;' : ''}">${'█'.repeat(xpathSpeed)}</span>`;
                  const cssBars = `<span class="speed-bars" data-speed="${cssSpeed}" style="${entry.cssSelectorFails > entry.cssSelectorSuccess ? 'opacity: 0.5;' : ''}">${'█'.repeat(cssSpeed)}</span>`;
                  const pathBars = `<span class="speed-bars" data-speed="${pathSpeed}" style="${entry.cssPathFails > entry.cssPathSuccess ? 'opacity: 0.5;' : ''}">${'█'.repeat(pathSpeed)}</span>`;
                  const paths = `
                    <div class="paths" style="display: none;">
                      <button class="path-btn" data-type="xpath" data-id="${entry.id}">XPath (${entry.xpathSuccess}/${entry.xpathFails}) ${xpathBars}</button><br>
                      <button class="path-btn" data-type="cssSelector" data-id="${entry.id}">CSS Selector (${entry.cssSelectorSuccess}/${entry.cssSelectorFails}) ${cssBars}</button><br>
                      <button class="path-btn" data-type="cssPath" data-id="${entry.id}">CSS Path (${entry.cssPathSuccess}/${entry.cssPathFails}) ${pathBars}</button>
                    </div>`;
                  html += `<li class="entry" data-id="${entry.id}">${displayLabel} (${entry.type || "unknown"}) - ${displayValue}<button class="show-paths">Paths</button>${paths}<span class="grab">^v</span><button class="edit-btn" data-id="${entry.id}">Edit</button><button class="delete-btn" data-id="${entry.id}">Delete</button></li>`;
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
    document.querySelectorAll(".add-subsection").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.parentElement.parentElement.dataset.page;
        const section = button.parentElement.dataset.section;
        const subsection = prompt("Subsection name:");
        if (subsection) {
          grouped[currentState][page][section][subsection] = [];
          renderWorkflowList();
        }
      });
    });
    document.querySelectorAll(".remove-section").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.parentElement.parentElement.dataset.page;
        const section = button.dataset.section;
        if (confirm(`Remove section "${section}"?`)) {
          delete grouped[currentState][page][section];
          renderWorkflowList();
        }
      });
    });
    document.querySelectorAll(".remove-subsection").forEach((button) => {
      button.addEventListener("click", () => {
        const page = button.parentElement.parentElement.parentElement.dataset.page;
        const section = button.parentElement.parentElement.dataset.section;
        const subsection = button.parentElement.dataset.subsection;
        if (confirm(`Remove subsection "${subsection}"?`)) {
          delete grouped[currentState][page][section][subsection];
          renderWorkflowList();
        }
      });
    });
    document.querySelectorAll(".delete-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const id = parseInt(button.dataset.id);
        const entry = Object.values(grouped[currentState])
          .flatMap((sections) => Object.values(sections).flat())
          .find((e) => e.id === id);
        if (confirm(`Delete ${entry?.customLabel || "entry"} (ID: ${id})?`)) {
          browser.runtime.sendMessage({ action: "deleteData", data: { id } });
          debounceLoadXPaths();
        }
      });
    });
    document.querySelectorAll(".edit-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const id = parseInt(button.dataset.id);
        const entry = Object.values(grouped[currentState])
          .flatMap((sections) => Object.values(sections).flat())
          .find((e) => e.id === id);
        showEditDialog(entry);
      });
    });
    initSortable();
    document.querySelectorAll(".show-paths").forEach(button => {
      button.addEventListener("click", () => {
        const pathsDiv = button.nextElementSibling;
        pathsDiv.style.display = pathsDiv.style.display === "none" ? "block" : "none";
      });
    });
  }
}

function showEditDialog(entry) {
  const dialog = getElement("edit-dialog");
  getElement("edit-label").value = entry.customLabel || entry.label;
  dialog.style.display = "block";
  getElement("save-edit").onclick = () => {
    entry.customLabel = getElement("edit-label").value;
    browser.runtime.sendMessage({ action: "saveData", url: entry.url, data: entry });
    dialog.style.display = "none";
    renderWorkflowList();
  };
  getElement("cancel-edit").onclick = () => {
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
            browser.runtime.sendMessage({ action: "saveData", url: entry.url, data: entry });
          });
          debounceLoadXPaths();
        }
      },
    });
  });
  document.querySelectorAll(".sortable-subsections").forEach((entries) => {
    new Sortable(entries, {
      group: "entries-shared",
      handle: ".grab",
      animation: 150,
      onEnd: (evt) => {
        const id = parseInt(evt.item.dataset.id);
        const oldSection = evt.from.parentElement.dataset.section;
        const oldPage = evt.from.parentElement.parentElement.dataset.page;
        const newSection = evt.to.parentElement.dataset.section;
        const newPage = evt.to.parentElement.parentElement.dataset.page;
        console.log("Entry moved, ID:", id, "from", oldPage, ">", oldSection, "to", newPage, ">", newSection);
        if (oldPage !== newPage || oldSection !== newSection) {
          const entry = grouped[currentState][oldPage][oldSection].flatMap(sub => sub).find(e => e.id === id);
          grouped[currentState][oldPage][oldSection] = grouped[currentState][oldPage][oldSection].map(sub => sub.filter(e => e.id !== id));
          grouped[currentState][newPage][newSection] = grouped[currentState][newPage][newSection] || [];
          grouped[currentState][newPage][newSection].push(entry);
          entry.page = newPage;
          entry.section = newSection;
          browser.runtime.sendMessage({ action: "saveData", url: entry.url, data: entry });
          debounceLoadXPaths();
        }
      },
    });
  });
  document.querySelectorAll(".show-paths").forEach(button => {
    button.addEventListener("click", () => {
      const pathsDiv = button.nextElementSibling;
      pathsDiv.style.display = pathsDiv.style.display === "none" ? "block" : "none";
    });
  });
  document.querySelectorAll(".path-btn").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      const type = button.dataset.type;
      const entry = Object.values(grouped[currentState]).flatMap(s => Object.values(s).flat()).find(e => e.id === parseInt(id));
      browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        browser.tabs.sendMessage(tabs[0].id, {
          action: "highlight",
          xpath: entry.xpath,
          cssSelector: entry.cssSelector,
          cssPath: entry.cssPath,
          type: type
        });
      });
    });
  });
  }

function updateDropdown(filtered = Object.keys(grouped)) {
  const dropdown = getElement("workflow-dropdown");
  dropdown.innerHTML = '<option value="">Select Workflow</option>' +
    filtered.map(state => `<option value="${state}">${state}</option>`).join("");
  dropdown.value = currentState || "";
}

document.addEventListener("DOMContentLoaded", () => {
  // Override console.log here, after DOM is ready
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    logs.push(args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : arg).join(" "));
    updateLogs();
    originalConsoleLog(...args);
  };

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
      browser.tabs.create({ url }).then(tab => console.log("Tab created:", tab.id));
    }
  });

  getElement("workflow-search").addEventListener("input", (e) => {
    const search = e.target.value.toLowerCase();
    const filtered = Object.keys(grouped).filter(state => state.toLowerCase().includes(search));
    updateDropdown(filtered);
  });

  getElement("workflow-dropdown").addEventListener("change", (e) => {
    currentState = e.target.value || null;
    renderWorkflowList();
  });

  getElement("workflow-tab").addEventListener("click", () => {
    getElement("workflow-content").style.display = "block";
    getElement("logs-content").style.display = "none";
  });
  getElement("logs-tab").addEventListener("click", () => {
    getElement("workflow-content").style.display = "none";
    getElement("logs-content").style.display = "block";
    updateLogs();
  });

  browser.storage.local.get(["currentState", "currentPage", "currentSection", "currentSubsection"]).then((result) => {
    currentState = result.currentState || null;
    currentPage = result.currentPage || null;
    currentSection = result.currentSection || null;
    currentSubsection = result.currentSubsection || null;
    console.log("Loaded from storage:", { currentState, currentPage, currentSection, currentSubsection });
    renderWorkflowList();
    updateDropdown();
    debounceLoadXPaths();
  });
});

browser.runtime.onMessage.addListener((message) => {
  console.log("Management received message:", message);
  if (message.action === "xpathsLoaded") {
    grouped = message.data.reduce((acc, entry) => {
      const state = entry.state || "Unnamed Workflow";
      const page = entry.page || "Default Page";
      const section = entry.section || "Default Section";
      const subsection = entry.subsection || "Default Subsection";
      acc[state] = acc[state] || {};
      acc[state][page] = acc[state][page] || {};
      acc[state][page][section] = acc[state][page][section] || {};
      acc[state][page][section][subsection] = acc[state][page][section][subsection] || [];
      acc[state][page][section][subsection].push(entry);
      return acc;
    }, {});
    console.log("XPaths loaded, grouped:", grouped);
    renderWorkflowList();
    updateDropdown();
  } else if (message.action === "keySet") {
    console.log("Encryption key set successfully, hiding controls");
    getElement("encryption-controls").style.display = "none";
  } else if (message.action === "relayData" && message.url && message.data) {
    const entry = message.data;
    currentState = currentState || "Default Workflow";
    entry.state = currentState;
    entry.page = currentPage || "Default Page";
    entry.section = currentSection || "Default Section";
    entry.subsection = currentSubsection || "Default Subsection";
    entry.url = message.url;
    grouped[currentState] = grouped[currentState] || {};
    grouped[currentState][entry.page] = grouped[currentState][entry.page] || {};
    grouped[currentState][entry.page][entry.section] = grouped[currentState][entry.page][entry.section] || {};
    grouped[currentState][entry.page][entry.section][entry.subsection] = grouped[currentState][entry.page][entry.section][entry.subsection] || [];
    grouped[currentState][entry.page][entry.section][entry.subsection].push(entry);
    browser.runtime.sendMessage({ action: "saveData", url: entry.url, data: entry });
    renderWorkflowList();
    debounceLoadXPaths();
  } else if (message.action === "pageSet") {
    currentPage = message.currentPage;
    currentSection = message.currentSection;
    currentSubsection = message.subsection;
    console.log("Page set from sidebar:", { currentState, currentPage, currentSection, currentSubsection });
    renderWorkflowList();
    debounceLoadXPaths();
  }
});

function debugLog(message) {
  console.log(message);
}