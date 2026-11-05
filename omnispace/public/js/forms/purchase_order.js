// Omnispace · Last Purchase: latest PO and supplier quotation per item, with rate change
// Rendered into a section Omnispace adds to the form (no custom fields). Toggle in Omni Settings.
(function () {
frappe.ui.form.on("Purchase Order", {
  refresh(frm) { omni_po_last(frm); },
  currency(frm) { omni_po_last_later(frm); }
});
frappe.ui.form.on("Purchase Order Item", {
  item_code(frm) { omni_po_last_later(frm); },
  rate(frm) { omni_po_last_later(frm); },
  uom(frm) { omni_po_last_later(frm); },
  items_remove(frm) { omni_po_last_later(frm); }
});

let omni_po_last_timer = null;
function omni_po_last_later(frm) {
  clearTimeout(omni_po_last_timer);
  omni_po_last_timer = setTimeout(function () { omni_po_last(frm); }, 600);
}

function omni_po_last(frm) {
  const fld = omnispace.section(frm, "po_last_purchase", __("Last Purchase"));
  if (!fld) return;
  const wrap = fld.$wrapper, d = frm.doc, lines = (d.items || []).filter(function (r) { return r.item_code; });
  const codes = lines.map(function (r) { return r.item_code; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
  if (!codes.length) { wrap.html(""); return; }
  const esc = frappe.utils.escape_html;
  wrap.html('<div class="text-muted small" style="margin-top:8px">' + __("Loading...") + "</div>");
  const filters = [["item_code", "in", codes], ["docstatus", "=", 1]];
  if (!frm.is_new()) filters.push(["parent", "!=", d.name]);

  frappe.xcall("frappe.client.get_list", {doctype: "Purchase Order Item", parent: "Purchase Order", filters: filters,
      fields: ["parent", "item_code", "rate", "uom", "qty"], order_by: "creation desc", limit_page_length: 2000})
    .catch(function () { return []; })
    .then(function (rows) {
      const parents = (rows || []).map(function (x) { return x.parent; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      if (!parents.length) return [rows || [], []];
      return frappe.db.get_list("Purchase Order", {filters: {name: ["in", parents]}, fields: ["name", "supplier", "supplier_name", "transaction_date", "currency"], limit: parents.length})
        .catch(function () { return []; })
        .then(function (pos) { return [rows, pos || []]; });
    })
    .then(function (r) {
      return frappe.xcall("frappe.client.get_list", {doctype: "Supplier Quotation Item", parent: "Supplier Quotation", filters: [["item_code", "in", codes], ["docstatus", "=", 1]],
          fields: ["parent", "item_code", "rate", "uom"], order_by: "creation desc", limit_page_length: 2000})
        .catch(function () { return []; })
        .then(function (qi) {
          const qn = (qi || []).map(function (x) { return x.parent; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
          if (!qn.length) return r.concat([[], []]);
          return frappe.db.get_list("Supplier Quotation", {filters: {name: ["in", qn]}, fields: ["name", "supplier", "transaction_date", "currency"], limit: qn.length})
            .catch(function () { return []; })
            .then(function (qs) { return r.concat([qi, qs || []]); });
        });
    })
    .then(function (r) {
      const rows = r[0], P = {}, Q = {}, lastq = {};
      r[1].forEach(function (p) { P[p.name] = p; });
      r[3].forEach(function (q) { Q[q.name] = q; });
      // latest submitted supplier quotation per item
      r[2].forEach(function (x) {
        const q = Q[x.parent];
        if (!q) return;
        const b = lastq[x.item_code];
        if (!b || q.transaction_date > Q[b.parent].transaction_date) lastq[x.item_code] = x;
      });
      const qcell = function (code) {
        const q = lastq[code] ? Q[lastq[code].parent] : null;
        return q ? frappe.datetime.str_to_user(q.transaction_date) + '<div class="small text-muted">' + frappe.utils.get_form_link("Supplier Quotation", q.name, true) + " · " + esc(q.supplier || "") + "</div>" : "–";
      };
      // latest PO date per item; rows come newest first, so the first row wins a tie
      const last = {};
      rows.forEach(function (x) {
        const p = P[x.parent];
        if (!p) return;
        const b = last[x.item_code];
        if (!b || p.transaction_date > P[b.parent].transaction_date) last[x.item_code] = x;
      });
      const html = lines.map(function (row) {
        const x = last[row.item_code], p = x ? P[x.parent] : null;
        const item = esc(row.item_code) + (row.item_name && row.item_name !== row.item_code ? '<div class="small text-muted">' + esc(row.item_name) + "</div>" : "");
        const cur = format_currency(row.rate, d.currency) + " / " + esc(row.uom || "");
        const chg = function (rate, uom, currency) {
          if (currency !== d.currency || uom !== row.uom || !flt(rate) || !flt(row.rate)) return "–";
          const pct = (flt(row.rate) - flt(rate)) / flt(rate) * 100;
          const cls = Math.abs(pct) < 0.005 ? "text-muted" : (pct > 0 ? "text-danger" : "text-success");
          return '<span class="' + cls + '">' + (pct > 0 ? "+" : "") + format_number(pct, null, 1) + "%</span>";
        };
        if (!x) {
          // no purchase yet: Last Rate falls back to the latest supplier quotation
          const qx = lastq[row.item_code], q = qx ? Q[qx.parent] : null;
          const qrate = q ? format_currency(qx.rate, q.currency) + " / " + esc(qx.uom || "") + '<div class="small text-muted">' + __("From quotation") + "</div>" : "–";
          return "<tr><td>" + item + "</td><td>" + cur + '</td><td class="text-muted">' + __("No previous purchase") + "</td><td>" + qrate + "</td><td>–</td><td>" + qcell(row.item_code) +
            "</td><td>" + (q ? chg(qx.rate, qx.uom, q.currency) : "–") + "</td></tr>";
        }
        const change = chg(x.rate, x.uom, p.currency);
        const sup = frappe.utils.get_form_link("Supplier", p.supplier, true) + (p.supplier_name && p.supplier_name !== p.supplier ? '<div class="small text-muted">' + esc(p.supplier_name) + "</div>" : "");
        return "<tr><td>" + item + "</td><td>" + cur + "</td><td>" + sup + "</td><td>" + format_currency(x.rate, p.currency) + " / " + esc(x.uom || "") +
          "</td><td>" + frappe.datetime.str_to_user(p.transaction_date) + '<div class="small text-muted">' + frappe.utils.get_form_link("Purchase Order", p.name, true) +
          " · " + format_number(x.qty) + " " + esc(x.uom || "") + "</div></td><td>" + qcell(row.item_code) + "</td><td>" + change + "</td></tr>";
      }).join("");
      wrap.html('<table class="table table-bordered table-sm" style="margin-top:8px"><thead><tr><th>' + __("Line Item") + "</th><th>" + __("Current Rate") + "</th><th>" + __("Last Supplier") +
        "</th><th>" + __("Last Rate") + "</th><th>" + __("Last Purchase Date") + "</th><th>" + __("Last Quotation Date") + "</th><th>" + __("Rate Change") + "</th></tr></thead><tbody>" + html + "</tbody></table>");
    });
}
})();
