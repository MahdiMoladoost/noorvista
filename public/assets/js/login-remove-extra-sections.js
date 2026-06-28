// NOORVISTA Login Remove Extra Sections
(function () {
  if (window.__NV_LOGIN_REMOVE_EXTRA_SECTIONS__) return;
  window.__NV_LOGIN_REMOVE_EXTRA_SECTIONS__ = true;

  const texts = [
    "مدیریت نوبت‌ها",
    "پرونده بیماران",
    "برنامه پزشکان",
    "ورود کاربری",
    "سرور و دیتابیس متصل هستند",
    "سرور و دیتابیس متصل هستند"
  ];

  function removeByText() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const value = (node.nodeValue || "").trim();
      if (texts.some(text => value.includes(text))) {
        nodes.push(node);
      }
    }

    nodes.forEach(node => {
      let el = node.parentElement;
      if (!el) return;

      if (node.nodeValue.includes("ورود کاربری")) {
        el.remove();
        return;
      }

      for (let i = 0; i < 4 && el.parentElement; i++) {
        const cls = el.className || "";
        const tag = el.tagName ? el.tagName.toLowerCase() : "";
        if (
          /feature|status|server|db|connection|highlight|badge|item|card/.test(String(cls)) ||
          ["li", "p", "span", "h1", "h2", "h3"].includes(tag)
        ) {
          break;
        }
        el = el.parentElement;
      }

      el.remove();
    });
  }

  function init() {
    removeByText();

    const observerTarget = document.body;
    if (!observerTarget || observerTarget.dataset.nvLoginRemoveObserved === "1") return;

    observerTarget.dataset.nvLoginRemoveObserved = "1";
    let timer = null;

    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(removeByText, 50);
    }).observe(observerTarget, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("load", () => {
    setTimeout(removeByText, 100);
    setTimeout(removeByText, 500);
  });
})();
