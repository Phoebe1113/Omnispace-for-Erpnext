import frappe

from omnispace.panel import get_anchors
from omnispace.rules import rule_doctypes
from omnispace.settings import can_view_panel, enabled_features, get_settings


def boot_session(bootinfo):
	if frappe.session.user == "Guest":
		return
	s = get_settings()
	try:
		rdt = rule_doctypes() if s.enabled else []
	except Exception:
		rdt = []
	bootinfo.omnispace = {
		"enabled": int(bool(s.enabled)),
		"all_doctypes": int(bool(s.all_doctypes)),
		"panel_doctypes": s.panel_doctypes,
		"can_view_panel": int(can_view_panel(s)),
		"my_documents": int(bool(s.enabled and s.enable_my_documents)),
		"notification_colors": int(bool(s.enabled and s.enable_notification_colors)),
		"rule_doctypes": rdt,
		"anchors": get_anchors() if s.enabled else {},
		"features": enabled_features(s),
	}
