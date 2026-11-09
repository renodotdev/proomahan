-- Date boundaries are inclusive at start and exclusive at end.
CREATE FUNCTION app.check_housing_periods() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conflicting boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || NEW.unit_id::text,0));
 IF TG_TABLE_NAME='unit_occupancies' THEN
  SELECT EXISTS(SELECT 1 FROM app.unit_occupancies r WHERE r.tenant_id=NEW.tenant_id AND r.unit_id=NEW.unit_id AND r.id<>NEW.id AND daterange(r.start_date,r.end_date,'[)') && daterange(NEW.start_date,NEW.end_date,'[)')) INTO conflicting;
  IF EXISTS(SELECT 1 FROM app.occupancy_members m WHERE m.tenant_id=NEW.tenant_id AND m.occupancy_id=NEW.id AND NOT (daterange(NEW.start_date,NEW.end_date,'[)') @> daterange(m.start_date,m.end_date,'[)'))) THEN RAISE EXCEPTION 'Occupancy members must fit inside occupancy dates'; END IF;
 ELSE
  SELECT EXISTS(SELECT 1 FROM app.unit_ownerships r WHERE r.tenant_id=NEW.tenant_id AND r.unit_id=NEW.unit_id AND r.id<>NEW.id AND (r.person_id=NEW.person_id OR (r.is_primary_contact AND NEW.is_primary_contact)) AND daterange(r.start_date,r.end_date,'[)') && daterange(NEW.start_date,NEW.end_date,'[)')) INTO conflicting;
 END IF;
 IF conflicting THEN RAISE EXCEPTION 'Overlapping housing period'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_occupancy BEFORE INSERT OR UPDATE ON app.unit_occupancies FOR EACH ROW EXECUTE FUNCTION app.check_housing_periods();
CREATE TRIGGER check_ownership BEFORE INSERT OR UPDATE ON app.unit_ownerships FOR EACH ROW EXECUTE FUNCTION app.check_housing_periods();
CREATE FUNCTION app.check_occupancy_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p app.unit_occupancies;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || NEW.occupancy_id::text,0));
 SELECT * INTO p FROM app.unit_occupancies WHERE tenant_id=NEW.tenant_id AND id=NEW.occupancy_id FOR UPDATE;
 IF NOT FOUND OR NOT (daterange(p.start_date,p.end_date,'[)') @> daterange(NEW.start_date,NEW.end_date,'[)')) THEN RAISE EXCEPTION 'Member dates outside occupancy'; END IF;
 IF EXISTS(SELECT 1 FROM app.occupancy_members m WHERE m.tenant_id=NEW.tenant_id AND m.occupancy_id=NEW.occupancy_id AND m.id<>NEW.id AND (m.person_id=NEW.person_id OR (m.is_primary_contact AND NEW.is_primary_contact)) AND daterange(m.start_date,m.end_date,'[)') && daterange(NEW.start_date,NEW.end_date,'[)')) THEN RAISE EXCEPTION 'Overlapping occupancy member'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_member BEFORE INSERT OR UPDATE ON app.occupancy_members FOR EACH ROW EXECUTE FUNCTION app.check_occupancy_member();
CREATE FUNCTION app.check_role_term() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || NEW.membership_id::text || NEW.role,0));
 IF EXISTS(SELECT 1 FROM app.role_assignments r WHERE r.tenant_id=NEW.tenant_id AND r.membership_id=NEW.membership_id AND r.role=NEW.role AND r.id<>NEW.id AND tstzrange(r.starts_at,least(r.ends_at,coalesce(r.revoked_at,r.ends_at)),'[)') && tstzrange(NEW.starts_at,least(NEW.ends_at,coalesce(NEW.revoked_at,NEW.ends_at)),'[)')) THEN RAISE EXCEPTION 'Overlapping role term'; END IF;
 IF NEW.renews_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.role_assignments r WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.renews_id AND r.membership_id=NEW.membership_id AND r.role=NEW.role AND r.ends_at<=NEW.starts_at AND r.revoked_at IS NULL) THEN RAISE EXCEPTION 'Invalid role renewal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_role_term BEFORE INSERT OR UPDATE ON app.role_assignments FOR EACH ROW EXECUTE FUNCTION app.check_role_term();
CREATE FUNCTION app.check_billing_periods() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || NEW.fee_item_id::text,0));
 IF TG_TABLE_NAME='fee_schedules' THEN
  IF EXISTS(SELECT 1 FROM app.fee_schedules r WHERE r.tenant_id=NEW.tenant_id AND r.fee_item_id=NEW.fee_item_id AND r.id<>NEW.id AND r.scope=NEW.scope AND r.cluster_id IS NOT DISTINCT FROM NEW.cluster_id AND r.unit_id IS NOT DISTINCT FROM NEW.unit_id AND daterange(r.effective_from,r.effective_to,'[)') && daterange(NEW.effective_from,NEW.effective_to,'[)')) THEN RAISE EXCEPTION 'Overlapping fee schedule'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM app.unit_billing_responsibilities r WHERE r.tenant_id=NEW.tenant_id AND r.fee_item_id=NEW.fee_item_id AND r.unit_id=NEW.unit_id AND r.id<>NEW.id AND daterange(r.start_date,r.end_date,'[)') && daterange(NEW.start_date,NEW.end_date,'[)')) THEN RAISE EXCEPTION 'Overlapping billing responsibility'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_fee_period BEFORE INSERT OR UPDATE ON app.fee_schedules FOR EACH ROW EXECUTE FUNCTION app.check_billing_periods();
