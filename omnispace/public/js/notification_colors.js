// Color notification items by the status of the referenced document (see omnispace/notifications.py).
(function () {
  const C = { red: "#e03636", yellow: "#d4a017", green: "#2f9e44", gray: "#868e96" };
  let cache = {}, timer;
  setInterval(() => { cache = {}; }, 60000);
  function paint() {
    if (!(frappe.boot.omnispace || {}).notification_colors) return;
    const items = [...document.querySelectorAll("a.notification-item[data-name]")];
    if (!items.length) return;
    const apply = () => items.forEach(a => {
      const c = C[cache[a.dataset.name]];
      if (!c) return;
      a.style.boxShadow = `inset 4px 0 0 ${c}`;
      const m = a.querySelector(".message > div");
      if (m) m.style.color = c;
    });
    const missing = items.map(a => a.dataset.name).filter(n => !(n in cache));
    if (!missing.length) return apply();
    frappe.call({
      method: "omnispace.notifications.get_notification_colors",
      args: { names: missing },
      callback(r) {
        Object.assign(cache, r.message || {});
        missing.forEach(n => { if (!(n in cache)) cache[n] = null; });
        apply();
      },
    });
  }
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(paint, 300); })
    .observe(document.body, { childList: true, subtree: true });
})();
