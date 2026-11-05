import frappe

DEFAULTS = frappe._dict(
	enabled=1,
	all_doctypes=0,
	panel_doctypes=[],
	history_limit=20,
	panel_roles=[],
	enable_my_documents=1,
	enable_notification_colors=1,
)


def get_settings():
	"""Omni Settings as a plain dict; falls back to defaults before the first migrate."""
	try:
		s = frappe.get_cached_doc("Omni Settings")
	except Exception:
		return DEFAULTS
	return frappe._dict(
		enabled=s.enabled,
		all_doctypes=s.all_doctypes,
		panel_doctypes=[r.reference_doctype for r in s.panel_doctypes],
		history_limit=s.history_limit or 20,
		panel_roles=[r.role for r in s.panel_roles],
		enable_my_documents=s.enable_my_documents,
		enable_notification_colors=s.enable_notification_colors,
	)


def can_view_panel(settings=None, user=None):
	settings = settings or get_settings()
	if not settings.enabled:
		return False
	if not settings.panel_roles:
		return True
	return bool(set(settings.panel_roles) & set(frappe.get_roles(user)))


def panel_enabled_for(doctype, settings=None):
	settings = settings or get_settings()
	if not settings.enabled or doctype.startswith("Omni "):
		return False
	return bool(settings.all_doctypes) or doctype in settings.panel_doctypes
