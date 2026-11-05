"""Omni Rule engine.

Server-side enforcement is the real control: it runs on every save/submit/cancel,
whether the change comes from the form, the REST API or Data Import.
The client only mirrors Mandatory / Read Only rules for a better UX.
"""

import frappe
from frappe import _

CACHE_KEY = "omnispace_rules"
EVENT_OF_HOOK = {"validate": "Save", "before_submit": "Submit", "before_cancel": "Cancel"}


def split_fields(value):
	return [f.strip() for f in (value or "").replace(",", "\n").splitlines() if f.strip()]


def clear_rules_cache():
	frappe.cache.delete_key(CACHE_KEY)
	frappe.cache.delete_key("bootinfo")


def get_rules(doctype):
	def load():
		if not frappe.db.table_exists("Omni Rule"):
			return []
		rules = frappe.get_all(
			"Omni Rule",
			filters={"enabled": 1, "reference_doctype": doctype},
			fields=["name", "title", "event", "action", "fields", "condition", "message"],
			order_by="creation asc",
		)
		for r in rules:
			r["fields"] = split_fields(r["fields"])
			r["exempt_roles"] = frappe.get_all(
				"Has Role", filters={"parenttype": "Omni Rule", "parent": r["name"]}, pluck="role"
			)
		return rules

	return frappe.cache.hget(CACHE_KEY, doctype, load) or []


def rule_doctypes():
	if not frappe.db.table_exists("Omni Rule"):
		return []
	return frappe.get_all(
		"Omni Rule", filters={"enabled": 1}, pluck="reference_doctype", distinct=True
	)


def _skip(doc):
	f = frappe.flags
	return (
		doc.doctype.startswith("Omni ")
		or f.in_install
		or f.in_migrate
		or f.in_patch
		or f.in_fixtures
		or frappe.session.user == "Administrator"
	)


def _exempt(rule, roles):
	return bool(rule["exempt_roles"] and set(rule["exempt_roles"]) & roles)


def condition_holds(rule, doc):
	if not rule.get("condition"):
		return True
	try:
		return bool(frappe.safe_eval(rule["condition"], None, {"doc": doc}))
	except Exception:
		frappe.log_error(title=f"Omni Rule {rule['name']}: condition failed")
		frappe.throw(_("Omni Rule {0} has an invalid condition. Contact your administrator.").format(rule["name"]))


def _label(meta, fieldname):
	df = meta.get_field(fieldname)
	return _(df.label) if df and df.label else fieldname


def enforce(doc, event):
	if _skip(doc):
		return
	rules = [r for r in get_rules(doc.doctype) if r["event"] == event]
	if not rules:
		return
	roles = set(frappe.get_roles())
	meta = frappe.get_meta(doc.doctype)

	for rule in rules:
		if _exempt(rule, roles) or not condition_holds(rule, doc):
			continue
		msg = _(rule["message"]) if rule.get("message") else None
		action = rule["action"]

		if action == "Block":
			frappe.throw(msg or _("Blocked by rule: {0}").format(rule["title"]), title=_("Not Allowed"))

		elif action == "Mandatory":
			missing = [f for f in rule["fields"] if not doc.get(f)]
			if missing:
				labels = ", ".join(_label(meta, f) for f in missing)
				frappe.throw(msg or _("Required by rule {0}: {1}").format(rule["title"], labels), title=_("Missing Values"))

		elif action == "Read Only":
			if doc.is_new():
				continue
			changed = [f for f in rule["fields"] if doc.has_value_changed(f)]
			if changed:
				labels = ", ".join(_label(meta, f) for f in changed)
				frappe.throw(msg or _("Locked by rule {0}: {1}").format(rule["title"], labels), title=_("Not Allowed"))

		elif action == "Warning":
			frappe.msgprint(msg or rule["title"], title=_("Warning"), indicator="orange", alert=True)


def on_validate(doc, method=None):
	enforce(doc, "Save")


def on_submit(doc, method=None):
	enforce(doc, "Submit")


def on_cancel(doc, method=None):
	enforce(doc, "Cancel")


def form_rules(doc):
	"""Rules the client should mirror for this saved document."""
	out = {"read_only": [], "mandatory": []}
	if frappe.session.user == "Administrator":
		return out
	roles = set(frappe.get_roles())
	for rule in get_rules(doc.doctype):
		if rule["event"] != "Save" or rule["action"] not in ("Read Only", "Mandatory"):
			continue
		if _exempt(rule, roles):
			continue
		try:
			if not condition_holds(rule, doc):
				continue
		except Exception:
			continue
		key = "read_only" if rule["action"] == "Read Only" else "mandatory"
		out[key].extend(f for f in rule["fields"] if f not in out[key])
	return out
