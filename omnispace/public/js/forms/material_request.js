// Omnispace · Material Request: purchase progress (quote → order → receipt → inspection → invoice)
// Rendered into a section Omnispace adds to the form (no custom fields). Toggle in Omni Settings.
(function () {
frappe.ui.form.on("Material Request", {
  refresh(frm) { omni_mr_progress(frm); },
  material_request_type(frm) { omni_mr_progress(frm); }
});

function omni_mr_progress(frm) {
  const fld = omnispace.section(frm, "mr_progress", __("Purchase Progress"));
  if (!fld) return;
  const wrap = fld.$wrapper, d = frm.doc, rows = d.items || [];
  if (frm.is_new() || !rows.length || ["Purchase", "Subcontracting"].indexOf(d.material_request_type) < 0) { wrap.html(""); return; }
  const esc = frappe.utils.escape_html;
  const uniq = function (a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); };
  const gl = function (dt, parent, args) {
    return frappe.xcall("frappe.client.get_list", Object.assign({doctype: dt, parent: parent, limit_page_length: 1000}, args)).catch(function () { return []; });
  };
  const docs = function (dt, names, fields) {
    if (!names.length) return Promise.resolve([]);
    return frappe.db.get_list(dt, {filters: {name: ["in", names]}, fields: fields, limit: 1000}).catch(function () { return []; });
  };
  const link = function (dt, name, state, extra) {
    return frappe.utils.get_form_link(dt, name, true) + (state ? ' <span class="text-muted">(' + esc(__(state)) + ")</span>" : "") + (extra ? ' <span class="text-muted">' + extra + "</span>" : "");
  };
  const state_of = function (x) { return x ? (x.docstatus === 2 ? "Cancelled" : (x.workflow_state || x.status || (x.docstatus === 1 ? "Submitted" : "Draft"))) : ""; };
  const mri = rows.map(function (r) { return r.name; });
  wrap.html('<div class="text-muted small" style="margin-top:8px">' + __("Loading...") + "</div>");

  (async function () {
    const sqi = await gl("Supplier Quotation Item", "Supplier Quotation", {filters: [["material_request_item", "in", mri]], fields: ["parent", "material_request_item", "qty"]});
    const poi = await gl("Purchase Order Item", "Purchase Order", {filters: [["material_request_item", "in", mri]], fields: ["name", "parent", "material_request_item", "qty", "received_qty"]});
    const po_names = uniq(poi.map(function (x) { return x.parent; })), poi_names = poi.map(function (x) { return x.name; });
    const scoi = poi_names.length ? await gl("Subcontracting Order Item", "Subcontracting Order", {filters: [["purchase_order_item", "in", poi_names]], fields: ["name", "parent", "purchase_order_item", "qty", "received_qty"]}) : [];
    const scoi_names = scoi.map(function (x) { return x.name; });
    const pr_or = [["material_request_item", "in", mri]].concat(poi_names.length ? [["purchase_order_item", "in", poi_names]] : []);
    const pri = await gl("Purchase Receipt Item", "Purchase Receipt", {or_filters: pr_or, fields: ["name", "parent", "material_request_item", "purchase_order_item", "qty", "rejected_qty", "quality_inspection"]});
    const scri = scoi_names.length ? await gl("Subcontracting Receipt Item", "Subcontracting Receipt", {filters: [["subcontracting_order_item", "in", scoi_names]], fields: ["name", "parent", "subcontracting_order_item", "qty", "rejected_qty", "quality_inspection"]}) : [];
    const pi_or = (poi_names.length ? [["po_detail", "in", poi_names]] : []).concat(pri.length ? [["pr_detail", "in", pri.map(function (x) { return x.name; })]] : []);
    const pii = pi_or.length ? await gl("Purchase Invoice Item", "Purchase Invoice", {or_filters: pi_or, fields: ["parent", "po_detail", "pr_detail", "qty"]}) : [];
    const qi_names = uniq(pri.concat(scri).map(function (x) { return x.quality_inspection; }));
    const res = await Promise.all([
      docs("Supplier Quotation", uniq(sqi.map(function (x) { return x.parent; })), ["name", "docstatus", "status", "supplier"]),
      docs("Purchase Order", po_names, ["name", "docstatus", "status", "workflow_state", "supplier"]),
      docs("Subcontracting Order", uniq(scoi.map(function (x) { return x.parent; })), ["name", "docstatus", "status"]),
      docs("Purchase Receipt", uniq(pri.map(function (x) { return x.parent; })), ["name", "docstatus", "status", "workflow_state"]),
      docs("Subcontracting Receipt", uniq(scri.map(function (x) { return x.parent; })), ["name", "docstatus", "status"]),
      docs("Quality Inspection", qi_names, ["name", "docstatus", "status"]),
      docs("Purchase Invoice", uniq(pii.map(function (x) { return x.parent; })), ["name", "docstatus", "status", "workflow_state"])
    ]);
    const by = function (list) { const m = {}; list.forEach(function (x) { m[x.name] = x; }); return m; };
    const SQ = by(res[0]), PO = by(res[1]), SCO = by(res[2]), PR = by(res[3]), SCR = by(res[4]), QI = by(res[5]), PI = by(res[6]);
    const live = function (m, n) { return m[n] && m[n].docstatus < 2; };
    let n_q = 0, n_o = 0, n_r = 0, n_i = 0, n_b = 0;

    const html = rows.map(function (row) {
      const uom = esc(row.uom || row.stock_uom || "");
      // supplier quotations
      const q = sqi.filter(function (x) { return x.material_request_item === row.name; });
      const q_names = uniq(q.map(function (x) { return x.parent; }));
      if (q_names.some(function (n) { return live(SQ, n); })) n_q++;
      const q_cell = q_names.length ? q_names.map(function (n) { return link("Supplier Quotation", n, state_of(SQ[n]), SQ[n] ? esc(SQ[n].supplier || "") : ""); }).join("<br>") : "–";
      // purchase / subcontracting orders
      const o = poi.filter(function (x) { return x.material_request_item === row.name; });
      const o_live = o.filter(function (x) { return live(PO, x.parent); });
      const ordered = o_live.reduce(function (s, x) { return s + flt(x.qty); }, 0);
      if (ordered > 0) n_o++;
      const sco_rows = scoi.filter(function (x) { return o.some(function (p) { return p.name === x.purchase_order_item; }); });
      let o_cell = uniq(o.map(function (x) { return x.parent; })).map(function (n) { return link("Purchase Order", n, state_of(PO[n]), PO[n] ? esc(PO[n].supplier || "") : ""); })
        .concat(uniq(sco_rows.map(function (x) { return x.parent; })).map(function (n) { return link("Subcontracting Order", n, state_of(SCO[n])); })).join("<br>");
      o_cell = o_cell ? o_cell + '<div class="small">' + __("Ordered Qty") + ": " + format_number(ordered) + " / " + format_number(row.qty) + " " + uom + "</div>"
        : '<span class="text-muted">' + __("Not ordered yet") + "</span>";
      // receipts = acceptance (Purchase Receipt / Subcontracting Receipt)
      const r_pr = pri.filter(function (x) { return x.material_request_item === row.name || o.some(function (p) { return p.name === x.purchase_order_item; }); });
      const r_sc = scri.filter(function (x) { return sco_rows.some(function (s) { return s.name === x.subcontracting_order_item; }); });
      const sub = row.qty ? 1 : 0;
      const sum = function (list, m, f) { return list.filter(function (x) { return m[x.parent] && m[x.parent].docstatus === 1; }).reduce(function (s, x) { return s + flt(x[f]); }, 0); };
      const received = sum(r_pr, PR, "qty") + sum(r_sc, SCR, "qty"), rejected = sum(r_pr, PR, "rejected_qty") + sum(r_sc, SCR, "rejected_qty");
      if (sub && received >= flt(row.qty)) n_r++;
      let r_cell = uniq(r_pr.map(function (x) { return x.parent; })).map(function (n) { return link("Purchase Receipt", n, state_of(PR[n])); })
        .concat(uniq(r_sc.map(function (x) { return x.parent; })).map(function (n) { return link("Subcontracting Receipt", n, state_of(SCR[n])); })).join("<br>");
      r_cell = r_cell ? r_cell + '<div class="small">' + __("Received Qty") + ": " + format_number(received) + " / " + format_number(row.qty) + " " + uom +
          (rejected ? ' · <span class="text-danger">' + __("Rejected Qty") + ": " + format_number(rejected) + "</span>" : "") + "</div>"
        : '<span class="text-muted">' + __("Not received yet") + "</span>";
      // incoming inspection
      const qis = uniq(r_pr.concat(r_sc).map(function (x) { return x.quality_inspection; }));
      if (qis.some(function (n) { return QI[n] && QI[n].docstatus === 1; })) n_i++;
      const i_cell = qis.length ? qis.map(function (n) { return link("Quality Inspection", n, QI[n] ? (QI[n].docstatus === 1 ? QI[n].status : state_of(QI[n])) : ""); }).join("<br>")
        : (r_pr.length || r_sc.length ? '<span class="text-muted">' + __("Not inspected") + "</span>" : "–");
      // invoices
      const b = pii.filter(function (x) { return o.some(function (p) { return p.name === x.po_detail; }) || r_pr.some(function (p) { return p.name === x.pr_detail; }); });
      const b_names = uniq(b.map(function (x) { return x.parent; }));
      if (b_names.some(function (n) { return live(PI, n); })) n_b++;
      const b_cell = b_names.length ? b_names.map(function (n) { return link("Purchase Invoice", n, state_of(PI[n])); }).join("<br>") : "–";

      return "<tr><td>" + esc(row.item_code || "") + (row.item_name && row.item_name !== row.item_code ? '<div class="small text-muted">' + esc(row.item_name) + "</div>" : "") +
        "</td><td>" + format_number(row.qty) + " " + uom + "</td><td>" + q_cell + "</td><td>" + o_cell + "</td><td>" + r_cell + "</td><td>" + i_cell + "</td><td>" + b_cell + "</td></tr>";
    }).join("");

    const total = rows.length;
    const step = function (label, n) { return '<span class="indicator-pill ' + (n >= total ? "green" : (n ? "orange" : "gray")) + '" style="margin-right:6px">' + esc(label) + ": " + n + "/" + total + "</span>"; };
    const head = '<div style="margin:8px 0">' + step(__("Quoted"), n_q) + step(__("Ordered"), n_o) + step(__("Fully Received"), n_r) + step(__("Inspection Done"), n_i) + step(__("Invoiced"), n_b) + "</div>";
    wrap.html(head + '<table class="table table-bordered table-sm"><thead><tr><th>' + __("Line Item") + "</th><th>" + __("Requested Qty") + "</th><th>" + __("Supplier Quotation") +
      "</th><th>" + __("Purchase Order") + "</th><th>" + __("Acceptance (Receipt)") + "</th><th>" + __("Quality Inspection") + "</th><th>" + __("Purchase Invoice") +
      "</th></tr></thead><tbody>" + html + "</tbody></table>");
  })();
}
})();

