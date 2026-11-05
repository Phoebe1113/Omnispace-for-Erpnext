"""Data for the inline tracking sections on Sales Order and Delivery Note."""

import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_so_tracking(sales_order):
	"""One row per Sales Order line; same logic as the Omni SO Tracking report."""
	from omnispace.omnispace.report.omni_so_tracking.omni_so_tracking import get_data

	frappe.has_permission("Sales Order", "read", sales_order, throw=True)
	return get_data(frappe._dict(sales_order=sales_order, include_closed=1))


@frappe.whitelist()
def get_dn_tracking(delivery_note):
	"""Per Delivery Note line: delivered so far (all submitted DNs) vs. Sales Order qty, plus other DNs."""
	frappe.has_permission("Delivery Note", "read", delivery_note, throw=True)
	dn = frappe.get_doc("Delivery Note", delivery_note)
	out = []
	for it in dn.items:
		row = frappe._dict(
			item_code=it.item_code, item_name=it.item_name, uom=it.uom,
			dn_qty=flt(it.qty), sales_order=it.against_sales_order, so_detail=it.so_detail,
			so_qty=0, delivered_qty=0, remaining=0, per_delivered=0, other_dns=[],
		)
		if it.against_sales_order and it.so_detail:
			soi = frappe.db.get_value("Sales Order Item", it.so_detail, ["qty", "delivered_qty"], as_dict=True)
			if soi:
				row.so_qty = flt(soi.qty)
				# delivered_qty on the SO only counts submitted DNs; add this draft for a preview
				row.delivered_qty = flt(soi.delivered_qty) + (flt(it.qty) if dn.docstatus == 0 else 0)
				row.remaining = max(row.so_qty - row.delivered_qty, 0)
				row.per_delivered = row.delivered_qty / row.so_qty * 100 if row.so_qty else 0
			row.other_dns = frappe.db.sql(
				"""select dni.parent, dn.posting_date, dn.docstatus, sum(dni.qty) as qty
				   from `tabDelivery Note Item` dni join `tabDelivery Note` dn on dn.name = dni.parent
				   where dni.so_detail = %s and dni.parent != %s and dn.docstatus < 2
				   group by dni.parent, dn.posting_date, dn.docstatus order by dn.posting_date""",
				(it.so_detail, delivery_note), as_dict=True,
			)
		out.append(row)
	return out