CREATE TRIGGER check_payer_period BEFORE INSERT OR UPDATE ON app.unit_billing_responsibilities FOR EACH ROW EXECUTE FUNCTION app.check_billing_periods();

CREATE FUNCTION app.freeze_invoice_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
 SELECT status INTO parent_status FROM app.invoices WHERE tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id) AND id=coalesce(NEW.invoice_id,OLD.invoice_id) FOR UPDATE;
 IF parent_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Only draft invoice items may change'; END IF;
 IF TG_OP='UPDATE' AND (NEW.invoice_id<>OLD.invoice_id OR NEW.tenant_id<>OLD.tenant_id) THEN RAISE EXCEPTION 'Invoice item cannot change parent'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER freeze_invoice_item BEFORE INSERT OR UPDATE OR DELETE ON app.invoice_items FOR EACH ROW EXECUTE FUNCTION app.freeze_invoice_item();
CREATE FUNCTION app.check_invoice_issue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status<>'draft' THEN
  IF (to_jsonb(NEW)-ARRAY['status','void_reason','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','void_reason','updated_at']) OR OLD.status='void' OR NEW.status<>'void' THEN RAISE EXCEPTION 'Issued invoice snapshot is immutable'; END IF;
  IF EXISTS(SELECT 1 FROM app.payment_allocations a JOIN app.payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id) WHERE a.tenant_id=OLD.tenant_id AND a.invoice_id=OLD.id AND a.stage='verified' AND p.status='verified' AND NOT EXISTS(SELECT 1 FROM app.payment_reversals r WHERE (r.tenant_id,r.payment_id)=(p.tenant_id,p.id))) THEN RAISE EXCEPTION 'Reverse verified payments before voiding an invoice'; END IF;
 END IF;
 IF NEW.status='issued' AND (NEW.total_amount<>(SELECT coalesce(sum(line_amount),0) FROM app.invoice_items WHERE tenant_id=NEW.tenant_id AND invoice_id=NEW.id)) THEN RAISE EXCEPTION 'Invoice total must equal its item sum'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_invoice_issue BEFORE INSERT OR UPDATE ON app.invoices FOR EACH ROW EXECUTE FUNCTION app.check_invoice_issue();
CREATE FUNCTION app.check_payment_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p app.payments; i app.invoices;
BEGIN
 SELECT * INTO p FROM app.payments WHERE tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id) AND id=coalesce(NEW.payment_id,OLD.payment_id) FOR UPDATE;
 IF p.status IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Reviewed payment allocations are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id<>OLD.tenant_id OR NEW.payment_id<>OLD.payment_id) THEN RAISE EXCEPTION 'Allocation cannot change payment'; END IF;
 SELECT * INTO i FROM app.invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.invoice_id;
 IF NOT FOUND OR i.status<>'issued' OR i.unit_id<>p.unit_id OR i.bill_to_person_id<>p.bill_to_person_id OR i.currency<>p.currency THEN RAISE EXCEPTION 'Allocation billing scope mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_allocation BEFORE INSERT OR UPDATE OR DELETE ON app.payment_allocations FOR EACH ROW EXECUTE FUNCTION app.check_payment_allocation();
CREATE FUNCTION app.check_payment_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocated numeric; overpaid boolean;
BEGIN
 IF TG_OP='INSERT' AND NEW.status<>'submitted' THEN RAISE EXCEPTION 'Payments must start as submitted'; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'submitted' THEN RAISE EXCEPTION 'Reviewed payments are immutable; record a reversal'; END IF;
 IF NEW.status='verified' THEN
  -- Serialize settlement, including concurrent verifications against the same items.
  PERFORM i.id FROM app.invoice_items i JOIN app.payment_allocations a ON (a.tenant_id,a.invoice_item_id)=(i.tenant_id,i.id) WHERE a.tenant_id=NEW.tenant_id AND a.payment_id=NEW.id AND a.stage='verified' ORDER BY i.id FOR UPDATE OF i;
  SELECT sum(amount) INTO allocated FROM app.payment_allocations WHERE tenant_id=NEW.tenant_id AND payment_id=NEW.id AND stage='verified';
  IF allocated IS DISTINCT FROM NEW.amount THEN RAISE EXCEPTION 'Verified item checklist must equal payment amount'; END IF;
  IF EXISTS(SELECT 1 FROM app.payment_allocations a JOIN app.invoices i ON (i.tenant_id,i.id)=(a.tenant_id,a.invoice_id) WHERE a.tenant_id=NEW.tenant_id AND a.payment_id=NEW.id AND a.stage='verified' AND (i.status<>'issued' OR i.unit_id<>NEW.unit_id OR i.bill_to_person_id<>NEW.bill_to_person_id OR i.currency<>NEW.currency)) THEN RAISE EXCEPTION 'Allocation billing scope mismatch'; END IF;
  SELECT EXISTS(SELECT 1 FROM app.invoice_items i WHERE i.tenant_id=NEW.tenant_id AND i.id IN (SELECT invoice_item_id FROM app.payment_allocations WHERE tenant_id=NEW.tenant_id AND payment_id=NEW.id AND stage='verified') AND i.line_amount < (SELECT coalesce(sum(a.amount),0) FROM app.payment_allocations a JOIN app.payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id) WHERE (a.tenant_id,a.invoice_item_id)=(i.tenant_id,i.id) AND a.stage='verified' AND (p.id=NEW.id OR p.status='verified') AND NOT EXISTS(SELECT 1 FROM app.payment_reversals r WHERE (r.tenant_id,r.payment_id)=(p.tenant_id,p.id)))) INTO overpaid;
  IF overpaid THEN RAISE EXCEPTION 'Payment exceeds outstanding item balance'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_payment_review BEFORE INSERT OR UPDATE ON app.payments FOR EACH ROW EXECUTE FUNCTION app.check_payment_review();
