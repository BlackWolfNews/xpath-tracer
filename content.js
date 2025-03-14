console.log("content.js loaded");

let isCapturing = false;
let lastClickedElement = null; // Add this at the top of content.js

const observer = new MutationObserver((mutations) => {
  if (isCapturing) {
    console.log("DOM changed—rechecking paths");
    if (lastClickedElement) {
      const data = getElementData({ target: lastClickedElement });
      browser.runtime.sendMessage({
        action: "updatePaths",
        data: data,
        url: window.location.href
      });
    }
    browser.runtime.sendMessage({ action: "domChanged" });
  }
});
observer.observe(document.body, {
  childList: true,    // Watch for added/removed elements
  subtree: true,      // Watch the whole DOM tree
  attributes: true    // Watch for attribute changes (e.g., class updates)
});

function generateXPath(element) {
  if (!element) return '';
  if (element.id) return `//*[@id="${element.id}"]`; // Use ID if available
  if (element === document.body) return '/html/body';

  const tagName = element.tagName.toLowerCase();
  let path = '';
  let current = element;

  while (current && current !== document.body) {
    let selector = tagName;
    // Add unique attributes
    if (current.id) {
      return `//*[@id="${current.id}"]`;
    } else if (current.name) {
      selector += `[name="${current.name}"]`;
    } else if (current.className) {
      const classes = current.className.split(" ").filter(c => c).join(".");
      selector += `[contains(@class, "${classes}")]`;
    }

    // Add index only if needed
    const siblings = Array.from(current.parentNode.children).filter(
      sib => sib.tagName.toLowerCase() === tagName
    );
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      selector += `[${index}]`;
    }

    path = `/${selector}${path}`;
    current = current.parentNode;
  }

  return path ? `//${path.slice(1)}` : '/html/body';
}

function generateCSSPath(element) {
  if (!element) return '';
  if (element === document.body) return 'body';

  let path = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      path.unshift(`#${current.id}`);
      break;
    } else if (current.name) {
      selector += `[name="${current.name}"]`;
    } else if (current.className) {
      const classes = current.className.split(" ").filter(c => c).join(".");
      selector += `.${classes}`;
    }

    // Add index only if needed
    const siblings = Array.from(current.parentNode.children).filter(
      sib => sib.tagName === current.tagName
    );
    if (siblings.length > 1) {
      const index = Array.from(current.parentNode.children).indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }

    path.unshift(selector);
    current = current.parentNode;
  }

  return path.length ? path.join(" > ") : 'body';
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
      : element.name
      ? `[name="${element.name}"]`
      : element.className
      ? `.${element.className.split(" ")[0]}`
      : element.tagName.toLowerCase(), // Fallback to tag
    cssPath,
  };
}

document.addEventListener("click", (e) => {
  if (!isCapturing || !e.altKey) return;
  e.preventDefault();
  e.stopPropagation();
  const data = getElementData(e.target);
  console.log("Captured:", data);
  browser.runtime.sendMessage({ action: "relayData", data, url: window.location.href });
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
    browser.runtime.sendMessage({
      action: "updateStats",
      xpath: message.xpath,
      results: { xpath: results.xpath, cssSelector: results.cssSelector, cssPath: results.cssPath, xpathTime: results.xpathTime, cssSelectorTime: results.cssSelectorTime, cssPathTime: results.cssPathTime }
    });
  } else if (message.action === "altClick" && !message.handled) {
    message.handled = true; // Prevent duplicate sends
    browser.runtime.sendMessage({ data: message.data, url: message.url });
  } else if (message.action === "clearHighlights") {
    document.querySelectorAll("*").forEach((el) => {
      if (el.style.border === "2px solid #4444ff") el.style.border = "";
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
      element.style.border = "2px solid #4444ff";
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
      element.style.border = "2px solid #4444ff";
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
      element.style.border = "2px solid #4444ff";
      return true;
    }
    console.log("CSS path failed:", path);
    return false;
  } catch (err) {
    console.error("CSS path error:", err);
    return false;
  }
}