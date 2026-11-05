// Omnispace · Purchase Order Tracking: ordered / received before / this receipt / remaining for each line
// Rendered into a section Omnispace adds to the form (no custom fields). Toggle in Omni Settings.
(function () {
frappe.ui.form.on("Purchase Receipt", {
	refresh(frm) { omni_render_po_tracking(frm); },
	items_add(frm) { omni_render_po_tracking(frm); },
	items_remove(frm) { omni_render_po_tracking(frm); },
});
frappe.ui.form.on("Purchase Receipt Item", {
	item_code(frm) { omni_render_po_tracking(frm); },
	purchase_order(frm) { omni_render_po_tracking(frm); },
	qty(frm) { omni_render_po_tracking(frm); },
});
async function omni_render_po_tracking(frm) {
	const field = omnispace.section(frm, "pr_po_tracking", __("Purchase Order Tracking"));
	if (!field) return;
	const $w = field.$wrapper;
	const items = (frm.doc.items || []).filter((i) => i.item_code);
	if (!items.length) { $w.html('<p class="text-muted">' + __("No items") + '</p>'); return; }

	// PO item lines: the linked ones + the latest PO of each unlinked item
	const linked = [...new Set(items.map((i) => i.purchase_order_item).filter(Boolean))];
	const unlinkedCodes = [...new Set(items.filter((i) => !i.purchase_order_item).map((i) => i.item_code))];
	const fields = ["name", "parent", "item_code", "item_name", "qty", "received_qty", "uom", "schedule_date", "creation"];
	const get = (filters) => frappe.call({ method: "frappe.client.get_list", args: {
		doctype: "Purchase Order Item", parent: "Purchase Order", filters, fields,
		order_by: "creation desc", limit_page_length: 500 } }).then((r) => r.message || []);
	const rows = [];
	if (linked.length) rows.push(...(await get({ name: ["in", linked], docstatus: 1 })));
	if (unlinkedCodes.length) rows.push(...(await get({ item_code: ["in", unlinkedCodes], docstatus: 1 })));
	const byName = {}; rows.forEach((r) => (byName[r.name] = r));
	const latestByItem = {}; rows.forEach((r) => { if (!latestByItem[r.item_code]) latestByItem[r.item_code] = r; }); // rows are sorted creation desc

	// qty being received on this document, per PO line
	const pending = {};
	items.forEach((i) => {
		const key = i.purchase_order_item || (latestByItem[i.item_code] || {}).name;
		if (key) pending[key] = (pending[key] || 0) + flt(i.qty);
	});

	const esc = frappe.utils.escape_html;
	const pc = (v, q) => (q ? Math.min(100, (v / q) * 100) : 0);
	const cell = (v, q, cls) => '<td class="text-right ' + (cls || "") + '">' + format_number(v) + '<br><small>' + pc(v, q).toFixed(0) + '%</small></td>';
	let html = '<table class="table table-bordered table-sm" style="margin-bottom:0"><thead><tr>'
		+ '<th>#</th><th>' + __("Item") + '</th><th>' + __("Purchase Order") + '</th>'
		+ '<th class="text-right">' + __("Ordered") + '</th>'
		+ '<th class="text-right">' + __("Received") + '<br><small class="text-muted">' + __("previous receipts") + '</small></th>'
		+ '<th class="text-right" style="min-width:150px">' + __("This Receipt") + '<br><small class="text-muted">' + __("qty on this document") + '</small></th>'
		+ '<th class="text-right">' + __("Remaining") + '<br><small class="text-muted">' + __("after this receipt") + '</small></th><th>' + __("Status") + '</th></tr></thead><tbody>';
	items.forEach((i) => {
		const r = (i.purchase_order_item && byName[i.purchase_order_item]) || latestByItem[i.item_code];
		if (!r) {
			html += '<tr><td>' + i.idx + '</td><td>' + esc(i.item_code) + '</td><td colspan="6" class="text-muted">' + __("No Purchase Order for this item") + '</td></tr>';
			return;
		}
		const q = flt(r.qty), cur = pending[r.name] || 0;
		// once submitted, PO received_qty already includes this receipt, so take it out
		const prev = Math.max(0, flt(r.received_qty) - (frm.doc.docstatus === 1 ? cur : 0));
		const total = prev + cur, remain = Math.max(0, q - total);
		const pct = pc(total, q), done = pct >= 100, pctCur = pc(cur, q);
		const color = done ? "var(--green)" : pct > 0 ? "var(--orange)" : "var(--red)";
		const status = done ? '<span class="indicator-pill green">' + __("Completed") + '</span>'
			: pct > 0 ? '<span class="indicator-pill orange">' + __("Partially Received") + '</span>'
			: '<span class="indicator-pill red">' + __("Pending") + '</span>';
		html += '<tr><td>' + i.idx + '</td>'
			+ '<td>' + esc(i.item_code) + '<br><small class="text-muted">' + esc(r.item_name || "") + '</small></td>'
			+ '<td><a href="/app/purchase-order/' + encodeURIComponent(r.parent) + '">' + esc(r.parent) + '</a>'
			+ (r.schedule_date ? '<br><small class="text-muted">' + frappe.datetime.str_to_user(r.schedule_date) + '</small>' : '')
			+ (!i.purchase_order_item ? '<br><small class="text-warning">' + __("not linked") + '</small>' : '') + '</td>'
			+ '<td class="text-right">' + format_number(q) + ' ' + esc(r.uom || "") + '</td>'
			+ cell(prev, q)
			+ '<td class="text-right"><b>' + format_number(cur) + '</b>'
			+ '<div class="progress" style="margin:2px 0 0;height:16px"><div class="progress-bar" style="width:' + pctCur + '%;background:' + color + ';color:#fff;font-size:11px;line-height:16px">' + pctCur.toFixed(0) + '%</div></div></td>'
			+ cell(remain, q, remain > 0 ? "text-danger" : "text-success")
			+ '<td>' + status + '</td></tr>';
	});
	$w.html(html + "</tbody></table>");
}
})();
