const ATTR = "data-cursor-ref";

function strip(root: ParentNode | Node | null) {
  if (!root) return;
  if (root instanceof Element && root.hasAttribute(ATTR)) {
    root.removeAttribute(ATTR);
  }
  if (!(root instanceof Element) && !(root instanceof Document)) return;
  root.querySelectorAll(`[${ATTR}]`).forEach((node) => node.removeAttribute(ATTR));
}

strip(document.documentElement);

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.attributeName === ATTR && mutation.target instanceof Element) {
      mutation.target.removeAttribute(ATTR);
    }
    mutation.addedNodes.forEach(strip);
  }
});

observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: [ATTR],
});

window.setTimeout(() => observer.disconnect(), 4000);
