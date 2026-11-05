# Copyright (c) 2026, Phoebe1113 and contributors
# For license information, please see license.txt
#
# Omni SO Tracking: follow every Sales Order line
#   - Purchasing: Material Request qty (linked to the SO) -> ordered (PO) -> received, with %
#   - Production: Work Order qty and produced qty, with %
#   - Delivery: delivered qty / SO qty, with %
#   - Price: change vs. the latest delivered SO for the same customer + item

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	filters = frappe._dict(filters or {})
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"label": _("Sales Order"), "fieldname": "sales_order", "fieldtype": "Link", "options": "Sales Order", "width": 150},
		{"label": _("Date"), "fieldname": "transaction_date", "fieldtype": "Date", "width": 95},
		{"label": _("Customer"), "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 110},
		{"label": _("Customer Name"), "fieldname": "customer_name", "fieldtype": "Data", "width": 160},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
		{"label": _("Item Code"), "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 130},
		{"label": _("Item Name"), "fieldname": "item_name", "fieldtype": "Data", "width": 160},
		{"label": _("UOM"), "fieldname": "uom", "fieldtype": "Link", "options": "UOM", "width": 60},
		{"label": _("SO Qty"), "fieldname": "so_qty", "fieldtype": "Float", "width": 80},
		{"label": _("Delivery Date"), "fieldname": "delivery_date", "fieldtype": "Date", "width": 95},
		# --- Purchasing ---
		{"label": _("Material Request"), "fieldname": "material_requests", "fieldtype": "Data", "width": 150},
		{"label": _("MR Qty"), "fieldname": "mr_qty", "fieldtype": "Float", "width": 80},
		{"label": _("PO Qty"), "fieldname": "ordered_qty", "fieldtype": "Float", "width": 80},
		{"label": _("% Ordered"), "fieldname": "per_ordered", "fieldtype": "Percent", "width": 90},
		{"label": _("Received Qty"), "fieldname": "received_qty", "fieldtype": "Float", "width": 90},
		{"label": _("% Received"), "fieldname": "per_received", "fieldtype": "Percent", "width": 90},
		# --- Delivery ---
		{"label": _("Delivered Qty"), "fieldname": "delivered_qty", "fieldtype": "Float", "width": 90},
		{"label": _("% Delivered"), "fieldname": "per_delivered", "fieldtype": "Percent", "width": 90},
		# --- Production ---
		{"label": _("Work Orders"), "fieldname": "work_orders", "fieldtype": "Data", "width": 150},
		{"label": _("WO Qty"), "fieldname": "wo_qty", "fieldtype": "Float", "width": 80},
		{"label": _("% Work Order"), "fieldname": "per_wo", "fieldtype": "Percent", "width": 90},
		{"label": _("Produced Qty"), "fieldname": "produced_qty", "fieldtype": "Float", "width": 90},
		{"label": _("% Produced"), "fieldname": "per_produced", "fieldtype": "Percent", "width": 90},
		# --- Price ---
		{"label": _("Currency"), "fieldname": "currency", "fieldtype": "Link", "options": "Currency", "width": 70},
		{"label": _("Rate"), "fieldname": "rate", "fieldtype": "Currency", "options": "currency", "width": 110, "hidden": 1},
		{"label": _("Last Delivered SO"), "fieldname": "last_so", "fieldtype": "Link", "options": "Sales Order", "width": 150},
		{"label": _("Last SO Date"), "fieldname": "last_so_date", "fieldtype": "Date", "width": 95},
		{"label": _("Last Rate"), "fieldname": "last_rate", "fieldtype": "Currency", "options": "last_currency", "width": 110, "hidden": 1},
		{"label": _("Last Currency"), "fieldname": "last_currency", "fieldtype": "Link", "options": "Currency", "width": 70, "hidden": 1},
		{"label": _("% Rate Change"), "fieldname": "per_rate_change", "fieldtype": "Percent", "width": 100},
	]


def get_conditions(filters):
	conditions = ["so.docstatus = 1"]
	values = {}
	if filters.get("company"):
		conditions.append("so.company = %(company)s")
		values["company"] = filters.company
	if filters.get("from_date"):
		conditions.append("so.transaction_date >= %(from_date)s")
		values["from_date"] = filters.from_date
	if filters.get("to_date"):
		conditions.append("so.transaction_date <= %(to_date)s")
		values["to_date"] = filters.to_date
	if filters.get("customer"):
		conditions.append("so.customer = %(customer)s")
		values["customer"] = filters.customer
	if filters.get("item_code"):
		conditions.append("soi.item_code = %(item_code)s")
		values["item_code"] = filters.item_code
	if filters.get("sales_order"):
		conditions.append("so.name = %(sales_order)s")
		values["sales_order"] = filters.sales_order
	if filters.get("status"):
		conditions.append("so.status = %(status)s")
		values["status"] = filters.status
	elif not filters.get("include_closed"):
		conditions.append("so.status not in ('Closed', 'Completed')")
	return " and ".join(conditions), values


def get_data(filters):
	where, values = get_conditions(filters)

	rows = frappe.db.sql(
		f"""
		select
			so.name as sales_order, so.transaction_date, so.customer, so.customer_name,
			so.status, so.currency, so.conversion_rate,
			soi.name as so_item, soi.item_code, soi.item_name, soi.uom,
			soi.qty as so_qty, soi.delivery_date, soi.rate, soi.base_rate,
			soi.delivered_qty
		from `tabSales Order` so
		inner join `tabSales Order Item` soi on soi.parent = so.name
		where {where}
		order by so.transaction_date desc, so.name desc, soi.idx
		""",
		values,
		as_dict=True,
	)
	if not rows:
		return []

	sos = [r.sales_order for r in rows]
	mr_map = get_mr_map(sos)
	wo_map = get_wo_map(sos)

	data = []
	for r in rows:
		mr = mr_map.get((r.sales_order, r.so_item)) or mr_map.get((r.sales_order, r.item_code)) or frappe._dict()
		r.material_requests = mr.get("names") or ""
		r.mr_qty = flt(mr.get("mr_qty"))
		r.ordered_qty = flt(mr.get("ordered_qty"))
		r.received_qty = flt(mr.get("received_qty"))
		r.per_ordered = pct(r.ordered_qty, r.mr_qty)
		r.per_received = pct(r.received_qty, r.mr_qty)
		r.per_delivered = pct(r.delivered_qty, r.so_qty)

		wo = wo_map.get((r.sales_order, r.so_item)) or wo_map.get((r.sales_order, r.item_code)) or frappe._dict()
		r.work_orders = wo.get("names") or ""
		r.wo_qty = flt(wo.get("wo_qty"))
		r.produced_qty = flt(wo.get("produced_qty"))
		r.per_wo = pct(r.wo_qty, r.so_qty)
		r.per_produced = pct(r.produced_qty, r.so_qty)

		last = get_last_delivered_so(r)
		if last:
			r.last_so = last.name
			r.last_so_date = last.transaction_date
			r.last_rate = last.rate
			r.last_currency = last.currency
			# compare company-currency rates (base_rate) so different currencies stay comparable
			r.per_rate_change = pct_change(r.base_rate, last.base_rate)
		data.append(r)
	return data


def get_mr_map(sales_orders):
	"""Material Request Items linked to the SO, keyed by (SO, SO Item) with (SO, item_code) as fallback."""
	if not sales_orders:
		return {}
	mri = frappe.db.sql(
		"""
		select mri.parent, mri.sales_order, mri.sales_order_item, mri.item_code,
			mri.stock_qty as qty, mri.ordered_qty, mri.received_qty
		from `tabMaterial Request Item` mri
		inner join `tabMaterial Request` mr on mr.name = mri.parent
		where mr.docstatus = 1 and mr.material_request_type = 'Purchase'
			and mri.sales_order in %(sos)s
		""",
		{"sos": sales_orders},
		as_dict=True,
	)
	out = {}
	for m in mri:
		keys = [(m.sales_order, m.item_code)]
		if m.sales_order_item:
			keys.append((m.sales_order, m.sales_order_item))
		for key in keys:
			d = out.setdefault(key, frappe._dict(names=set(), mr_qty=0, ordered_qty=0, received_qty=0))
			d.names.add(m.parent)
			d.mr_qty += flt(m.qty)
			d.ordered_qty += flt(m.ordered_qty)
			d.received_qty += flt(m.received_qty)
	for d in out.values():
		d.names = ", ".join(sorted(d.names))
	return out


def get_wo_map(sales_orders):
	"""Submitted, non-stopped Work Orders linked to the SO, keyed like get_mr_map."""
	if not sales_orders:
		return {}
	wos = frappe.db.sql(
		"""
		select name, sales_order, sales_order_item, production_item, qty, produced_qty
		from `tabWork Order`
		where docstatus = 1 and status != 'Stopped' and sales_order in %(sos)s
		""",
		{"sos": sales_orders},
		as_dict=True,
	)
	out = {}
	for w in wos:
		keys = [(w.sales_order, w.production_item)]
		if w.sales_order_item:
			keys.append((w.sales_order, w.sales_order_item))
		for key in keys:
			d = out.setdefault(key, frappe._dict(names=set(), wo_qty=0, produced_qty=0))
			d.names.add(w.name)
			d.wo_qty += flt(w.qty)
			d.produced_qty += flt(w.produced_qty)
	for d in out.values():
		d.names = ", ".join(sorted(d.names))
	return out


def get_last_delivered_so(row):
	"""Latest submitted SO before this one, same customer + item, with deliveries."""
	res = frappe.db.sql(
		"""
		select so.name, so.transaction_date, so.currency, soi.rate, soi.base_rate
		from `tabSales Order Item` soi
		inner join `tabSales Order` so on so.name = soi.parent
		where so.docstatus = 1 and so.customer = %(customer)s and soi.item_code = %(item_code)s
			and soi.delivered_qty > 0 and so.name != %(so)s
			and (so.transaction_date < %(date)s
				or (so.transaction_date = %(date)s and so.creation < (select creation from `tabSales Order` where name = %(so)s)))
		order by so.transaction_date desc, so.creation desc
		limit 1
		""",
		{"customer": row.customer, "item_code": row.item_code, "so": row.sales_order, "date": row.transaction_date},
		as_dict=True,
	)
	return res[0] if res else None


def pct(part, whole):
	return flt(part) / flt(whole) * 100 if flt(whole) else 0


def pct_change(new, old):
	return (flt(new) - flt(old)) / flt(old) * 100 if flt(old) else 0
