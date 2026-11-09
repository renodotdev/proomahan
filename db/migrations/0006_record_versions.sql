CREATE FUNCTION app.touch_record_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.updated_at := clock_timestamp();
 NEW.row_version := OLD.row_version + 1;
 RETURN NEW;
END $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema,table_name) WHERE c.table_schema='app' AND c.column_name='updated_at' AND t.table_type='BASE TABLE' AND c.table_name NOT IN ('audit_events','payment_reversals') LOOP
  EXECUTE format('ALTER TABLE app.%I ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0)',r.table_name);
  EXECUTE format('CREATE TRIGGER touch_record_version BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.touch_record_version()',r.table_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.touch_record_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.touch_record_version() TO proomahan_app;
