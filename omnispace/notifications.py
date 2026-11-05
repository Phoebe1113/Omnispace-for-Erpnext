"""Color notification items by the status of the document they refer to.

red = waiting for action, green = approved/submitted, yellow = cancelled/rejected, gray = draft.
"""

import frappe


def _wf_info(doctype):
	wf = frappe.db.get_value("Workflow", {"document_type": doctype, "is_active": 1}, "name")
	if not wf:
		return None
	has_next = set(frappe.get_all("Workflow Transition", filters={"parent": wf}, pluck="state"))
	states = set(frappe.get_all("Workflow Document State", filters={"parent": wf}, pluck="state"))
	return {"final": states - has_next}


@frappe.whitelist()
def get_notification_colors(names):
	names = frappe.parse_json(names)
	rows = frappe.get_all(
		"Notification Log",
		filters={"name": ["in", names], "for_user": frappe.session.user},
		fields=["name", "document_type", "document_name"],
	)
	cache = {}
	return {r.name: _color_for(r.document_type, r.document_name, cache) for r in rows}


def _color_for(doctype, docname, cache):
	if not (doctype and docname and frappe.db.exists(doctype, docname)):
		return "gray"
	if doctype not in cache:
		cache[doctype] = _wf_info(doctype)
	info = cache[doctype]
	fields = ["docstatus"]
	if info and frappe.get_meta(doctype).has_field("workflow_state"):
		fields.append("workflow_state")
	d = frappe.db.get_value(doctype, docname, fields, as_dict=True)
	if d.docstatus == 2:
		return "yellow"
	state = d.get("workflow_state")
	if info and state:
		if "Rejected" in state:
			return "yellow"
		if state in info["final"]:
			return "green"
		if state == "Draft":
			return "gray"
		return "red"
	return "green" if d.docstatus == 1 else "gray"
