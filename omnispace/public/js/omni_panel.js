// Omnispace panel: history, links and context for any form, plus client-side mirror of Omni Rules.
(function () {
	const cfg = () => frappe.boot.omnispace || {};
	const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
	const when = (dt) => (dt ? frappe.datetime.comment_when(dt) : "");
	const link = (dt, name) =>
		`<a href="/app/${frappe.router.slug(dt)}/${encodeURIComponent(name)}">${esc(name)}</a>`;
	const who = (u) => (u ? esc(u.name || u.user) : "");

	function enabledFor(doctype) {
		const c = cfg();
		if (!c.enabled || !c.can_view_panel || doctype.startsWith("Omni ")) return false;
		return !!c.all_doctypes || (c.panel_doctypes || []).includes(doctype);
	}

	// ---------- drawer ----------
	let $drawer = null;
	let current = null; // {doctype, name}
	let currentFrm = null;

	function ensureDrawer() {
		if ($drawer) return $drawer;
		$("head").append(`<style id="omnispace-style">
			.omni-drawer{position:fixed;top:0;right:0;height:100vh;width:min(440px,100vw);z-index:1030;
				background:var(--card-bg,var(--bg-color));border-left:1px solid var(--border-color);
				box-shadow:var(--shadow-lg,0 0 24px rgba(0,0,0,.15));display:flex;flex-direction:column;
				transform:translateX(100%);transition:transform .2s ease}
			.omni-drawer.open{transform:none}
			.omni-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border-color)}
			.omni-head .omni-title{flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.omni-tabs{display:flex;gap:4px;padding:8px 12px;border-bottom:1px solid var(--border-color);flex-wrap:wrap}
			.omni-tabs button{border:0;background:none;padding:4px 10px;border-radius:6px;font-size:12px;color:var(--text-muted)}
			.omni-tabs button.active{background:var(--control-bg);color:var(--text-color);font-weight:600}
			.omni-body{flex:1;overflow:auto;padding:12px 16px;font-size:13px}
			.omni-kv{display:grid;grid-template-columns:120px 1fr;gap:6px 12px;margin-bottom:12px}
			.omni-kv div:nth-child(odd){color:var(--text-muted)}
			.omni-item{padding:8px 0;border-bottom:1px solid var(--border-color)}
			.omni-item:last-child{border-bottom:0}
			.omni-meta{color:var(--text-muted);font-size:11px}
			.omni-chg{font-size:12px;margin-top:4px}
			.omni-chg del{color:var(--red-600,#e24c4c)}
			.omni-chg ins{color:var(--green-600,#2e9e5b);text-decoration:none}
			.omni-pill{display:inline-block;padding:1px 8px;border-radius:10px;background:var(--control-bg);font-size:11px;margin:2px 4px 2px 0}
			.omni-group{font-weight:600;margin:10px 0 4px}
			.omni-empty{color:var(--text-muted);padding:12px 0}
			.omni-body table{font-size:12px}
		</style>`);
		$drawer = $(`<div class="omni-drawer" role="dialog" aria-label="Omnispace">
			<div class="omni-head">
				<span class="omni-title">Omnispace</span>
				<button class="btn btn-xs btn-default omni-reload" title="${__("Reload")}">${frappe.utils.icon("refresh", "xs")}</button>
				<button class="btn btn-xs btn-default omni-close" title="${__("Close")}">${frappe.utils.icon("close", "xs")}</button>
			</div>
			<div class="omni-tabs"></div>
			<div class="omni-body"></div>
		</div>`).appendTo("body");
		$drawer.on("click", ".omni-close", close);
		$drawer.on("click", ".omni-jump", function () {
			const frm = currentFrm, f = $(this).attr("data-anchor");
			close();
			frm && frm.scroll_to_field(f);
		});
		$drawer.on("click", ".omni-reload", () => current && load(current.doctype, current.name));
		$(document).on("keydown", (e) => e.key === "Escape" && $drawer.hasClass("open") && close());
		frappe.router.on("change", close);
		return $drawer;
	}

	function close() {
		$drawer && $drawer.removeClass("open");
		current = null;
		currentFrm = null;
	}

	function open(frm) {
		ensureDrawer().addClass("open");
		current = { doctype: frm.doctype, name: frm.doc.name };
		currentFrm = frm;
		$drawer.find(".omni-title").text(`${__(frm.doctype)} · ${frm.doc.name}`);
		load(frm.doctype, frm.doc.name);
	}

	function load(doctype, name) {
		$drawer.find(".omni-tabs").empty();
		$drawer.find(".omni-body").html(`<div class="omni-empty">${__("Loading")}...</div>`);
		frappe
			.xcall("omnispace.panel.get_panel", { doctype, name })
			.then((data) => {
				if (!current || current.name !== name) return;
				render(doctype, data);
			})
			.catch(() => $drawer.find(".omni-body").html(`<div class="omni-empty">${__("Could not load")}</div>`));
	}

	function render(doctype, d) {
		const tabs = [
			[__("Overview"), () => overview(d.overview)],
			[`${__("History")} (${d.history.length})`, () => history(d.history, d.overview)],
			[`${__("Links")} (${d.links.length + d.backlinks.length})`, () => links(d.links, d.backlinks)],
			[`${__("Activity")} (${d.comments.length})`, () => comments(d.comments)],
			...(d.tabs || []).map((t) => [__(t.label || "Tab"), () => anchorJump(t) + providerTab(t)]),
		];
		const $tabs = $drawer.find(".omni-tabs").empty();
		const $body = $drawer.find(".omni-body");
		tabs.forEach(([label, fn], i) => {
			$(`<button>${esc(label)}</button>`)
				.appendTo($tabs)
				.on("click", function () {
					$tabs.find("button").removeClass("active");
					$(this).addClass("active");
					$body.html(fn());
				});
			if (i === 0) $tabs.find("button").first().addClass("active");
		});
		$body.html(tabs[0][1]());
	}

	// ---------- tab renderers ----------
	function overview(o) {
		const status = ["Draft", "Submitted", "Cancelled"][o.docstatus] || "";
		const kv = [
			[__("Status"), esc(o.workflow_state || o.status || __(status))],
			[__("Created By"), `${who(o.owner)}<div class="omni-meta">${when(o.creation)}</div>`],
			[__("Last Modified"), `${who(o.modified_by)}<div class="omni-meta">${when(o.modified)}</div>`],
			[__("Idle"), `${esc(o.idle_hours)} h`],
			[__("Assigned To"), o.assigned.length ? o.assigned.map(who).join(", ") : `<span class="text-muted">—</span>`],
			[__("Versions"), esc(o.versions)],
			[__("Comments"), esc(o.comments)],
			[__("Attachments"), esc(o.attachments)],
		];
		let html = `<div class="omni-kv">${kv.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join("")}</div>`;
		if (o.next_actions.length)
			html += `<div class="omni-group">${__("You can")}</div>${o.next_actions
				.map((a) => `<span class="omni-pill">${esc(__(a))}</span>`)
				.join("")}`;
		if (!o.track_changes)
			html += `<div class="omni-empty">${__("Track Changes is off for this DocType, so field history is not recorded.")}</div>`;
		return html;
	}

	function history(rows, o) {
		if (!rows.length) return `<div class="omni-empty">${o.track_changes ? __("No changes yet") : __("Track Changes is off for this DocType.")}</div>`;
		return rows
			.map((r) => {
				const chg = r.changes
					.map((c) => `<div class="omni-chg"><b>${esc(c.field)}</b>: <del>${esc(c.old) || "∅"}</del> → <ins>${esc(c.new) || "∅"}</ins></div>`)
					.join("");
				const rowsInfo = [
					r.rows_added ? `+${r.rows_added} ${__("rows")}` : "",
					r.rows_removed ? `−${r.rows_removed} ${__("rows")}` : "",
				].filter(Boolean).join(" · ");
				return `<div class="omni-item"><div class="omni-meta">${who(r.by)} · ${when(r.at)}${rowsInfo ? " · " + rowsInfo : ""}</div>${chg}</div>`;
			})
			.join("");
	}

	function links(fwd, back) {
		let html = `<div class="omni-group">${__("This document refers to")}</div>`;
		html += fwd.length
			? fwd.map((l) => `<div class="omni-item">${esc(__(l.doctype))}: ${link(l.doctype, l.name)}<div class="omni-meta">${esc(l.via)}</div></div>`).join("")
			: `<div class="omni-empty">—</div>`;
		html += `<div class="omni-group">${__("Referenced by")}</div>`;
		html += back.length
			? back
					.map((g) => {
						const more = g.count > g.docs.length ? ` <span class="omni-meta">+${g.count - g.docs.length}</span>` : "";
						return `<div class="omni-item"><b>${esc(__(g.doctype))}</b> (${g.count})<div>${g.docs.map((x) => `<span class="omni-pill">${link(g.doctype, x.name)}</span>`).join("")}${more}</div></div>`;
					})
					.join("")
			: `<div class="omni-empty">—</div>`;
		return html;
	}

	function comments(rows) {
		if (!rows.length) return `<div class="omni-empty">${__("No activity")}</div>`;
		return rows
			.map((c) => {
				const text = $("<div>").html(c.content || "").text();
				return `<div class="omni-item"><div class="omni-meta">${esc(__(c.comment_type))} · ${esc(frappe.user.full_name(c.owner))} · ${when(c.creation)}</div><div>${esc(text)}</div></div>`;
			})
			.join("");
	}

	// Omni Anchor: a provider tab bound to an HTML field on the form (the bridge between panel and form)
	function anchorJump(t) {
		if (!t.anchor || !currentFrm || !currentFrm.fields_dict[t.anchor]) return "";
		return `<div style="margin-bottom:8px"><button class="btn btn-xs btn-default omni-jump" data-anchor="${esc(t.anchor)}">${__("Show on form")}</button></div>`;
	}

	function providerTab(t) {
		if (t.error) return `<div class="omni-empty">${esc(t.error)}</div>`;
		if (t.html) return t.html; // trusted: produced by server-side app code
		const cols = t.columns || [];
		const rows = t.rows || [];
		if (!rows.length) return `<div class="omni-empty">${__("No data")}</div>`;
		const fmt = (c, v) => (c.fieldtype ? frappe.format(v, c) : esc(v));
		return `<div class="table-responsive"><table class="table table-bordered table-sm">
			<thead><tr>${cols.map((c) => `<th>${esc(__(c.label))}</th>`).join("")}</tr></thead>
			<tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${fmt(c, r[c.fieldname])}</td>`).join("")}</tr>`).join("")}</tbody>
		</table></div>`;
	}

	// ---------- client mirror of Omni Rules ----------
	function applyRules(frm, rules) {
		(rules.read_only || []).forEach((f) => frm.set_df_property(f, "read_only", 1));
		(rules.mandatory || []).forEach((f) => frm.set_df_property(f, "reqd", 1));
	}

	function fillAnchors(frm) {
		const fields = ((cfg().anchors || {})[frm.doctype] || []).filter((f) => frm.fields_dict[f]);
		if (!fields.length) return;
		fields.forEach((f) => frm.fields_dict[f].$wrapper.html(`<div class="text-muted">${__("Loading")}...</div>`));
		frappe
			.xcall("omnispace.panel.get_anchor_tabs", { doctype: frm.doctype, name: frm.doc.name })
			.then((tabs) => {
				const done = new Set();
				(tabs || []).forEach((t) => {
					const fd = frm.fields_dict[t.anchor];
					if (!fd) return;
					fd.$wrapper.html((done.has(t.anchor) ? fd.$wrapper.html() : "") + providerTab(t));
					done.add(t.anchor);
				});
				fields.filter((f) => !done.has(f)).forEach((f) => frm.fields_dict[f].$wrapper.empty());
			})
			.catch(() => fields.forEach((f) => frm.fields_dict[f].$wrapper.empty()));
	}

	// ---------- hook into every form ----------
	$(document).on("form-refresh", (e, frm) => {
		if (!frm || !frm.doc || frm.is_new()) return;
		const c = cfg();
		if (enabledFor(frm.doctype)) {
			frm.add_custom_button(__("Omnispace"), () => open(frm));
			if (current && current.doctype === frm.doctype && current.name === frm.doc.name) load(frm.doctype, frm.doc.name);
		}
		if (c.enabled) fillAnchors(frm);
		if ((c.rule_doctypes || []).includes(frm.doctype)) {
			frappe.xcall("omnispace.panel.get_form_rules", { doctype: frm.doctype, name: frm.doc.name }).then((r) => applyRules(frm, r || {}));
		}
	});

	frappe.provide("omnispace");
	omnispace.open_panel = open;
	omnispace.refresh_anchors = fillAnchors;
})();
