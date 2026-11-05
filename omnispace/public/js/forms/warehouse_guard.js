// Omnispace · Warehouse Guard (client): narrows the warehouse pickers on item rows to the warehouses
// the server will accept. The server (omnispace/warehouse_guard.py) is what blocks or warns.
(function () {
	if (window.__omni_wg_registered) return;
	window.__omni_wg_registered = true;

	const GUARDED = {
		"Sales Order": ["Sales Order Item", ["warehouse"]],
		"Delivery Note": ["Delivery Note Item", ["warehouse"]],
		"Sales Invoice": ["Sales Invoice Item", ["warehouse"]],
		"Purchase Order": ["Purchase Order Item", ["warehouse"]],
		"Purchase Receipt": ["Purchase Receipt Item", ["warehouse"]],
		"Purchase Invoice": ["Purchase Invoice Item", ["warehouse"]],
		"Material Request": ["Material Request Item", ["warehouse", "from_warehouse"]],
		"Stock Entry": ["Stock Entry Detail", ["s_warehouse", "t_warehouse"]],
	};
	const on = () => !!(frappe.boot.omnispace || {}).warehouse_guard;

	function load(frm) {
		if (!on() || !frm.doc.company) return;
		clearTimeout(frm.__omni_wg_timer);
		frm.__omni_wg_timer = setTimeout(() => {
			frappe
				.xcall("omnispace.warehouse_guard.get_context", { doc: frm.doc })
				.then((ctx) => {
					frm.__omni_wg = ctx || { active: 0 };
				})
				.catch(() => (frm.__omni_wg = { active: 0 }));
		}, 300);
	}

	function setup(frm) {
		if (!on() || frm.__omni_wg_queries) return;
		frm.__omni_wg_queries = true;
		const [, fields] = GUARDED[frm.doctype];
		fields.forEach((f) => {
			frm.set_query(f, "items", (doc, cdt, cdn) => {
				const base = { company: doc.company, is_group: 0 };
				const ctx = frm.__omni_wg;
				const row = locals[cdt][cdn];
				const home = ctx && ctx.active && ctx.homes && ctx.homes[row.item_code];
				if (!home) return { filters: base };
				const allowed = ctx.strict ? [home] : [home, ...(ctx.production || [])];
				return { filters: { ...base, name: ["in", allowed] } };
			});
		});
	}

	Object.entries(GUARDED).forEach(([dt, [child]]) => {
		frappe.ui.form.on(dt, {
			onload(frm) {
				setup(frm);
			},
			refresh(frm) {
				setup(frm);
				load(frm);
			},
			company: load,
			material_request_type: load,
			update_stock: load,
			work_order: load,
		});
		frappe.ui.form.on(child, {
			item_code(frm) {
				load(frm);
			},
		});
	});
})();
