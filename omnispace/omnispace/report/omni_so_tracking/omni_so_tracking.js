// Copyright (c) 2026, Phoebe1113 and contributors
// For license information, please see license.txt

frappe.query_reports["Omni SO Tracking"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -3),
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
		},
		{ fieldname: "customer", label: __("Customer"), fieldtype: "Link", options: "Customer" },
		{ fieldname: "item_code", label: __("Item Code"), fieldtype: "Link", options: "Item" },
		{ fieldname: "sales_order", label: __("Sales Order"), fieldtype: "Link", options: "Sales Order" },
		{
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: "\nTo Deliver and Bill\nTo Bill\nTo Deliver\nCompleted\nOn Hold\nClosed",
		},
		{ fieldname: "include_closed", label: __("Include Closed / Completed"), fieldtype: "Check", default: 0 },
	],

	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (!data) return value;

		// progress %: red = not started, orange = in progress, green = complete
		if (["per_ordered", "per_received", "per_delivered", "per_wo", "per_produced"].includes(column.fieldname)) {
			const v = flt(data[column.fieldname]);
			let color = "#e24c4c";
			if (v >= 100) color = "#2e9e5b";
			else if (v > 0) color = "#e69a1f";
			return `<span style="color:${color};font-weight:600">${value}</span>`;
		}

		// price change vs. last delivered SO: up green, down red
		if (column.fieldname === "per_rate_change") {
			if (!data.last_so) return "";
			const v = flt(data.per_rate_change);
			const color = v > 0 ? "#2e9e5b" : v < 0 ? "#e24c4c" : "inherit";
			return `<span style="color:${color};font-weight:600">${value}</span>`;
		}

		if (column.fieldname === "last_rate" && !data.last_so) return "";
		return value;
	},
};
