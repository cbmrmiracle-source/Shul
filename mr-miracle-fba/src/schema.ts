// SQLite schema for the Store Durable Object.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT NOT NULL,
  pass_hash TEXT NOT NULL, salt TEXT NOT NULL, active INTEGER DEFAULT 1, created_at INTEGER, last_login INTEGER);
CREATE TABLE IF NOT EXISTS login_fail (email TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS products (sku TEXT PRIMARY KEY, asin TEXT, fnsku TEXT, title TEXT, brand TEXT, image TEXT, status TEXT,
  fulfillment TEXT, price REAL, is_mrm INTEGER, mrm_auto INTEGER DEFAULT 0, product_type TEXT, discontinued INTEGER DEFAULT 0,
  direct_fba INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, cogs REAL, catalog_at INTEGER, first_seen INTEGER, updated_at INTEGER);
CREATE INDEX IF NOT EXISTS products_asin ON products(asin);
CREATE TABLE IF NOT EXISTS sales_daily (day TEXT, sku TEXT, asin TEXT, units INTEGER, revenue REAL, priced_units INTEGER, orders INTEGER,
  est_revenue REAL DEFAULT 0, asp_revenue REAL DEFAULT 0, asp_units INTEGER DEFAULT 0,
  last_price REAL, last_ts INTEGER, PRIMARY KEY (day, sku));
CREATE TABLE IF NOT EXISTS sales_totals (day TEXT PRIMARY KEY, units INTEGER, revenue REAL);
CREATE TABLE IF NOT EXISTS inventory (sku TEXT PRIMARY KEY, asin TEXT, fnsku TEXT, fulfillable INTEGER, reserved INTEGER, fc_transfer INTEGER,
  fc_processing INTEGER, customer_order INTEGER, inbound_working INTEGER, inbound_shipped INTEGER, inbound_receiving INTEGER,
  unfulfillable INTEGER, researching INTEGER, total INTEGER, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS planning (sku TEXT PRIMARY KEY, asin TEXT, snapshot TEXT, days_of_supply REAL, hist_dos REAL, short_hist_dos REAL,
  long_hist_dos REAL, min_level REAL, health TEXT, low_inv_applied TEXT, low_inv_exempt TEXT, rec_ship_qty REAL, rec_ship_date TEXT,
  total_dos REAL, featured_price REAL, alert TEXT, storage_cost_next_month REAL, updated_day TEXT);
CREATE TABLE IF NOT EXISTS fee_snapshots (day TEXT, sku TEXT, asin TEXT, price REAL, fulfil_fee REAL, referral_fee REAL, total_fee REAL,
  longest REAL, median REAL, shortest REAL, dim_unit TEXT, weight REAL, weight_unit TEXT, size_tier TEXT, future_fulfil_fee REAL,
  low_inv TEXT, low_inv_exempt TEXT, PRIMARY KEY (day, sku));
CREATE INDEX IF NOT EXISTS fee_snap_sku ON fee_snapshots(sku, day);
CREATE TABLE IF NOT EXISTS fee_changes (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT, sku TEXT, asin TEXT, category TEXT, old_fee REAL,
  new_fee REAL, old_dims TEXT, new_dims TEXT, old_tier TEXT, new_tier TEXT, old_price REAL, new_price REAL, note TEXT, created_at INTEGER);
CREATE INDEX IF NOT EXISTS fee_changes_day ON fee_changes(day);
CREATE TABLE IF NOT EXISTS price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT, ts INTEGER, old_price REAL, new_price REAL, source TEXT, user TEXT);
CREATE INDEX IF NOT EXISTS price_history_sku ON price_history(sku, ts);
CREATE TABLE IF NOT EXISTS reprice_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, json TEXT);
CREATE TABLE IF NOT EXISTS reprice_skus (sku TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, rule_id INTEGER, min_price REAL, max_price REAL,
  last_run INTEGER, last_action TEXT);
CREATE TABLE IF NOT EXISTS reprice_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, sku TEXT, asin TEXT, old_price REAL, new_price REAL,
  bb_price REAL, we_had_bb INTEGER, reason TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS price_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT, price REAL, old_price REAL, source TEXT, user TEXT,
  status TEXT, error TEXT, created_at INTEGER, done_at INTEGER);
