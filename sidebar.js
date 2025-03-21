console.log("sidebar.js loaded - top level");

let currentState = null;
let currentPage = null;
let currentSection = null;
let isCapturing = false;
let activeTabId = null;
let pendingData = null;
let managementTabId = null;
let currentWorkflow = "Alabama";

function getElement(id) {
  const el = document.getElementById(id);
  if (!el) console.error(`${id} not found`);
  return el;
}

function showWorkflowDialog() {
  const dialog = getElement("workflow-dialog");
  dialog.style.display = "block";
  const addSection = getElement("add-section");
  const saveWorkflow = getElement("save-workflow");
  const cancelWorkflow = getElement("cancel-workflow");
  const sectionsList = getElement("sections-list");
  const sectionCount = getElement("section-count");

  addSection.addEventListener("click", () => {
    const entry = document.createElement("div");
    entry.className = "section-entry";
    entry.innerHTML = `<input type="text" class="section-input" placeholder="Section Name"><button class="remove-section">-</button>`;
    sectionsList.appendChild(entry);
    sectionCount.textContent = sectionsList.children.length;
    entry.querySelector(".remove-section").addEventListener("click", () => {
      if (sectionsList.children.length > 1) {
        entry.remove();
        sectionCount.textContent = sectionsList.children.length;
      }
    });
  });

  sectionsList.querySelector(".remove-section").addEventListener("click", () => {
    if (sectionsList.children.length > 1) {
      sectionsList.children[0].remove();
      sectionCount.textContent = sectionsList.children.length;
    }
  });

  saveWorkflow.addEventListener("click", () => {
    const workflowName = getElement("workflow-name").value.trim();
    const pageName = getElement("page-name").value.trim();
    const sections = Array.from(sectionsList.querySelectorAll(".section-input"))
      .map((input) => input.value.trim())
      .filter(Boolean);
    if (workflowName && pageName && sections.length) {
      currentState = workflowName;
      currentPage = pageName;
      currentSection = sections[0];
      logToBackground(
        "New workflow created: " + JSON.stringify({ state: currentState, page: currentPage, sections })
      );
      browser.storage.local.set({ currentState, currentPage, currentSection });
      browser.runtime.sendMessage({
        action: "workflowSet",
        currentState,
        currentPage,
        currentSection,
      });
      dialog.style.display = "none";
    } else {
      alert("Please fill in all fields.");
    }
  });

  cancelWorkflow.addEventListener("click", () => {
    dialog.style.display = "none";
  });
}

function showPageDialog(url, tabId) {
  const dialog = getElement("workflow-dialog");
  dialog.innerHTML = `
    <h3>XPath Tracer</h3>
    <p>Workflow: ${currentWorkflow}</p>
    <div class="field-group">
      <label for="page-name">Page Name</label>
      <input type="text" id="page-name" value="${currentPage || ''}">
      <div class="button-group">
        <button class="edit-btn">Edit</button>
        <button class="add-subsection">+</button>
        <button class="remove-subsection">-</button>
      </div>
    </div>
    <div class="field-group">
      <label for="section-name">Section Name</label>
      <input type="text" id="section-name" value="${currentSection || ''}">
      <div class="button-group">
        <button class="edit-btn">Edit</button>
        <button class="add-subsection">+</button>
        <button class="remove-subsection">-</button>
      </div>
    </div>
    <div class="field-group">
      <label for="subsection-name">Subsection Name</label>
      <input type="text" id="subsection-name">
      <div class="button-group">
        <button class="edit-btn">Edit</button>
        <button class="add-subsection">+</button>
        <button class="remove-subsection">-</button>
      </div>
    </div>
    <button id="save-page">Save</button>
    <button id="cancel-page">Skip</button>
  `;
  dialog.style.display = "block";

  getElement("save-page").addEventListener("click", () => {
    const pageName = getElement("page-name").value.trim();
    const sectionName = getElement("section-name").value.trim();
    const subsectionName = getElement("subsection-name").value.trim() || "Default Subsection";
    if (pageName && sectionName) {
      currentPage = pageName;
      currentSection = sectionName;
      const subsection = subsectionName;
      logToBackground("New page set: " + JSON.stringify({ currentPage, currentSection, subsection }));
      browser.storage.local.set({ currentPage, currentSection, subsection });
      browser.runtime.sendMessage({
        action: "pageSet",
        currentState,
        currentPage,
        currentSection,
        subsection,
        url,
      }).then(() => {
        logToBackground("Page saved: " + JSON.stringify({ currentState, currentPage, currentSection, subsection }));
      }).catch((err) => {
        logToBackground("Failed to save page: " + err.message);
      });
      getElement("label-input").disabled = true;
      dialog.style.display = "none";
    } else {
      alert("Please fill in Page and Section names.");
    }
  });

  getElement("cancel-page").addEventListener("click", () => {
    dialog.style.display = "none";
  });
}

function updateToggleButton() {
  const toggleButton = getElement("toggle-capture");
  if (toggleButton)
    toggleButton.textContent = isCapturing ? "Stop Capturing" : "Start Capturing";
}

