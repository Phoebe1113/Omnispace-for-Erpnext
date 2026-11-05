frappe.listview_settings["Omni Rule"] = {
	get_indicator(doc) {
		return doc.enabled ? [__("Enabled"), "green", "enabled,=,1"] : [__("Disabled"), "gray", "enabled,=,0"];
	},
};
