// Omnispace · Sales Order Tracking: each line through MR → PO → receipt → Work Order → delivery, with price change
// Rendered into a section Omnispace adds to the form (no custom fields). Toggle in Omni Settings.
(function () {
frappe.ui.form.on("Sales Order", {
	refresh(frm) {
		omni_render_so_tracking(frm);
	},
});

function omni_render_so_tracking(frm) {
	const sec = omnispace.section(frm, "so_tracking", __("Sales Order Tracking"));
	if (!sec) return;
	const wrapper = sec.$wrapper;
	if (frm.is_new() || frm.doc.docstatus !== 1) {
		wrapper.html(`<div class="text-muted">${__("Available after the Sales Order is submitted")}</div>`);
		return;
	}
	wrapper.html(`<div class="text-muted">${__("Loading")}...</div>`);

	frappe.call({
		method: "omnispace.tracking.get_so_tracking",
		args: { sales_order: frm.doc.name },
		callback(r) {
			const rows = r.message || [];
			wrapper.html(omni_so_tracking_html(frm, rows));
		},
	});
}

function omni_pct_badge(v) {
	v = flt(v);
	let color = "#e24c4c";
	if (v >= 100) color = "#2e9e5b";
	else if (v > 0) color = "#e69a1f";
	return `<span style="color:${color};font-weight:600">${format_number(v, null, 1)}%</span>`;
}

function omni_so_tracking_html(frm, rows) {
	if (!rows.length) return `<div class="text-muted">${__("No items")}</div>`;

	const done = (k) => rows.filter((d) => flt(d[k]) >= 100).length;
	const head = [
		[__("Ordered"), done("per_ordered")],
		[__("Fully Received"), done("per_received")],
		[__("Work Order"), done("per_wo")],
		[__("Produced"), done("per_produced")],
		[__("Fully Delivered"), done("per_delivered")],
	]
		.map(([lbl, n]) => {
			const color = n === rows.length ? "#2e9e5b" : n > 0 ? "#e69a1f" : "#8d99a6";
			return `<span class="indicator-pill" style="background:${color}22;color:${color};margin-right:6px">${lbl}: ${n}/${rows.length}</span>`;
		})
		.join("");

	const body = rows
		.map((d) => {
			const mr = d.material_requests
				? d.material_requests
						.split(", ")
						.map((n) => `<a href="/app/material-request/${encodeURIComponent(n)}">${n}</a>`)
						.join(", ")
				: `<span class="text-muted">${__("No Material Request")}</span>`;
			const wo = d.work_orders
				? d.work_orders
						.split(", ")
						.map((n) => `<a href="/app/work-order/${encodeURIComponent(n)}">${n}</a>`)
						.join(", ")
				: `<span class="text-muted">${__("No Work Order")}</span>`;
			let change = `<span class="text-muted">${__("No previous delivered SO")}</span>`;
			if (d.last_so) {
				const v = flt(d.per_rate_change);
				const color = v > 0 ? "#2e9e5b" : v < 0 ? "#e24c4c" : "inherit";
				change = `<span style="color:${color};font-weight:600">${v > 0 ? "+" : ""}${format_number(v, null, 1)}%</span><br><small class="text-muted"><a href="/app/sales-order/${encodeURIComponent(d.last_so)}">${d.last_so}</a> · ${frappe.datetime.str_to_user(d.last_so_date)}</small>`;
			}
			return `<tr>
				<td><b>${frappe.utils.escape_html(d.item_code || "")}</b><br><small class="text-muted">${frappe.utils.escape_html(d.item_name || "")}</small></td>
				<td class="text-right">${format_number(d.so_qty)} ${d.uom || ""}</td>
				<td>${mr}</td>
				<td class="text-right">${format_number(d.ordered_qty)} / ${format_number(d.mr_qty)}<br>${omni_pct_badge(d.per_ordered)}</td>
				<td class="text-right">${format_number(d.received_qty)} / ${format_number(d.mr_qty)}<br>${omni_pct_badge(d.per_received)}</td>
				<td>${wo}</td>
				<td class="text-right">${format_number(d.wo_qty)} / ${format_number(d.so_qty)}<br>${omni_pct_badge(d.per_wo)}</td>
				<td class="text-right">${format_number(d.produced_qty)} / ${format_number(d.so_qty)}<br>${omni_pct_badge(d.per_produced)}</td>
				<td class="text-right">${format_number(d.delivered_qty)} / ${format_number(d.so_qty)}<br>${omni_pct_badge(d.per_delivered)}</td>
				<td class="text-right">${change}</td>
			</tr>`;
		})
		.join("");

	return `
		<div style="margin-bottom:8px">${head}
			<a class="btn btn-xs btn-default" style="float:right" href="/app/query-report/Omni SO Tracking?sales_order=${encodeURIComponent(frm.doc.name)}&include_closed=1">${__("Open report")}</a>
		</div>
		<div class="table-responsive">
		<table class="table table-bordered table-sm" style="font-size:12px">
			<thead><tr>
				<th>${__("Item Code")}</th>
				<th class="text-right">${__("SO Qty")}</th>
				<th>${__("Material Request")}</th>
				<th class="text-right">${__("PO Qty")} / ${__("MR Qty")}</th>
				<th class="text-right">${__("Received Qty")} / ${__("MR Qty")}</th>
				<th>${__("Work Orders")}</th>
				<th class="text-right">${__("WO Qty")} / ${__("SO Qty")}</th>
				<th class="text-right">${__("Produced Qty")} / ${__("SO Qty")}</th>
				<th class="text-right">${__("Delivered Qty")} / ${__("SO Qty")}</th>
				<th class="text-right">${__("% Rate Change")}</th>
			</tr></thead>
			<tbody>${body}</tbody>
		</table></div>`;
}
})();
