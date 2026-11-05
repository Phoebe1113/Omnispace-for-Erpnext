# Copyright (c) 2026, Phoebe1113 and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from omnispace.rules import clear_rules_cache, split_fields


class OmniRule(Document):
	def validate(self):
		if self.reference_doctype.startswith("Omni "):
			frappe.throw(_("Omni Rules cannot target Omnispace DocTypes"))

		if self.action in ("Mandatory", "Read Only"):
			meta = frappe.get_meta(self.reference_doctype)
			names = split_fields(self.fields)
			if not names:
				frappe.throw(_("Fields are required for action {0}").format(self.action))
			unknown = [f for f in names if not meta.has_field(f)]
			if unknown:
				frappe.throw(
					_("Unknown fields in {0}: {1}").format(self.reference_doctype, ", ".join(unknown))
				)

		if self.condition:
			try:
				compile(self.condition, "<omni rule>", "eval")
			except SyntaxError as e:
				frappe.throw(_("Invalid condition: {0}").format(e))

	def on_update(self):
		clear_rules_cache()

	def on_trash(self):
		clear_rules_cache()
