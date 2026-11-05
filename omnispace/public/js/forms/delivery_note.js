// Omnispace · Delivery Tracking: delivered so far vs. Sales Order qty for each line
// Rendered into a section Omnispace adds to the form (no custom fields). Toggle in Omni Settings.
(function () {
frappe.ui.form.on("Delivery Note", {
	refresh(frm) {
		omni_render_dn_tracking(frm);
	},
});

function omni_render_dn_tracking(frm) {
	const sec = omnispace.section(frm, "dn_tracking", __("Delivery Tracking"));
	if (!sec) return;
	const wrapper = sec.$wrapper;
	if (frm.is_new()) {
		wrapper.html(`<div class="text-muted">${__("Available after saving")}</div>`);
		return;
	}
	wrapper.html(`<div class="text-muted">${__("Loading")}...</div>`);
	frappe.call({
		method: "omnispace.tracking.get_dn_tracking",
		args: { delivery_note: frm.doc.name },
		callback(r) {
			wrapper.html(omni_dn_tracking_html(r.message || []));
		},
	});
}

function omni_dn_tracking_html(rows) {
	if (!rows.length) return `<div class="text-muted">${__("No items")}</div>`;
	const pct = (v) => {
		v = flt(v);
		const color = v >= 100 ? "#2e9e5b" : v > 0 ? "#e69a1f" : "#e24c4c";
		return `<span style="color:${color};font-weight:600">${format_number(v, null, 1)}%</span>`;
	};
	const full = rows.filter((d) => d.so_qty && flt(d.per_delivered) >= 100).length;
	const linked = rows.filter((d) => d.so_qty).length;
	const hcolor = full === linked && linked ? "#2e9e5b" : full > 0 ? "#e69a1f" : "#8d99a6";
	const head = `<span class="indicator-pill" style="background:${hcolor}22;color:${hcolor}">${__("Fully Delivered")}: ${full}/${linked}</span>`;

	const body = rows
		.map((d) => {
			if (!d.so_qty) {
				return `<tr><td><b>${frappe.utils.escape_html(d.item_code || "")}</b><br><small class="text-muted">${frappe.utils.escape_html(d.item_name || "")}</small></td>
					<td class="text-right">${format_number(d.dn_qty)} ${d.uom || ""}</td>
					<td colspan="5" class="text-muted">${__("Not linked to a Sales Order")}</td></tr>`;
			}
			const others = (d.other_dns || [])
				.map(
					(o) =>
						`<a href="/app/delivery-note/${encodeURIComponent(o.parent)}">${o.parent}</a> (${format_number(o.qty)}${o.docstatus === 0 ? ", " + __("Draft") : ""})`
				)
				.join("<br>");
			return `<tr>
				<td><b>${frappe.utils.escape_html(d.item_code || "")}</b><br><small class="text-muted">${frappe.utils.escape_html(d.item_name || "")}</small></td>
				<td class="text-right">${format_number(d.dn_qty)} ${d.uom || ""}</td>
				<td><a href="/app/sales-order/${encodeURIComponent(d.sales_order)}">${d.sales_order}</a><br><small class="text-muted">${__("SO Qty")}: ${format_number(d.so_qty)}</small></td>
				<td class="text-right">${format_number(d.delivered_qty)} / ${format_number(d.so_qty)}<br>${pct(d.per_delivered)}</td>
				<td class="text-right">${format_number(d.remaining)}</td>
				<td>${others || `<span class="text-muted">—</span>`}</td>
			</tr>`;
		})
		.join("");

	return `<div style="margin-bottom:8px">${head}</div>
		<div class="table-responsive"><table class="table table-bordered table-sm" style="font-size:12px">
		<thead><tr>
			<th>${__("Item Code")}</th>
			<th class="text-right">${__("This DN")}</th>
			<th>${__("Sales Order")}</th>
			<th class="text-right">${__("Delivered (all DN)")} / ${__("SO Qty")}</th>
			<th class="text-right">${__("Remaining")}</th>
			<th>${__("Other Delivery Notes")}</th>
		</tr></thead><tbody>${body}</tbody></table></div>`;
}
})();
