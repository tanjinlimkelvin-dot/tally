CREATE TABLE owner(id INTEGER PRIMARY KEY CHECK(id=1), password TEXT NOT NULL);
CREATE TABLE sessions(hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE tokens(id TEXT PRIMARY KEY,label TEXT NOT NULL,hash TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,last_used_at TEXT);
CREATE TABLE limits(key TEXT PRIMARY KEY,n INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE categories(key TEXT PRIMARY KEY,label TEXT NOT NULL COLLATE NOCASE UNIQUE,emoji TEXT NOT NULL DEFAULT '',position INTEGER NOT NULL,excluded INTEGER NOT NULL DEFAULT 0);
INSERT INTO categories(key,label,position) VALUES ('food','Food & drinks',0),('groceries','Groceries',1),('transport','Transport',2),('shopping','Shopping',3),('bills','Bills',4),('health','Health',5),('entertainment','Entertainment',6),('travel','Travel',7),('education','Education',8),('other','Other',9);
CREATE TABLE entries(id INTEGER PRIMARY KEY AUTOINCREMENT,client_id TEXT UNIQUE NOT NULL,occurred_at TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>=0 AND amount_cents<=100000000000),kind TEXT NOT NULL DEFAULT 'expense' CHECK(kind='expense'),category TEXT NOT NULL DEFAULT 'other' REFERENCES categories(key),merchant TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',card TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT 'manual',raw_amount TEXT NOT NULL DEFAULT '',needs_review INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT,merged_into INTEGER,version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX entries_date ON entries(occurred_at);
CREATE TABLE audit(id INTEGER PRIMARY KEY,entry_id INTEGER NOT NULL,action TEXT NOT NULL,before_json TEXT,after_json TEXT,at TEXT NOT NULL,why TEXT NOT NULL DEFAULT '');
CREATE TRIGGER entries_insert AFTER INSERT ON entries BEGIN
 INSERT INTO audit(entry_id,action,after_json,at) VALUES(NEW.id,CASE WHEN NEW.source='manual' THEN 'create' ELSE NEW.source END,json_object('amount_cents',NEW.amount_cents,'category',NEW.category,'merchant',NEW.merchant,'note',NEW.note,'occurred_at',NEW.occurred_at),NEW.updated_at);
END;
CREATE TRIGGER entries_update AFTER UPDATE ON entries BEGIN
 INSERT INTO audit(entry_id,action,before_json,after_json,at) VALUES(NEW.id,CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN CASE WHEN NEW.merged_into IS NOT NULL THEN 'merge' ELSE 'delete' END WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore' ELSE 'edit' END,json_object('amount_cents',OLD.amount_cents,'category',OLD.category,'merchant',OLD.merchant,'note',OLD.note,'occurred_at',OLD.occurred_at),json_object('amount_cents',NEW.amount_cents,'category',NEW.category,'merchant',NEW.merchant,'note',NEW.note,'occurred_at',NEW.occurred_at),NEW.updated_at);
END;
CREATE TABLE ingest_events(event_id TEXT PRIMARY KEY,status TEXT NOT NULL);
CREATE TABLE skipped(id INTEGER PRIMARY KEY,client_id TEXT UNIQUE NOT NULL,occurred_at TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,amount_cents INTEGER NOT NULL DEFAULT 0,verdict_reason TEXT NOT NULL DEFAULT 'Unrecognized notification — review manually',status TEXT NOT NULL DEFAULT 'new');
CREATE TABLE ignored_taps(merchant_key TEXT PRIMARY KEY,label TEXT NOT NULL);
CREATE TABLE budgets(category TEXT PRIMARY KEY,cents INTEGER NOT NULL CHECK(cents>0));
CREATE TABLE alerts(month TEXT NOT NULL,category TEXT NOT NULL,level INTEGER NOT NULL,PRIMARY KEY(month,category,level));
CREATE TABLE recurring(id INTEGER PRIMARY KEY AUTOINCREMENT,ckey TEXT UNIQUE NOT NULL,merchant TEXT NOT NULL,amount_cents INTEGER NOT NULL,category TEXT NOT NULL REFERENCES categories(key),note TEXT NOT NULL DEFAULT '',every TEXT NOT NULL,start TEXT NOT NULL,until TEXT NOT NULL DEFAULT '',paused INTEGER NOT NULL DEFAULT 0,floor TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
