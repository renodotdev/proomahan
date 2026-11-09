-- Normalize selected units so foreign keys enforce neighborhood ownership.
ALTER TABLE app.billing_runs DROP COLUMN selected_unit_ids;
CREATE TABLE app.billing_run_units (
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 billing_run_id uuid NOT NULL, unit_id uuid NOT NULL,
 PRIMARY KEY (tenant_id,billing_run_id,unit_id),
 FOREIGN KEY (tenant_id,billing_run_id) REFERENCES app.billing_runs(tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id)
);
ALTER TABLE app.billing_run_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON app.billing_run_units USING (tenant_id=app.tenant_context()) WITH CHECK (tenant_id=app.tenant_context());
GRANT SELECT,INSERT ON app.billing_run_units TO proomahan_app;
REVOKE ALL ON app.billing_run_units FROM PUBLIC;
CREATE FUNCTION app.audit_payment_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,summary)
  VALUES (NEW.tenant_id,coalesce(app.actor_context(),NEW.verified_by,NEW.submitted_by),'payment.'||NEW.status,'payment',NEW.id,jsonb_build_object('status',NEW.status,'origin',NEW.origin,'amount',NEW.amount));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_payment_state AFTER INSERT OR UPDATE ON app.payments FOR EACH ROW EXECUTE FUNCTION app.audit_payment_state();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO proomahan_app;
