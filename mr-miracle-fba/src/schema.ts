// SQLite schema for the Store Durable Object.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT NOT NULL,
  pass_hash TEXT NOT NULL, salt TEXT NOT NULL, active INTEGER DEFAULT 1, created_at INTEGER, last_login INTEGER);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER, expires INTEGER);
CREATE TABLE IF NOT EXISTS login_fail (email TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS products (sku TEXT PRIMARY KEY, asin TEXT, fnsku TEXT, title TEXT, brand TEXT, image TEXT, status TEXT,
  fulfillment TEXT, price REAL, is_mrm INTEGER, mrm_auto INTEGER DEFAULT 0, product_type TEXT, discontinued INTEGER DEFAULT 0,
  direct_fba INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, cogs REAL, catalog_at INTEGER, first_seen INTEGER, updated_at INTEGER);
CREATE INDEX IF NOT EXISTS products_asin ON products(asin);
CREATE TABLE IF NOT EXISTS sales_daily (day TEXT, sku TEXT, asin TEXT, units INTEGER, revenue REAL, priced_units INTEGER, orders INTEGER,
  est_revenue REAL DEFAULT 0, PRIMARY KEY (day, sku));
CREATE INDEX IF NOT EXISTS sales_sku ON sales_daily(sku, day);
CREATE INDEX IF NOT EXISTS sales_asin ON sales_daily(asin, day);
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
CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, area TEXT, msg TEXT);
CREATE TABLE IF NOT EXISTS email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, subject TEXT, status TEXT, error TEXT);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, user TEXT, action TEXT, detail TEXT);
`;
