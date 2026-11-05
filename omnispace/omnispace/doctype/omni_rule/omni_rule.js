// Copyright (c) 2026, Phoebe1113 and contributors
// For license information, please see license.txt

frappe.ui.form.on("Omni Rule", {
	refresh(frm) {
		frm.set_query("reference_doctype", () => ({ filters: { istable: 0, issingle: 0 } }));
	},
});