CREATE FUNCTION app.check_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM app.payments WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id AND status='verified' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only verified payments may be reversed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_reversal BEFORE INSERT ON app.payment_reversals FOR EACH ROW EXECUTE FUNCTION app.check_reversal();
CREATE FUNCTION app.reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'History is append-only'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON app.audit_events FOR EACH ROW EXECUTE FUNCTION app.reject_history_change();
CREATE TRIGGER reversal_append_only BEFORE UPDATE OR DELETE ON app.payment_reversals FOR EACH ROW EXECUTE FUNCTION app.reject_history_change();

CREATE VIEW app.invoice_balances WITH (security_invoker=true) AS
 SELECT i.tenant_id,i.id AS invoice_id,i.total_amount,
 coalesce((SELECT sum(a.amount) FROM app.payment_allocations a JOIN app.payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id) WHERE (a.tenant_id,a.invoice_id)=(i.tenant_id,i.id) AND a.stage='verified' AND p.status='verified' AND NOT EXISTS(SELECT 1 FROM app.payment_reversals r WHERE (r.tenant_id,r.payment_id)=(p.tenant_id,p.id))),0) AS paid_amount
 FROM app.invoices i;
CREATE VIEW app.cash_statement WITH (security_invoker=true) AS
 SELECT tenant_id,id,cash_account_id,transaction_date,direction,amount,category,description,'manual'::text AS source FROM app.cash_entries WHERE voided_at IS NULL
 UNION ALL
 SELECT p.tenant_id,p.id,p.cash_account_id,(p.verified_at AT TIME ZONE t.timezone)::date,'income',p.amount,'billing','Verified resident payment','payment' FROM app.payments p JOIN app.tenants t ON t.id=p.tenant_id WHERE p.status='verified' AND NOT EXISTS(SELECT 1 FROM app.payment_reversals r WHERE (r.tenant_id,r.payment_id)=(p.tenant_id,p.id));

-- A real neighborhood root only. No invented resident, cluster, fee or administrator data.
INSERT INTO app.tenants(name,slug) VALUES ('D''Park City','dpark-city');

CREATE FUNCTION app.tenant_context() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id',true),'')::uuid $$;
CREATE FUNCTION app.actor_context() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.actor_id',true),'')::uuid $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='app' LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',r.tablename);
  IF r.tablename='tenants' THEN
   EXECUTE 'CREATE POLICY tenant_boundary ON app.tenants USING (id=app.tenant_context()) WITH CHECK (id=app.tenant_context())';
  ELSIF r.tablename='user_profiles' THEN
   EXECUTE 'CREATE POLICY own_profile ON app.user_profiles FOR SELECT USING (user_id=app.actor_context())';
  ELSIF r.tablename='platform_role_assignments' THEN
   EXECUTE 'CREATE POLICY own_platform_roles ON app.platform_role_assignments FOR SELECT USING (user_id=app.actor_context())';
  ELSIF r.tablename='tenant_memberships' THEN
   EXECUTE 'CREATE POLICY own_or_tenant_membership ON app.tenant_memberships FOR SELECT USING (user_id=app.actor_context() OR tenant_id=app.tenant_context())';
  ELSE
   EXECUTE format('CREATE POLICY tenant_boundary ON app.%I USING (tenant_id=app.tenant_context()) WITH CHECK (tenant_id=app.tenant_context())',r.tablename);
  END IF;
 END LOOP;
END $$;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO proomahan_app;
GRANT INSERT,UPDATE ON ALL TABLES IN SCHEMA app TO proomahan_app;
REVOKE INSERT,UPDATE ON app.user_profiles,app.platform_role_assignments,app.tenant_memberships,app.role_assignments,app.tenants,app.invoice_balances,app.cash_statement FROM proomahan_app;
REVOKE UPDATE ON app.audit_events,app.payment_reversals FROM proomahan_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO proomahan_app;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
