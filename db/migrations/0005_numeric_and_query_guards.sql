-- PostgreSQL numeric admits NaN; financial and meter quantities must be finite.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema,table_name) WHERE c.table_schema='app' AND c.data_type='numeric' AND t.table_type='BASE TABLE' LOOP
  EXECUTE format('ALTER TABLE app.%I ADD CONSTRAINT %I CHECK (%I <> ''NaN''::numeric)',r.table_name,r.table_name||'_'||r.column_name||'_finite',r.column_name);
 END LOOP;
END $$;
CREATE INDEX membership_actor_lookup ON app.tenant_memberships(user_id,status);
CREATE INDEX ownership_person_lookup ON app.unit_ownerships(tenant_id,person_id,start_date,end_date);
CREATE INDEX occupancy_person_lookup ON app.occupancy_members(tenant_id,person_id,start_date,end_date);
CREATE INDEX invoice_person_period ON app.invoices(tenant_id,bill_to_person_id,period DESC);
CREATE INDEX allocation_invoice_items ON app.payment_allocations(tenant_id,invoice_item_id,stage);
CREATE INDEX allocation_payment_lookup ON app.payment_allocations(tenant_id,payment_id,stage);
CREATE INDEX files_uploader_lookup ON app.files(tenant_id,uploaded_by,created_at DESC);
