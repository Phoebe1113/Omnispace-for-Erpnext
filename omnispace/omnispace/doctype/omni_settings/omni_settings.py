# Copyright (c) 2026, Phoebe1113 and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class OmniSettings(Document):
	def validate(self):
		seen = set()
		for row in self.panel_doctypes:
			if row.reference_doctype in seen:
				frappe.throw(frappe._("Row {0}: {1} is listed twice").format(row.idx, row.reference_doctype))
			seen.add(row.reference_doctype)

	def on_update(self):
		# Panel/feature flags are sent at boot, so drop cached boot info.
		frappe.cache.delete_key("bootinfo")