CREATE TABLE IF NOT EXISTS offer_queue (asin TEXT PRIMARY KEY, reasons INTEGER, queued_at INTEGER);
CREATE TABLE IF NOT EXISTS offers_latest (asin TEXT PRIMARY KEY, ts INTEGER, total_offers INTEGER, sellers INTEGER, fba INTEGER, fbm INTEGER,
  bb_seller TEXT, bb_price REAL, our_price REAL, we_have_bb INTEGER, lowest_fba REAL, lowest REAL, seller_ids TEXT, offers_json TEXT, error TEXT);
CREATE TABLE IF NOT EXISTS tracked_asins (asin TEXT PRIMARY KEY, added_at INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS seller_history (asin TEXT, ts INTEGER, sellers INTEGER, fba INTEGER, fbm INTEGER);
CREATE INDEX IF NOT EXISTS seller_history_asin ON seller_history(asin, ts);
CREATE TABLE IF NOT EXISTS seller_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, asin TEXT, old_count INTEGER, new_count INTEGER,
  added TEXT, removed TEXT, emailed INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS report_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, report_type TEXT, report_id TEXT, status TEXT,
  params TEXT, error TEXT, rows INTEGER, created_at INTEGER, polled_at INTEGER, done_at INTEGER);
CREATE TABLE IF NOT EXISTS jobs_state (name TEXT PRIMARY KEY, last_run INTEGER, last_ok INTEGER, info TEXT);
CREATE TABLE IF NOT EXISTS image_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT, asin TEXT, slots TEXT, status TEXT, result TEXT,
  submission_id TEXT, user TEXT, created_at INTEGER, done_at INTEGER);
