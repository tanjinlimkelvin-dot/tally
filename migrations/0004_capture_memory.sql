CREATE TABLE merchant_rules(merchant_key TEXT PRIMARY KEY,category TEXT NOT NULL REFERENCES categories(key));
CREATE TABLE ingest_meta(id INTEGER PRIMARY KEY CHECK(id=1),last_at TEXT,bytes INTEGER NOT NULL DEFAULT 0,invalid INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER merchant_learn_insert AFTER INSERT ON entries WHEN NEW.source='manual' AND NEW.merchant!='' AND NEW.deleted_at IS NULL AND NEW.needs_review=0 BEGIN
 INSERT INTO merchant_rules(merchant_key,category) VALUES(upper(trim(NEW.merchant)),NEW.category) ON CONFLICT(merchant_key) DO UPDATE SET category=excluded.category;
END;
CREATE TRIGGER merchant_learn_update AFTER UPDATE ON entries WHEN NEW.merchant!='' AND NEW.deleted_at IS NULL AND NEW.needs_review=0 AND (NEW.category!=OLD.category OR NEW.merchant!=OLD.merchant OR OLD.needs_review!=0) BEGIN
 INSERT INTO merchant_rules(merchant_key,category) VALUES(upper(trim(NEW.merchant)),NEW.category) ON CONFLICT(merchant_key) DO UPDATE SET category=excluded.category;
END;
