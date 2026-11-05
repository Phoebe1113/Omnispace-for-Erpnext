# Omnispace for ERPNext

A Frappe app (ERPNext v16) that adds one context panel to every form and a rule engine to control every DocType.

| Block | What it does |
|---|---|
| **Panel** | "Omnispace" button on each enabled form → drawer with Overview, field-level History, Links (both directions), Activity, plus tabs contributed by other apps |
| **Omni Rule** | Per-DocType rules (Block / Mandatory / Read Only / Warning) with a Python condition, enforced **server-side** on Save / Submit / Cancel — form, REST API and Data Import alike |
| **Omni Settings** | Which DocTypes get the panel, who may open it, history depth, extra features |
| **Form sections** | Tracking sections added to standard forms, no custom fields: Sales Order Tracking, Delivery Tracking, Purchase Order Tracking (Purchase Receipt), Purchase Progress and Stock & Request History (Material Request), Last Purchase (Purchase Order); report **Omni SO Tracking** |
| **Extras** | "My Documents" filter button on list views; notification items colored by document status |

## Install

```bash
bench get-app https://github.com/Phoebe1113/Omnispace-for-Erpnext
bench --site <site> install-app omnispace
```

frappe_docker: add the repo to `apps.json`, rebuild the image, then `bench --site <site> install-app omnispace` and `migrate`.

## Configure

1. **Omni Settings** → tick *Show Panel on All DocTypes* or list DocTypes; optionally restrict roles.
2. Turn on **Track Changes** for DocTypes whose field history you want (Customize Form).
3. **Omni Rule** → add rules. Example: action *Read Only*, fields `customer`, condition `doc.workflow_state == "Approved"`; or action *Block*, condition `doc.grand_total > 100000000`, with managers in *Exempt Roles*.

Administrator is always exempt from rules. Rules never target `Omni *` DocTypes.

## Extend the panel from another app

```python
# your_app/hooks.py
omnispace_providers = {
    "Sales Order": "your_app.omni.so_tracking",
    "*": "your_app.omni.everywhere",   # every enabled DocType
}
```

```python
# your_app/omni.py
def so_tracking(doc):
    return {
        "label": "SO Tracking",
        "columns": [{"label": "Item", "fieldname": "item_code"},
                    {"label": "Delivered %", "fieldname": "pct", "fieldtype": "Percent"}],
        "rows": [...],
    }
    # or {"label": "...", "html": "<div>...</div>"}  (server-generated HTML is trusted)
```

### Omni Anchor – bridge fields on the form

An *anchor* is an HTML field on the form that a provider tab is bound to (`"anchor": "<fieldname>"` in the tab dict).

- In the panel, an anchored tab gets a **Show on form** button that scrolls to that field.
- If the app also lists the field in `omnispace_anchors`, Omnispace **renders the tab into the field** on every form refresh — no per-DocType JS needed:

```python
omnispace_anchors = {"Sales Order": ["my_tracking_html"]}
```

Leave a field out of `omnispace_anchors` while another script still renders it, so the two do not overwrite each other.

Permission is checked before providers run; providers should still only return data the user may see.

## License

MIT
