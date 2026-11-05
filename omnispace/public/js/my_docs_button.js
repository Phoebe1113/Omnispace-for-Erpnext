// "My Documents" button on List views: toggles a filter on owner = current user.
// Shown on every submittable DocType; toggled in Omni Settings.
(function () {
  const EXCLUDE = [];        // DocTypes to skip, e.g. ["Journal Entry"]
  const INCLUDE_EXTRA = [];  // non-submittable DocTypes that should still get the button

  function setActive(lv, btn) {
    const on = lv.filter_area.exists("owner");
    btn.toggleClass("btn-primary", on).toggleClass("btn-default", !on);
  }

  function addButton() {
    const [view, dt] = frappe.get_route() || [];
    if (!(frappe.boot.omnispace || {}).my_documents) return;
    if (view !== "List" || !dt) return;

    frappe.model.with_doctype(dt, () => {
      const meta = frappe.get_meta(dt);
      const ok = meta && (meta.is_submittable || INCLUDE_EXTRA.includes(dt)) && !EXCLUDE.includes(dt);
      if (!ok) return;

      const tryAdd = (n = 0) => {
        const lv = window.cur_list;
        if (!(lv && lv.doctype === dt && lv.page && lv.filter_area)) {
          if (n < 20) setTimeout(() => tryAdd(n + 1), 150);
          return;
        }
        if (lv.__omni_my_btn) return setActive(lv, lv.__omni_my_btn);  // avoid duplicate buttons

        const btn = lv.page.add_inner_button(__("My Documents"), () => {
          const p = lv.filter_area.exists("owner")
            ? lv.filter_area.remove("owner")
            : lv.filter_area.add([[dt, "owner", "=", frappe.session.user]]);
          Promise.resolve(p).then(() => setActive(lv, btn));
        });
        lv.__omni_my_btn = btn;
        setActive(lv, btn);
      };
      tryAdd();
    });
  }

  frappe.router.on("change", addButton);
  $(document).ready(() => setTimeout(addButton, 500));
})();