// Omnispace · Material Request: stock on hand, open POs and earlier requests per line
// Rendered into a section Omnispace adds to the form (no custom fields). Toggle in Omni Settings.
(function () {
frappe.ui.form.on("Material Request", {
  refresh(frm) { omni_mr_stock_hist(frm); },
  material_request_type(frm) { omni_mr_stock_hist_later(frm); }
});
frappe.ui.form.on("Material Request Item", {
  item_code(frm) { omni_mr_stock_hist_later(frm); },
  qty(frm) { omni_mr_stock_hist_later(frm); },
  warehouse(frm) { omni_mr_stock_hist_later(frm); },
  items_remove(frm) { omni_mr_stock_hist_later(frm); }
});

let omni_mr_sh_timer = null;
function omni_mr_stock_hist_later(frm) {
  clearTimeout(omni_mr_sh_timer);
  omni_mr_sh_timer = setTimeout(function () { omni_mr_stock_hist(frm); }, 600);
}

function omni_mr_stock_hist(frm) {
  const fld = omnispace.section(frm, "mr_stock_history", __("Stock and Request History"));
  if (!fld) return;
  const wrap = fld.$wrapper, d = frm.doc;
  const lines = (d.items || []).filter(function (r) { return r.item_code; });
  if (!lines.length || ["Purchase", "Subcontracting"].indexOf(d.material_request_type) < 0) { wrap.html(""); return; }
  const esc = frappe.utils.escape_html;
  const uniq = function (a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); };
  const codes = uniq(lines.map(function (r) { return r.item_code; }));
  wrap.html('<div class="text-muted small" style="margin-top:8px">' + __("Loading...") + "</div>");
  const filters = [["item_code", "in", codes], ["docstatus", "=", 1]];
  if (!frm.is_new()) filters.push(["parent", "!=", d.name]);

  Promise.all([
    frappe.db.get_list("Bin", {filters: {item_code: ["in", codes]}, fields: ["item_code", "warehouse", "actual_qty", "ordered_qty", "projected_qty"], limit: 1000}).catch(function () { return []; }),
    frappe.xcall("frappe.client.get_list", {doctype: "Material Request Item", parent: "Material Request", filters: filters,
      fields: ["parent", "item_code", "stock_qty", "ordered_qty", "received_qty", "stock_uom"], order_by: "creation desc", limit_page_length: 1000}).catch(function () { return []; }),
    frappe.xcall("frappe.client.get_list", {doctype: "Purchase Order Item", parent: "Purchase Order", filters: [["item_code", "in", codes], ["docstatus", "=", 1]],
      fields: ["parent", "item_code", "stock_qty", "received_qty", "stock_uom"], order_by: "creation desc", limit_page_length: 1000}).catch(function () { return []; })
  ]).then(function (r) {
    const bins = r[0] || [], mri = r[1] || [];
    const parents = uniq(mri.map(function (x) { return x.parent; }));
    const head = parents.length ? frappe.db.get_list("Material Request", {filters: {name: ["in", parents], material_request_type: ["in", ["Purchase", "Subcontracting"]]},
      fields: ["name", "transaction_date", "status"], limit: parents.length}).catch(function () { return []; }) : Promise.resolve([]);
    const poi = r[2] || [], pon = uniq(poi.map(function (x) { return x.parent; }));
    // On Order = submitted POs of the item that have no Purchase Invoice yet
    const pos = pon.length ? frappe.db.get_list("Purchase Order", {filters: {name: ["in", pon], per_billed: 0, status: ["not in", ["Closed", "Cancelled"]]},
      fields: ["name", "supplier", "transaction_date", "status"], limit: pon.length}).catch(function () { return []; }) : Promise.resolve([]);
    return Promise.all([head, pos]).then(function (h) { return [bins, mri, h[0], poi, h[1]]; });
  }).then(function (r) {
    const bins = r[0], mri = r[1], M = {}, poi = r[3], P = {};
    r[2].forEach(function (x) { M[x.name] = x; });
    r[4].forEach(function (x) { P[x.name] = x; });
    const fmt = function (v) { return format_number(flt(v), null, 2).replace(/[.,]00$/, ""); };
    const pill = function (pct) {
      const cls = pct >= 99.995 ? "green" : (pct > 0 ? "orange" : "red");
      return '<span class="indicator-pill ' + cls + '">' + __("Delivered") + " " + format_number(pct, null, 0) + "%</span>";
    };
    const html = lines.map(function (row) {
      const b = bins.filter(function (x) { return x.item_code === row.item_code; });
      const here = b.filter(function (x) { return x.warehouse === row.warehouse; }).reduce(function (s, x) { return s + flt(x.actual_qty); }, 0);
      const op = {};
      poi.forEach(function (x) {
        if (x.item_code !== row.item_code || !P[x.parent]) return;
        const o = op[x.parent] || (op[x.parent] = {name: x.parent, qty: 0, rec: 0, uom: x.stock_uom});
        o.qty += flt(x.stock_qty); o.rec += flt(x.received_qty);
      });
      const orders = Object.keys(op).map(function (k) { return op[k]; })
        .sort(function (a, c) { return (P[c.name].transaction_date || "").localeCompare(P[a.name].transaction_date || ""); });
      const on_order = orders.length ? orders.map(function (o) {
        return '<div style="margin-bottom:4px">' + frappe.utils.get_form_link("Purchase Order", o.name, true) + '<div class="small text-muted">' + esc(P[o.name].supplier || "") + " · " +
          fmt(o.qty) + " " + esc(o.uom || "") + (o.rec ? " · " + __("Received Qty") + " " + fmt(o.rec) : "") + "</div></div>";
      }).join("") : "–";
      const suom = esc(row.stock_uom || row.uom || "");
      // earlier purchase requests for this item (latest 3), summed per request
      const per = {};
      mri.forEach(function (x) {
        if (x.item_code !== row.item_code || !M[x.parent]) return;
        const p = per[x.parent] || (per[x.parent] = {name: x.parent, req: 0, ord: 0, rec: 0, uom: x.stock_uom});
        p.req += flt(x.stock_qty); p.ord += flt(x.ordered_qty); p.rec += flt(x.received_qty);
      });
      const prev = Object.keys(per).map(function (k) { return per[k]; })
        .sort(function (a, b) { return (M[b.name].transaction_date || "").localeCompare(M[a.name].transaction_date || "") || b.name.localeCompare(a.name); })
        .slice(0, 3);
      const hist = prev.length ? prev.map(function (p) {
        const h = M[p.name], pct = p.req ? Math.min(p.rec / p.req * 100, 100) : 0;
        const closed = ["Stopped", "Cancelled"].indexOf(h.status) >= 0 ? ' <span class="text-muted">(' + esc(__(h.status)) + ")</span>" : "";
        return '<div style="margin-bottom:4px">' + frappe.utils.get_form_link("Material Request", p.name, true) + ' <span class="text-muted">' + frappe.datetime.str_to_user(h.transaction_date) + "</span>" + closed +
          '<div class="small">' + fmt(p.rec) + " / " + fmt(p.req) + " " + esc(p.uom || "") + " " + pill(pct) + "</div></div>";
      }).join("") : '<span class="text-muted">' + __("No previous request") + "</span>";

      return "<tr><td>" + esc(row.item_code) + (row.item_name && row.item_name !== row.item_code ? '<div class="small text-muted">' + esc(row.item_name) + "</div>" : "") +
        "</td><td>" + fmt(row.qty) + " " + esc(row.uom || "") + '</td><td class="text-danger" style="font-weight:600">' + fmt(here) + " " + suom + '<div class="small">' + esc(row.warehouse || "") + "</div></td><td>" + on_order + "</td><td>" + hist + "</td></tr>";
    }).join("");
    wrap.html('<table class="table table-bordered table-sm" style="margin-top:8px"><thead><tr><th>' + __("Line Item") + "</th><th>" + __("Requested Qty") + "</th><th>" + __("Stock in Warehouse") +
      "</th><th>" + __("On Order") + " (" + __("PO not invoiced") + ")</th><th>" + __("Previous Requests") + "</th></tr></thead><tbody>" + html + "</tbody></table>");
  });
}
})();
