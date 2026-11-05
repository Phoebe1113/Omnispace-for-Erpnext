app_name = "omnispace"
app_title = "Omnispace"
app_publisher = "Phoebe1113"
app_description = "History, context and control panel for every ERPNext DocType"
app_email = "vybs1@asmachining.com"
app_license = "mit"
required_apps = ["frappe"]

# JS is served through a whitelisted endpoint instead of /assets so it keeps working
# on frappe_docker setups where the shared "sites" volume holds stale built assets.
app_include_js = ["/api/method/omnispace.assets.bundle_js"]

boot_session = "omnispace.boot.boot_session"

after_install = "omnispace.install.after_install"
after_migrate = "omnispace.install.after_migrate"

# Inline sections on standard ERPNext forms (each one can be switched off in Omni Settings)
doctype_js = {
	"Sales Order": "public/js/forms/sales_order.js",
	"Delivery Note": "public/js/forms/delivery_note.js",
	"Purchase Receipt": "public/js/forms/purchase_receipt.js",
	"Material Request": "public/js/forms/material_request.js",
	"Purchase Order": "public/js/forms/purchase_order.js",
}

# Omni Rule enforcement runs server-side for every DocType (form, API, import).
doc_events = {
	"*": {
		"validate": "omnispace.rules.on_validate",
		"before_submit": "omnispace.rules.on_submit",
		"before_cancel": "omnispace.rules.on_cancel",
	}
}

# Other apps extend the panel with their own tabs, e.g. in their hooks.py:
#   omnispace_providers = {"Sales Order": "my_app.omni.so_tracking"}
# A provider is called with the document and returns one tab dict or a list of them:
#   {"label": "...", "html": "..."}  or  {"label": "...", "columns": [...], "rows": [...]}