function renderSidebarList(xpaths) {
  const list = getElement("xpath-list");
  list.innerHTML = "";
  const grouped = xpaths.reduce((acc, entry) => {
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

  for (const [state, pages] of Object.entries(grouped)) {
    const stateLi = document.createElement("li");
    stateLi.textContent = state;
    const pageUl = document.createElement("ul");
    for (const [page, sections] of Object.entries(pages)) {
      const pageLi = document.createElement("li");
      pageLi.textContent = page;
      const sectionUl = document.createElement("ul");
      for (const [section, subsections] of Object.entries(sections)) {
        const sectionLi = document.createElement("li");
        sectionLi.textContent = section;
        const subsectionUl = document.createElement("ul");
        for (const [subsection, entries] of Object.entries(subsections)) {
          const subsectionLi = document.createElement("li");
          subsectionLi.textContent = subsection;
          const entryUl = document.createElement("ul");
          entries.forEach((entry) => {
            const entryLi = document.createElement("li");
            entryLi.dataset.type = entry.type || "unknown";
            const highlightBtn = document.createElement("button");
            highlightBtn.textContent = "H";
            highlightBtn.className = "highlight-btn";
            highlightBtn.dataset.xpath = entry.xpath;
            highlightBtn.dataset.cssSelector = entry.cssSelector || "";
            highlightBtn.dataset.cssPath = entry.cssPath || "";
            highlightBtn.dataset.url = entry.url;
            const label = entry.customLabel || entry.label || entry.xpath;
            entryLi.appendChild(highlightBtn);
            entryLi.appendChild(document.createTextNode(` ${label}`));
            entryUl.appendChild(entryLi);
          });
          subsectionLi.appendChild(entryUl);
          subsectionUl.appendChild(subsectionLi);
        }
        sectionLi.appendChild(subsectionUl);
        sectionUl.appendChild(sectionLi);
      }
      pageLi.appendChild(sectionUl);
      pageUl.appendChild(pageLi);
    }
    stateLi.appendChild(pageUl);
    list.appendChild(stateLi);
  }
}

function highlightElement(xpath, cssSelector, cssPath, url) {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs[0].url === url) {
      browser.tabs.sendMessage(tabs[0].id, {
        action: "highlight",
        xpath,
        cssSelector,
        cssPath,
      });
    }
  });
}

function highlightAll() {
  const buttons = document.querySelectorAll(".highlight-btn");
  const paths = Array.from(buttons).map((btn) => ({
    xpath: btn.dataset.xpath,
    cssSelector: btn.dataset.cssSelector || "",
    cssPath: btn.dataset.cssPath || "",
    url: btn.dataset.url,
  }));
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    paths.forEach(({ xpath, cssSelector, cssPath, url }) => {
      if (tabs[0].url === url) {
        browser.tabs.sendMessage(tabs[0].id, {
          action: "highlight",
          xpath,
          cssSelector,
          cssPath,
        });
      }
    });
  });
}

function clearHighlights() {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    browser.tabs.sendMessage(tabs[0].id, { action: "clearHighlights" });
  });
}

getElement("edit-list").addEventListener("click", () => {
  browser.tabs.create({ url: browser.runtime.getURL("management.html") });
});

getElement("save-label").addEventListener("click", () => {
  if (pendingData && isCapturing) {
    const customLabel = getElement("label-input").value.trim();
    if (customLabel) {
      pendingData.data.customLabel = customLabel;
      logToBackground("Saving data: " + JSON.stringify(pendingData));
      browser.runtime.sendMessage({
        action: "relayData",
        url: pendingData.url,
        data: pendingData.data,
      });
      pendingData = null;
      getElement("label-input").value = "";
      getElement("label-input").disabled = true;
      getElement("label-entry").classList.remove("active");
    }
  }
});

let isHighlighted = false;
getElement("highlight-toggle").addEventListener("click", () => {
  isHighlighted = !isHighlighted;
  if (isHighlighted) {
    highlightAll();
    getElement("highlight-toggle").textContent = "Clear Highlights";
  } else {
    clearHighlights();
    getElement("highlight-toggle").textContent = "Highlight All";
  }
});

document.addEventListener("click", (e) => {
  if (e.target.className === "highlight-btn") {
    highlightElement(
      e.target.dataset.xpath,
      e.target.dataset.cssSelector,
      e.target.dataset.cssPath,
      e.target.dataset.url
    );
  }
});

const toggleCaptureButton = getElement("toggle-capture");
if (toggleCaptureButton) {
  toggleCaptureButton.addEventListener("click", () => {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      activeTabId = tabs[0].id;
      isCapturing = !isCapturing;
      logToBackground(
        "Toggle Capture clicked, isCapturing: " + isCapturing + " for tab: " + activeTabId
      );
      updateToggleButton();
      const labelEntry = getElement("label-entry");
      if (isCapturing && !pendingData) labelEntry.classList.add("active");
      else if (!pendingData) labelEntry.classList.remove("active");
      browser.runtime.sendMessage({
        action: "toggleCapture",
        enabled: isCapturing,
        tabId: activeTabId,
      });
    });
  });
}

browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  activeTabId = tabs[0].id;
  logToBackground("Initial active tab ID set: " + activeTabId);
  browser.runtime.sendMessage({ action: "getManagementTab" }).then((response) => {
    managementTabId = response?.tabId || null;
    if (
      response?.enabled !== undefined &&
      (!response.tabId || response.tabId === activeTabId)
    ) {
      isCapturing = response.enabled;
      updateToggleButton();
    }
  });
});

browser.tabs.onActivated.addListener((activeInfo) => {
  activeTabId = activeInfo.tabId;
  logToBackground("Active tab changed to: " + activeTabId);
});

function renderList(data) {
  const list = document.getElementById("capture-list");
  list.innerHTML = "";
  data.forEach((entry) => {
    const div = document.createElement("div");
    div.className = "entry";
    const label = document.createElement("label");
    label.textContent = entry.customLabel || entry.label;
    div.appendChild(label);
    const btnDiv = document.createElement("div");
    btnDiv.className = "entry-buttons";
    const hBtn = document.createElement("button");
    hBtn.textContent = "H";
    hBtn.className = "highlight-btn";
    hBtn.onclick = () => highlightElement(entry.xpath, entry.cssSelector, entry.cssPath, entry.url);
    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.className = "small-btn";
    addBtn.onclick = () => addSectionPrompt(entry);
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.className = "edit-btn";
    editBtn.onclick = () => {
      if (managementTabId) {
        browser.tabs.update(managementTabId, { active: true });
      } else {
        browser.tabs.create({ url: "management.html" }).then((tab) => {
          managementTabId = tab.id;
        });
      }
    };
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "-";
    removeBtn.className = "small-btn remove";
    removeBtn.onclick = () => removeEntry(entry);
    btnDiv.appendChild(hBtn);
    btnDiv.appendChild(addBtn);
    btnDiv.appendChild(editBtn);
    btnDiv.appendChild(removeBtn);
    div.appendChild(btnDiv);
    list.appendChild(div);
  });
}

function addSectionPrompt(entry) {
  const section = prompt("Section name (leave blank for none):");
  if (section !== null) {
    entry.section = section || "";
    browser.runtime.sendMessage({
      action: "saveData",
      url: entry.url,
      data: entry
    });
    logToBackground("Section added to entry: " + JSON.stringify(entry));
  }
}

function removeEntry(entry) {
  browser.runtime.sendMessage({
    action: "deleteData",
    data: { id: entry.id }
  });
  logToBackground("Entry removed: " + JSON.stringify(entry));
}

browser.runtime.onMessage.addListener((message) => {
  console.log("Sidebar received message:", message);
  if (message.action === "urlChanged") {
    if (isCapturing) {
      isCapturing = false;
      updateToggleButton();
      browser.runtime.sendMessage({
        action: "toggleCapture",
        enabled: false,
        tabId: message.tabId,
      });
      logToBackground("Capture auto-disabled due to URL change: " + message.url);
    }
    showPageDialog(message.url, message.tabId);
  } else if (message.action === "error") {
    getElement("error-message").textContent = message.message;
  } else if (message.data && message.url) {
    pendingData = { url: message.url, data: message.data };
    const labelEntry = getElement("label-entry");
    labelEntry.classList.add("active");
    getElement("label-input").focus();
    logToBackground("Label prompt displayed for: " + JSON.stringify(message.data));
  } else if (message.action === "xpathsLoaded") {
    renderSidebarList(message.data);
    updateDropdown(message.data);
  } else if (message.action === "getManagementTab") {
    browser.tabs.query({ url: browser.runtime.getURL("management.html") }).then((tabs) => {
      browser.runtime.sendMessage({ tabId: tabs[0]?.id });
    });
  }
});

function updateDropdown(xpaths) {
  const dropdown = getElement("workflow-dropdown");
  const states = [...new Set(xpaths.map((e) => e.state || "Unnamed Workflow"))];
  dropdown.innerHTML =
    '<option value="">Select Workflow</option>' +
    states.map((state) => `<option value="${state}">${state}</option>`).join("");
  dropdown.value = currentState || "";
}

getElement("workflow-search").addEventListener("input", (e) => {
  const search = e.target.value.toLowerCase();
  browser.runtime.sendMessage({ action: "loadXPaths" }).then((response) => {
    const filtered = response.data.filter((e) =>
      (e.state || "Unnamed Workflow").toLowerCase().includes(search)
    );
    updateDropdown(filtered);
    renderSidebarList(filtered);
  });
});

getElement("workflow-dropdown").addEventListener("change", (e) => {
  currentState = e.target.value || null;
  browser.storage.local.set({ currentState });
  browser.runtime.sendMessage({ action: "workflowSet", currentState });
  browser.runtime.sendMessage({ action: "loadXPaths" });
});

function logToBackground(message) {
  browser.runtime.sendMessage({ action: "logMessage", message });
}

// Show workflow dialog when sidebar loads
showWorkflowDialog();
updateToggleButton();