CREATE TABLE IF NOT EXISTS inv_errors (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT, qty INTEGER, note TEXT, start_day TEXT, end_day TEXT,
  created_by TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS ship_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, status TEXT, inbound_plan_id TEXT, address TEXT,
  data TEXT, last_error TEXT, created_by TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS fba_shipments (shipment_id TEXT PRIMARY KEY, name TEXT, status TEXT, dest_fc TEXT, ship_from TEXT, label_prep TEXT,
  box_source TEXT, created_day TEXT, first_seen INTEGER, updated_at INTEGER, items_json TEXT, sku_count INTEGER, units INTEGER, received INTEGER,
  items_at INTEGER, plan_id INTEGER, submitted_by TEXT, note TEXT, shipping_cost REAL);
CREATE TABLE IF NOT EXISTS inv_products (id INTEGER PRIMARY KEY AUTOINCREMENT, ext_id TEXT, name TEXT UNIQUE NOT NULL, title TEXT, image TEXT, upc TEXT,
  avg_cost REAL DEFAULT 0, tags TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at INTEGER, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS inv_mappings (sku TEXT NOT NULL, product_id INTEGER NOT NULL, qty REAL NOT NULL, PRIMARY KEY (sku, product_id));
CREATE INDEX IF NOT EXISTS inv_mappings_product ON inv_mappings(product_id);
CREATE TABLE IF NOT EXISTS vendors (id INTEGER PRIMARY KEY AUTOINCREMENT, ext_id TEXT, name TEXT UNIQUE NOT NULL, address1 TEXT, address2 TEXT, city TEXT,
  state TEXT, postal TEXT, country TEXT, phone TEXT, email TEXT, lead_days REAL, purchase_days REAL, safety_stock REAL, order_min REAL, terms TEXT,
  currency TEXT, active INTEGER DEFAULT 1, created_at INTEGER);
CREATE TABLE IF NOT EXISTS vendor_items (id INTEGER PRIMARY KEY AUTOINCREMENT, ext_id TEXT, product_id INTEGER, vendor_id INTEGER, vendor_item_name TEXT,
  model TEXT, price REAL, avg_price REAL, case_qty REAL, moq REAL, rounding TEXT, out_of_stock INTEGER DEFAULT 0, is_primary INTEGER DEFAULT 0, upc TEXT,
  notes TEXT, length REAL, width REAL, height REAL, weight REAL, active INTEGER DEFAULT 1);
CREATE INDEX IF NOT EXISTS vendor_items_product ON vendor_items(product_id);
CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, address TEXT, is_default INTEGER DEFAULT 0,
  is_deduct INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS stock (product_id INTEGER NOT NULL, warehouse_id INTEGER NOT NULL, qty REAL NOT NULL DEFAULT 0, PRIMARY KEY (product_id, warehouse_id));
CREATE TABLE IF NOT EXISTS stock_moves (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, product_id INTEGER, warehouse_id INTEGER, qty REAL, unit_cost REAL,
  value REAL, type TEXT, ref TEXT, note TEXT, user TEXT);
CREATE INDEX IF NOT EXISTS stock_moves_product ON stock_moves(product_id, ts);
CREATE TABLE IF NOT EXISTS purchase_orders (id INTEGER PRIMARY KEY, vendor_id INTEGER, vendor_name TEXT, status TEXT, warehouse_id INTEGER, warehouse_name TEXT,
  invoice_number TEXT, invoice_date TEXT, created_at INTEGER, submitted_at INTEGER, expected_on TEXT, received_at INTEGER, items_cost REAL DEFAULT 0,
  shipping_cost REAL DEFAULT 0, discount REAL DEFAULT 0, other_cost REAL DEFAULT 0, subtotal REAL DEFAULT 0, total_items INTEGER DEFAULT 0, total_qty REAL DEFAULT 0,
  received_qty REAL DEFAULT 0, received_value REAL DEFAULT 0, amount_paid REAL DEFAULT 0, currency TEXT, notes TEXT, attachments TEXT, submitted_by TEXT,
  imported INTEGER DEFAULT 0, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS po_items (id INTEGER PRIMARY KEY AUTOINCREMENT, po_id INTEGER NOT NULL, product_id INTEGER, vendor_item_id INTEGER, name TEXT,
  qty REAL DEFAULT 0, case_qty REAL, price REAL DEFAULT 0, discount REAL DEFAULT 0, extra_cost REAL DEFAULT 0, received REAL DEFAULT 0);
CREATE INDEX IF NOT EXISTS po_items_po ON po_items(po_id);
CREATE TABLE IF NOT EXISTS ship_deductions (ref TEXT PRIMARY KEY, warehouse_id INTEGER, at INTEGER, user TEXT, units REAL, value REAL, lines TEXT);
CREATE TABLE IF NOT EXISTS box_specs (sku TEXT PRIMARY KEY, units_per_box INTEGER, length REAL, width REAL, height REAL, weight REAL, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS ship_items (plan_id INTEGER, sku TEXT, asin TEXT, fnsku TEXT, qty INTEGER, PRIMARY KEY (plan_id, sku));
CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, area TEXT, msg TEXT);
CREATE TABLE IF NOT EXISTS email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, subject TEXT, status TEXT, error TEXT);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, user TEXT, action TEXT, detail TEXT);
`;

/** Versioned migrations for databases created by earlier versions (applied once, in order). */
export const MIGRATIONS: string[][] = [
  [
    "ALTER TABLE sales_daily ADD COLUMN asp_revenue REAL DEFAULT 0",
    "ALTER TABLE sales_daily ADD COLUMN asp_units INTEGER DEFAULT 0",
    "ALTER TABLE sales_daily ADD COLUMN last_price REAL",
    "ALTER TABLE sales_daily ADD COLUMN last_ts INTEGER",
  ],
  [
    // these indexes doubled the cost of every sales write; queries use the (day, sku) key or the products table instead
    "DROP INDEX IF EXISTS sales_sku",
    "DROP INDEX IF EXISTS sales_asin",
    "DROP TABLE IF EXISTS sessions",
    "INSERT OR REPLACE INTO sales_totals (day, units, revenue) SELECT day, SUM(units), ROUND(SUM(revenue), 2) FROM sales_daily GROUP BY day",
  ],
  [
    // errors moved to their own list with an end date; carry over existing ones for 30 days
    "INSERT INTO inv_errors (sku, qty, note, start_day, end_day, created_by, created_at) SELECT sku, errors, 'carried over', date('now'), date('now', '+30 days'), 'system', strftime('%s','now')*1000 FROM products WHERE errors > 0",
  ],
];
