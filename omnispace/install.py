import frappe


def after_install():
	ensure_settings_defaults()


def after_migrate():
	ensure_settings_defaults()


def ensure_settings_defaults():
	"""Single DocTypes only get field defaults once saved; write defaults for fields never set
	(fresh install, or a toggle added in a newer version) without touching saved values."""
	if not frappe.db.table_exists("Singles"):
		return
	meta = frappe.get_meta("Omni Settings")
	existing = set(frappe.db.sql_list("select field from `tabSingles` where doctype = 'Omni Settings'"))
	changed = False
	for df in meta.fields:
		if df.fieldtype in ("Check", "Int", "Data", "Select") and df.default not in (None, ""):
			if df.fieldname not in existing:
				frappe.db.set_single_value("Omni Settings", df.fieldname, df.default)
				changed = True
	if changed:
		frappe.clear_cache(doctype="Omni Settings")
		frappe.cache.delete_key("bootinfo")
