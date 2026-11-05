"""Data for the Omnispace side panel shown on every enabled form."""

import json

import frappe
from frappe import _
from frappe.utils import cint, get_fullname, now_datetime, time_diff_in_hours

from omnispace.rules import form_rules
from omnispace.settings import can_view_panel, get_settings, panel_enabled_for

SKIP_LINK_TARGETS = {"User", "Currency", "Company", "UOM", "DocType", "Role", "Print Format", "Letter Head"}
MAX_LINKS = 30
MAX_BACKLINKS_PER_DOCTYPE = 10


@frappe.whitelist()
def get_panel(doctype, name):
	settings = get_settings()
	if not panel_enabled_for(doctype, settings) or not can_view_panel(settings):
		frappe.throw(_("Omnispace panel is not enabled for {0}").format(_(doctype)), frappe.PermissionError)
	frappe.has_permission(doctype, "read", name, throw=True)

	doc = frappe.get_doc(doctype, name)
	meta = frappe.get_meta(doctype)
	limit = cint(settings.history_limit) or 20

	return {
		"overview": _overview(doc, meta),
		"history": _history(doc, meta, limit),
		"comments": _comments(doc, limit),
		"links": _forward_links(doc, meta),
		"backlinks": _backlinks(doc),
		"tabs": _provider_tabs(doc),
		"rules": form_rules(doc),
	}


@frappe.whitelist()
def get_anchor_tabs(doctype, name):
	"""Provider tabs that fill Omni Anchor fields (HTML fields on the form itself)."""
	if not get_settings().enabled:
		return []
	frappe.has_permission(doctype, "read", name, throw=True)
	anchors = set(get_anchors().get(doctype, []))
	if not anchors:
		return []
	doc = frappe.get_doc(doctype, name)
	return [t for t in _provider_tabs(doc) if t.get("anchor") in anchors]


def get_anchors():
	"""{doctype: [fieldname, ...]} declared by apps through the omnispace_anchors hook."""
	hooks = frappe.get_hooks("omnispace_anchors") or {}
	return {dt: list(dict.fromkeys(fields)) for dt, fields in hooks.items()}


@frappe.whitelist()
def get_form_rules(doctype, name):
	frappe.has_permission(doctype, "read", name, throw=True)
	return form_rules(frappe.get_doc(doctype, name))


def _user(u):
	return {"user": u, "name": get_fullname(u)} if u else None


def _overview(doc, meta):
	assigned = []
	try:
		assigned = json.loads(doc.get("_assign") or "[]")
	except ValueError:
		pass
	ref = {"reference_doctype": doc.doctype, "reference_name": doc.name}
	return {
		"title": doc.get_title(),
		"docstatus": doc.docstatus,
		"status": doc.get("status"),
		"workflow_state": doc.get("workflow_state"),
		"owner": _user(doc.owner),
		"creation": doc.creation,
		"modified_by": _user(doc.modified_by),
		"modified": doc.modified,
		"idle_hours": round(time_diff_in_hours(now_datetime(), doc.modified), 1),
		"assigned": [_user(u) for u in assigned],
		"versions": frappe.db.count("Version", {"ref_doctype": doc.doctype, "docname": doc.name}),
		"comments": frappe.db.count("Comment", {**ref, "comment_type": "Comment"}),
		"attachments": frappe.db.count(
			"File", {"attached_to_doctype": doc.doctype, "attached_to_name": doc.name}
		),
		"next_actions": _next_actions(doc),
		"track_changes": cint(meta.track_changes),
	}


def _next_actions(doc):
	try:
		from frappe.model.workflow import get_transitions

		return sorted({t.action for t in get_transitions(doc)})
	except Exception:
		return []


def _label(meta, fieldname):
	df = meta.get_field(fieldname)
	return _(df.label) if df and df.label else fieldname


def _short(v):
	if v is None or v == "":
		return ""
	s = str(v)
	return s if len(s) <= 120 else s[:117] + "..."


