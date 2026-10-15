(function () {
  var ATTR = "data-cursor-ref";

  function strip(root) {
    if (!root) return;
    if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute(ATTR)) {
      root.removeAttribute(ATTR);
    }
    if (!root.querySelectorAll) return;
    var nodes = root.querySelectorAll("[" + ATTR + "]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute(ATTR);
    }
  }

  strip(document.documentElement);

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];
      if (mutation.attributeName === ATTR && mutation.target.removeAttribute) {
        mutation.target.removeAttribute(ATTR);
      }
      if (mutation.addedNodes) {
        for (var j = 0; j < mutation.addedNodes.length; j++) {
          strip(mutation.addedNodes[j]);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [ATTR],
  });

  window.setTimeout(function () {
    observer.disconnect();
  }, 4000);
})();
