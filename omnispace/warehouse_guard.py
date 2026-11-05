"""Warehouse Guard: each stock item must use its default warehouse, resolved the way ERPNext does.

Home warehouse  = default_warehouse from Item Defaults of the Item, else its Item Group, else its Brand
                  (for the document's company) — the same order ERPNext uses to fill the warehouse.
Production set  = Manufacturing Settings WIP / FG / Scrap defaults, the company's In Transit warehouse,
                  warehouses of a linked Work Order / Subcontracting Order, Omni Settings extras,
                  each with its child warehouses.

Strict documents accept only the home warehouse; flexible ones accept home or production warehouses.
"""

import json

import frappe
from frappe import _

from omnispace.settings import get_settings

# doctype: (child table, warehouse fields, mode)
GUARDED = {
	"Sales Order": ("items", ["warehouse"], "strict"),
	"Delivery Note": ("items", ["warehouse"], "strict"),
	"Sales Invoice": ("items", ["warehouse"], "strict"),
	"Purchase Order": ("items", ["warehouse"], "strict"),
	"Purchase Receipt": ("items", ["warehouse"], "strict"),
	"Purchase Invoice": ("items", ["warehouse"], "strict"),
	"Material Request": ("items", ["warehouse", "from_warehouse"], "mr"),
	"Stock Entry": ("items", ["s_warehouse", "t_warehouse"], "flex"),
}
STRICT_MR_TYPES = ("Purchase", "Customer Provided", "Subcontracting")


def is_on(settings=None):
	s = settings or get_settings()
	return bool(s.enabled and s.get("enable_warehouse_guard"))


def applies(doc):
	if doc.get("doctype") not in GUARDED:
		return False
	if doc.get("doctype") in ("Sales Invoice", "Purchase Invoice") and not doc.get("update_stock"):
		return False
	return bool(doc.get("company"))


def is_strict(doc):
	mode = GUARDED[doc.get("doctype")][2]
	if mode == "strict":
		return True
	if mode == "mr":
		return doc.get("material_request_type") in STRICT_MR_TYPES
	return False


def home_warehouse(item_code, company, cache):
	"""Default warehouse for the item in this company, or None when the item is not checked."""
	key = (item_code, company)
	if key in cache:
		return cache[key]
	res = None
	if item_code and frappe.get_cached_value("Item", item_code, "is_stock_item"):
		from erpnext.setup.doctype.brand.brand import get_brand_defaults
		from erpnext.setup.doctype.item_group.item_group import get_item_group_defaults
		from erpnext.stock.doctype.item.item import get_item_defaults

		item = get_item_defaults(item_code, company) or {}
		group = get_item_group_defaults(item_code, company) or {}
		brand = get_brand_defaults(item_code, company) or {}
		wh = item.get("default_warehouse") or group.get("default_warehouse") or brand.get("default_warehouse")
		if wh:
			source = (
				_("Item")
				if item.get("default_warehouse")
				else (_("Item Group") + " " + (item.get("item_group") or "") if group.get("default_warehouse") else _("Brand"))
			)
			res = frappe._dict(warehouse=wh, source=source.strip())
	cache[key] = res
	return res


def _with_children(roots):
	roots = [r for r in dict.fromkeys(roots) if r]
	if not roots:
		return []
	out = []
	for r in frappe.get_all("Warehouse", filters={"name": ["in", roots]}, fields=["lft", "rgt"]):
		out += frappe.get_all("Warehouse", filters={"lft": [">=", r.lft], "rgt": ["<=", r.rgt]}, pluck="name")
	return list(dict.fromkeys(out))


def production_warehouses(doc, settings=None):
	s = settings or get_settings()
	roots = list(s.get("warehouse_guard_extra") or [])
	ms = frappe.get_cached_doc("Manufacturing Settings")
	roots += [ms.get("default_wip_warehouse"), ms.get("default_fg_warehouse"), ms.get("default_scrap_warehouse")]
	roots.append(frappe.get_cached_value("Company", doc.get("company"), "default_in_transit_warehouse"))
	if doc.get("work_order"):
		wo = frappe.db.get_value(
			"Work Order", doc.get("work_order"),
			["wip_warehouse", "fg_warehouse", "source_warehouse", "scrap_warehouse"], as_dict=True,
		) or {}
		roots += list(wo.values())
		roots += frappe.get_all(
			"Work Order Item", filters={"parent": doc.get("work_order")}, pluck="source_warehouse", distinct=True
		)
	if doc.get("subcontracting_order"):
		roots.append(frappe.db.get_value("Subcontracting Order", doc.get("subcontracting_order"), "supplier_warehouse"))
	roots.append(doc.get("supplier_warehouse"))
	return _with_children(roots)


def find_errors(doc, settings=None):
	table, fields, _mode = GUARDED[doc.get("doctype")]
	strict = is_strict(doc)
	prod = [] if strict else production_warehouses(doc, settings)
	cache, errs = {}, []
	for row in doc.get(table) or []:
		row = frappe._dict(row)
		home = home_warehouse(row.item_code, doc.get("company"), cache)
		if not home:
			continue
		allowed = [home.warehouse] if strict else [home.warehouse, *prod]
		for f in fields:
			v = row.get(f)
			if v and v not in allowed:
				errs.append(
					_("Row {0}: {1} must use warehouse {2} (default from {3}){4}, not {5}.").format(
						row.idx, row.item_code, home.warehouse, home.source,
						"" if strict else _(" or a production warehouse"), v,
					)
				)
	return errs


def _skip():
	f = frappe.flags
	return f.in_install or f.in_migrate or f.in_patch or f.in_fixtures


def validate(doc, method=None):
	if _skip() or not applies(doc):
		return
	s = get_settings()
	if not is_on(s):
		return
	errs = find_errors(doc, s)
	if not errs:
		return
	if s.get("warehouse_guard_action") == "Warning":
		frappe.msgprint("<br>".join(errs), title=_("Check Warehouses"), indicator="orange")
	else:
		frappe.throw("<br>".join(errs), title=_("Wrong Warehouse"))


@frappe.whitelist()
def get_context(doc):
	"""What the form needs to filter warehouse pickers: home warehouse per item + production set."""
	doc = frappe._dict(json.loads(doc) if isinstance(doc, str) else doc)
	if not is_on() or not applies(doc):
		return {"active": 0}
	frappe.has_permission(doc.doctype, "read", throw=True)
	strict = is_strict(doc)
	cache, homes = {}, {}
	for row in doc.get(GUARDED[doc.doctype][0]) or []:
		code = row.get("item_code")
		if code and code not in homes:
			h = home_warehouse(code, doc.company, cache)
			homes[code] = h.warehouse if h else None
	return {
		"active": 1,
		"strict": int(strict),
		"production": [] if strict else production_warehouses(doc),
		"homes": homes,
	}
