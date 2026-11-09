-- Serialize invoice voiding with settlement, not just item-to-item settlement.
CREATE FUNCTION app.lock_payment_invoices() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='verified' AND OLD.status='submitted' THEN
  PERFORM i.id FROM app.invoices i JOIN app.payment_allocations a ON (a.tenant_id,a.invoice_id)=(i.tenant_id,i.id) WHERE a.tenant_id=NEW.tenant_id AND a.payment_id=NEW.id AND a.stage='verified' ORDER BY i.id FOR UPDATE OF i;
 END IF;
 RETURN NEW;
END $$;
-- PostgreSQL executes same-event triggers in name order, before check_payment_review.
CREATE TRIGGER a_lock_payment_invoices BEFORE UPDATE ON app.payments FOR EACH ROW EXECUTE FUNCTION app.lock_payment_invoices();
CREATE FUNCTION app.protect_last_super_admin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(73180422);
 target := OLD.user_id;
 IF TG_TABLE_NAME='user_profiles' THEN
  IF NEW.status='active' THEN RETURN NEW; END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW.user_id=OLD.user_id AND NEW.starts_at=OLD.starts_at AND NEW.revoked_at IS NULL THEN RETURN NEW; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM app.platform_role_assignments r JOIN app.user_profiles p ON p.user_id=r.user_id WHERE r.user_id=target AND r.starts_at<=now() AND r.revoked_at IS NULL AND p.status='active') AND NOT EXISTS(SELECT 1 FROM app.platform_role_assignments r JOIN app.user_profiles p ON p.user_id=r.user_id WHERE r.user_id<>target AND r.starts_at<=now() AND r.revoked_at IS NULL AND p.status='active') THEN RAISE EXCEPTION 'Cannot remove the last active Super Administrator'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER protect_last_super BEFORE UPDATE OR DELETE ON app.platform_role_assignments FOR EACH ROW EXECUTE FUNCTION app.protect_last_super_admin();
CREATE TRIGGER protect_last_super_profile BEFORE UPDATE OF status ON app.user_profiles FOR EACH ROW EXECUTE FUNCTION app.protect_last_super_admin();
CREATE FUNCTION app.check_meter_reading() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE meter app.meters; inv app.invoices;
BEGIN
 IF TG_OP='UPDATE' AND OLD.invoice_item_id IS NOT NULL THEN RAISE EXCEPTION 'Billed readings are immutable; issue an explicit correction'; END IF;
 SELECT * INTO meter FROM app.meters WHERE tenant_id=NEW.tenant_id AND id=NEW.meter_id;
 IF NEW.period < date_trunc('month',meter.installed_on)::date OR (meter.retired_on IS NOT NULL AND NEW.period>date_trunc('month',meter.retired_on)::date) THEN RAISE EXCEPTION 'Reading outside meter service period'; END IF;
 IF NEW.invoice_item_id IS NOT NULL THEN
  SELECT i.* INTO inv FROM app.invoices i JOIN app.invoice_items it ON (it.tenant_id,it.invoice_id)=(i.tenant_id,i.id) WHERE it.tenant_id=NEW.tenant_id AND it.id=NEW.invoice_item_id;
  IF NOT FOUND OR inv.unit_id<>meter.unit_id OR inv.kind<>'water' OR inv.period<>NEW.period THEN RAISE EXCEPTION 'Water reading invoice scope mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_meter_reading BEFORE INSERT OR UPDATE ON app.meter_readings FOR EACH ROW EXECUTE FUNCTION app.check_meter_reading();
CREATE FUNCTION app.check_media_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.files f WHERE (f.tenant_id,f.id)=(NEW.tenant_id,NEW.file_id) AND f.purpose='news' AND f.scan_status='clean' AND f.deleted_at IS NULL) THEN RAISE EXCEPTION 'News media requires a clean news-purpose file'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_post_media BEFORE INSERT OR UPDATE ON app.post_media FOR EACH ROW EXECUTE FUNCTION app.check_media_file();
CREATE FUNCTION app.freeze_file_purpose() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.purpose<>OLD.purpose OR NEW.storage_key<>OLD.storage_key OR NEW.tenant_id<>OLD.tenant_id THEN RAISE EXCEPTION 'File ownership, purpose and key are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER freeze_file_purpose BEFORE UPDATE ON app.files FOR EACH ROW EXECUTE FUNCTION app.freeze_file_purpose();
ALTER TABLE app.verification_documents ADD CONSTRAINT rejection_reason_required CHECK (status<>'rejected' OR coalesce(length(btrim(rejection_reason)),0)>0);

-- Reversals are cash outflow on their own date; historical receipts remain visible.
CREATE OR REPLACE VIEW app.cash_statement WITH (security_invoker=true) AS
 SELECT tenant_id,id,cash_account_id,transaction_date,direction,amount,category,description,'manual'::text AS source FROM app.cash_entries WHERE voided_at IS NULL
 UNION ALL
 SELECT p.tenant_id,p.id,p.cash_account_id,(p.verified_at AT TIME ZONE t.timezone)::date,'income',p.amount,'billing','Verified resident payment','payment' FROM app.payments p JOIN app.tenants t ON t.id=p.tenant_id WHERE p.status='verified'
 UNION ALL
 SELECT r.tenant_id,r.id,p.cash_account_id,(r.reversed_at AT TIME ZONE t.timezone)::date,'expense',p.amount,'payment_reversal',r.reason,'reversal' FROM app.payment_reversals r JOIN app.payments p ON (p.tenant_id,p.id)=(r.tenant_id,r.payment_id) JOIN app.tenants t ON t.id=r.tenant_id;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO proomahan_app;
