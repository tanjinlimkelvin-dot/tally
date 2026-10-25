ALTER TABLE ingest_events ADD COLUMN payload TEXT;
CREATE TRIGGER ingest_event_accepted AFTER INSERT ON ingest_events WHEN NEW.status='accepted' BEGIN
 INSERT INTO entries(client_id,occurred_at,amount_cents,category,merchant,note,card,source,needs_review,raw_amount,created_at,updated_at)
 VALUES('event:'||NEW.event_id,json_extract(NEW.payload,'$.occurred_at'),json_extract(NEW.payload,'$.amount_cents'),coalesce(json_extract(NEW.payload,'$.category'),'other'),json_extract(NEW.payload,'$.merchant'),json_extract(NEW.payload,'$.note'),json_extract(NEW.payload,'$.card'),json_extract(NEW.payload,'$.source'),1,json_extract(NEW.payload,'$.raw_amount'),json_extract(NEW.payload,'$.created_at'),json_extract(NEW.payload,'$.created_at'));
 UPDATE ingest_events SET payload=NULL WHERE event_id=NEW.event_id;
END;
CREATE TRIGGER ingest_event_skipped AFTER INSERT ON ingest_events WHEN NEW.status='skipped' BEGIN
 INSERT INTO skipped(client_id,occurred_at,title,body,amount_cents)
 VALUES(NEW.event_id,json_extract(NEW.payload,'$.occurred_at'),json_extract(NEW.payload,'$.title'),json_extract(NEW.payload,'$.body'),json_extract(NEW.payload,'$.amount_cents'));
 UPDATE ingest_events SET payload=NULL WHERE event_id=NEW.event_id;
END;
