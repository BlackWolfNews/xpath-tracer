console.log("content.js loaded");

let isCapturing = false;

function generateXPath(element) {
  if (element.id) return `//*[@id="${element.id}"]`;
  if (element === document.body) return "/html/body";
  let ix = 0;
  const siblings = element.parentNode
    ? Array.from(element.parentNode.childNodes).filter((e) => e.nodeType === 1)
    : [];
  const tagName = element.tagName.toLowerCase();
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      const path = generateXPath(element.parentNode) + `/${tagName}[${ix + 1}]`;
      if (element.className) {
        const classes = element.className.split(" ").filter((c) => c);
        if (classes.length) return `${path}[contains(@class, "${classes[0]}")]`;
      }
      return path;
    }
    if (sibling.nodeName.toLowerCase() === tagName) ix++;
  }
  return "";
}

function generateCSSPath(element) {
  if (element === document.body) return "body";
  const path = [];
  let current = element;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    }
    const siblings = Array.from(current.parentNode.childNodes).filter(
      (e) => e.nodeType === 1 && e.tagName === current.tagName
    );
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }
    path.unshift(selector);
    current = current.parentNode;
  }
  return "body > " + path.join(" > ");
}

function getElementData(event) {
  const element = event.target;
  const xpath = generateXPath(element);
  const rect = element.getBoundingClientRect();
  const cssPath = generateCSSPath(element);
  return {
    xpath,
    tag: element.tagName.toLowerCase(),
    attributes: Object.fromEntries(
      [...element.attributes].map((attr) => [attr.name, attr.value])
    ),
    type: element.type || (element.tagName === "SPAN" ? "button" : "unknown"),
    options:
      element.tagName === "SELECT"
        ? [...element.options].map((opt) => ({
            text: opt.text,
            value: opt.value,
          }))
        : null,
    value: element.value || "",
    label:
      element.name ||
      element.id ||
      element.textContent.trim().slice(0, 20) ||
      "",
    boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    outerHTML: element.outerHTML,
    cssSelector: element.id
      ? `#${element.id}`
      : element.className
      ? `.${element.className.split(" ")[0]}`
      : null,
    cssPath,
  };
}

document.addEventListener("click", (event) => {
  if (isCapturing && event.altKey) {
    event.preventDefault();
    const data = getElementData(event);
    console.log("Alt+Click detected:", { data, url: window.location.href });
    browser.runtime.sendMessage({ data, url: window.location.href });
  }
});

browser.runtime.onMessage.addListener((message) => {
  console.log("Content received message:", message);
  if (message.action === "toggleCapture") {
    isCapturing = message.enabled;
    console.log("Capture", isCapturing ? "enabled" : "disabled");
  } else if (message.action === "highlight") {
    const results = {};
    let start = performance.now();
    results.xpath = highlightByXPath(message.xpath);
    results.xpathTime = performance.now() - start;
    start = performance.now();
    results.cssSelector = highlightByCSS(message.cssSelector);
    results.cssSelectorTime = performance.now() - start;
    start = performance.now();
    results.cssPath = highlightByCSSPath(message.cssPath);
    results.cssPathTime = performance.now() - start;
    console.log("Highlight results:", results);
  } else if (message.action === "clearHighlights") {
    document.querySelectorAll("*").forEach((el) => {
      if (el.style.border === "2px solid red") el.style.border = "";
    });
  }
});

function highlightByXPath(xpath) {
  if (!xpath) {
    console.log("No XPath provided");
    return false;
  }
  try {
    const element = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
    if (element) {
      element.style.border = "2px solid red";
      return true;
    }
    console.log("XPath failed:", xpath);
    return false;
  } catch (err) {
    console.error("XPath error:", err);
    return false;
  }
}

function highlightByCSS(selector) {
  if (!selector) {
    console.log("No CSS selector provided");
    return false;
  }
  try {
    const element = document.querySelector(selector);
    if (element) {
      element.style.border = "2px solid red";
      return true;
    }
    console.log("CSS selector failed:", selector);
    return false;
  } catch (err) {
    console.error("CSS selector error:", err);
    return false;
  }
}

function highlightByCSSPath(path) {
  if (!path) {
    console.log("No CSS path provided");
    return false;
  }
  try {
    const element = document.querySelector(path);
    if (element) {
      element.style.border = "2px solid red";
      return true;
    }
    console.log("CSS path failed:", path);
    return false;
  } catch (err) {
    console.error("CSS path error:", err);
    return false;
  }
}

const observer = new MutationObserver(() => {
  if (isCapturing) {
    console.log("DOM changed—recheck XPaths");
    browser.runtime.sendMessage({ action: "domChanged" });
  }
});
observer.observe(document.body, { childList: true, subtree: true });

console.log("Content script setup complete");