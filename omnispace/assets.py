"""Serve the desk JS bundle through a whitelisted method.

frappe_docker keeps built assets in the shared "sites" volume, so files added by a new
image may not appear under /assets until the volume is refreshed. Serving the JS from
the app code avoids that.
"""

import frappe
from werkzeug.wrappers import Response

FILES = ("omni_panel.js", "my_docs_button.js", "notification_colors.js")


@frappe.whitelist()
def bundle_js():
	parts = []
	for name in FILES:
		with open(frappe.get_app_path("omnispace", "public", "js", name), encoding="utf-8") as f:
			parts.append(f"/* omnispace: {name} */\n{f.read()}")
	resp = Response("\n;\n".join(parts), mimetype="text/javascript")
	resp.headers["Cache-Control"] = "private, max-age=300"
	return resp