def _history(doc, meta, limit):
	rows = frappe.get_all(
		"Version",
		filters={"ref_doctype": doc.doctype, "docname": doc.name},
		fields=["owner", "creation", "data"],
		order_by="creation desc",
		limit=limit,
	)
	out = []
	for r in rows:
		try:
			data = json.loads(r.data or "{}")
		except ValueError:
			continue
		changes = [
			{"field": _label(meta, f), "old": _short(o), "new": _short(n)} for f, o, n in data.get("changed", [])
		]
		for table, idx, _rowname, fields in data.get("row_changed", []):
			tlabel = _label(meta, table)
			child_meta = frappe.get_meta(meta.get_field(table).options) if meta.get_field(table) else meta
			for f, o, n in fields:
				changes.append(
					{"field": f"{tlabel} #{idx} · {_label(child_meta, f)}", "old": _short(o), "new": _short(n)}
				)
		out.append(
			{
				"by": _user(r.owner),
				"at": r.creation,
				"changes": changes,
				"rows_added": len(data.get("added", [])),
				"rows_removed": len(data.get("removed", [])),
			}
		)
	return out


def _comments(doc, limit):
	return frappe.get_all(
		"Comment",
		filters={
			"reference_doctype": doc.doctype,
			"reference_name": doc.name,
			"comment_type": ["in", ["Comment", "Workflow", "Assigned", "Attachment", "Info"]],
		},
		fields=["comment_type", "content", "owner", "creation"],
		order_by="creation desc",
		limit=limit,
	)


def _readable(doctype, name):
	try:
		return frappe.has_permission(doctype, "read", name)
	except Exception:
		return False


def _forward_links(doc, meta):
	"""Documents this one points to: parent Link fields, plus submittable links inside child tables."""
	seen, out = set(), []

	def add(target, value, label):
		key = (target, value)
		if key in seen or len(out) >= MAX_LINKS or target in SKIP_LINK_TARGETS:
			return
		seen.add(key)
		if _readable(target, value):
			out.append({"doctype": target, "name": value, "via": label})

	for df in meta.get("fields", {"fieldtype": "Link"}):
		if doc.get(df.fieldname):
			add(df.options, doc.get(df.fieldname), _(df.label or df.fieldname))

	for tdf in meta.get_table_fields():
		cmeta = frappe.get_meta(tdf.options)
		links = [
			df
			for df in cmeta.get("fields", {"fieldtype": "Link"})
			if df.options not in SKIP_LINK_TARGETS and frappe.get_meta(df.options).is_submittable
		]
		for row in doc.get(tdf.fieldname) or []:
			for df in links:
				if row.get(df.fieldname):
					add(df.options, row.get(df.fieldname), _(tdf.label or tdf.fieldname))
	return out


def _backlinks(doc):
	"""Documents that point to this one (same source as the form's Connections)."""
	try:
		from frappe.desk.form.linked_with import get_linked_docs, get_linked_doctypes

		linked = get_linked_docs(doc.doctype, doc.name, get_linked_doctypes(doc.doctype)) or {}
	except Exception:
		return []
	out = []
	for dt, rows in linked.items():
		if not frappe.has_permission(dt, "read"):
			continue
		names = []
		for r in rows:
			if len(names) >= MAX_BACKLINKS_PER_DOCTYPE:
				break
			n = r.get("name")
			if n and _readable(dt, n):
				names.append({"name": n, "docstatus": r.get("docstatus")})
		if names:
			out.append({"doctype": dt, "count": len(rows), "docs": names})
	return sorted(out, key=lambda x: x["doctype"])


def _provider_tabs(doc):
	hooks = frappe.get_hooks("omnispace_providers") or {}
	paths = list(hooks.get(doc.doctype, [])) + list(hooks.get("*", []))
	tabs = []
	for path in paths:
		try:
			res = frappe.get_attr(path)(doc)
		except Exception:
			frappe.log_error(title=f"Omnispace provider failed: {path}")
			tabs.append({"label": path.rsplit(".", 1)[-1], "error": _("This tab could not be loaded")})
			continue
		if not res:
			continue
		tabs.extend(res if isinstance(res, list) else [res])
	return tabs
