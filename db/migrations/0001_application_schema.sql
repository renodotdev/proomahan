-- Proomahan MVP application schema. Managed neon_auth tables are never altered.
CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
CREATE ROLE proomahan_app NOLOGIN NOBYPASSRLS;
GRANT USAGE ON SCHEMA app TO proomahan_app;
DO $$ BEGIN EXECUTE format('GRANT proomahan_app TO %I', current_user); END $$;
CREATE TABLE app.tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
 slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 locale text NOT NULL DEFAULT 'id-ID', timezone text NOT NULL DEFAULT 'Asia/Jakarta',
 currency text NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.user_profiles (
 user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE RESTRICT,
 display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
 must_change_password boolean NOT NULL DEFAULT true,
 provisioned_by uuid REFERENCES neon_auth."user"(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.platform_role_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app.user_profiles(user_id),
 role text NOT NULL DEFAULT 'super_admin' CHECK (role = 'super_admin'),
 starts_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 assigned_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 reason text NOT NULL CHECK (length(btrim(reason)) > 0),
 CHECK (revoked_at IS NULL OR revoked_at >= starts_at)
);
CREATE UNIQUE INDEX one_permanent_super_role ON app.platform_role_assignments(user_id) WHERE revoked_at IS NULL;

CREATE TABLE app.clusters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 20),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id)
);

CREATE UNIQUE INDEX clusters_code_unique ON app.clusters(tenant_id,lower(btrim(code)));
CREATE UNIQUE INDEX clusters_name_unique ON app.clusters(tenant_id,lower(btrim(name)));
CREATE TABLE app.units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 cluster_id uuid NOT NULL,
 number text NOT NULL CHECK (length(btrim(number)) BETWEEN 1 AND 50),
 address_detail text,
 available_for_rent boolean NOT NULL DEFAULT false,
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,cluster_id) REFERENCES app.clusters(tenant_id,id)
);

CREATE UNIQUE INDEX units_number_unique ON app.units(tenant_id,cluster_id,lower(btrim(number)));
CREATE TABLE app.people (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 200),
 phone text NOT NULL CHECK (phone ~ '^\+?[0-9]{8,15}$'),
 email text,
 documents_url text CHECK (documents_url IS NULL OR documents_url ~ '^https://[^[:space:]]+$'),
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id)
);

CREATE TABLE app.tenant_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 user_id uuid NOT NULL REFERENCES app.user_profiles(user_id),
 person_id uuid,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','ended')),
 joined_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,person_id) REFERENCES app.people(tenant_id,id),
 UNIQUE (tenant_id,user_id),
 UNIQUE (tenant_id,person_id)
);

CREATE TABLE app.role_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 membership_id uuid NOT NULL,
 role text NOT NULL CHECK (role IN ('neighborhood_admin','billing_admin','content_admin','service_admin')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 revoked_at timestamptz,
 assigned_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 revoked_by uuid REFERENCES app.user_profiles(user_id),
 reason text NOT NULL CHECK (length(btrim(reason)) > 0),
 renews_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,membership_id) REFERENCES app.tenant_memberships(tenant_id,id),
 FOREIGN KEY (tenant_id,renews_id) REFERENCES app.role_assignments(tenant_id,id),
 CHECK (ends_at > starts_at),
 CHECK (revoked_at IS NULL OR revoked_at >= starts_at),
 CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE TABLE app.unit_ownerships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 unit_id uuid NOT NULL,
 person_id uuid NOT NULL,
 start_date date NOT NULL,
 end_date date,
 is_primary_contact boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 FOREIGN KEY (tenant_id,person_id) REFERENCES app.people(tenant_id,id),
 CHECK (end_date IS NULL OR end_date > start_date)
);

CREATE TABLE app.unit_occupancies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 unit_id uuid NOT NULL,
 occupancy_type text NOT NULL CHECK (occupancy_type IN ('owner_occupied','rented','caretaker','other')),
 start_date date NOT NULL,
 end_date date,
 recorded_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 CHECK (end_date IS NULL OR end_date > start_date)
);

CREATE TABLE app.occupancy_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 occupancy_id uuid NOT NULL,
 person_id uuid NOT NULL,
 start_date date NOT NULL,
 end_date date,
 is_primary_contact boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,occupancy_id) REFERENCES app.unit_occupancies(tenant_id,id),
 FOREIGN KEY (tenant_id,person_id) REFERENCES app.people(tenant_id,id),
 CHECK (end_date IS NULL OR end_date > start_date)
);

CREATE TABLE app.files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 storage_key text NOT NULL UNIQUE,
 original_name text NOT NULL,
 mime_type text NOT NULL,
 byte_size bigint NOT NULL CHECK (byte_size > 0),
 checksum text,
 purpose text NOT NULL CHECK (purpose IN ('verification','payment_proof','news','letter','service','cash_proof')),
 uploaded_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','rejected')),
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id)
);

CREATE TABLE app.verification_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 person_id uuid NOT NULL,
 unit_id uuid,
 file_id uuid NOT NULL,
 document_type text NOT NULL CHECK (document_type IN ('id_card','family_card','occupancy_evidence','other')),
 status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
 reviewed_by uuid REFERENCES app.user_profiles(user_id),
 reviewed_at timestamptz,
 rejection_reason text,
 supersedes_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,person_id) REFERENCES app.people(tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 FOREIGN KEY (tenant_id,file_id) REFERENCES app.files(tenant_id,id),
 FOREIGN KEY (tenant_id,supersedes_id) REFERENCES app.verification_documents(tenant_id,id),
 CHECK (status <> 'rejected' OR length(btrim(rejection_reason)) > 0),
 CHECK ((status = 'submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (status <> 'submitted' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE TABLE app.fee_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 code text NOT NULL,
 name text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 UNIQUE (tenant_id,code)
);

CREATE TABLE app.fee_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 category_id uuid NOT NULL,
 code text NOT NULL,
 name text NOT NULL,
 description text,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,category_id) REFERENCES app.fee_categories(tenant_id,id),
 UNIQUE (tenant_id,code)
);

CREATE TABLE app.fee_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 fee_item_id uuid NOT NULL,
 scope text NOT NULL CHECK (scope IN ('tenant','cluster','unit')),
 cluster_id uuid,
 unit_id uuid,
 amount numeric(18,0) NOT NULL CHECK (amount >= 0),
 recurrence text NOT NULL CHECK (recurrence IN ('monthly','one_time')),
 effective_from date NOT NULL,
 effective_to date,
 due_day integer NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28),
 payer_rule text NOT NULL CHECK (payer_rule IN ('owner','occupant','explicit')),
 vacancy_rule text NOT NULL CHECK (vacancy_rule IN ('charge_owner','skip')),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,fee_item_id) REFERENCES app.fee_items(tenant_id,id),
 FOREIGN KEY (tenant_id,cluster_id) REFERENCES app.clusters(tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 CHECK ((scope='tenant' AND cluster_id IS NULL AND unit_id IS NULL) OR (scope='cluster' AND cluster_id IS NOT NULL AND unit_id IS NULL) OR (scope='unit' AND cluster_id IS NULL AND unit_id IS NOT NULL)),
 CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE app.unit_billing_responsibilities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 unit_id uuid NOT NULL,
 fee_item_id uuid NOT NULL,
 person_id uuid NOT NULL,
 start_date date NOT NULL,
 end_date date,
 approved_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 FOREIGN KEY (tenant_id,fee_item_id) REFERENCES app.fee_items(tenant_id,id),
 FOREIGN KEY (tenant_id,person_id) REFERENCES app.people(tenant_id,id),
 CHECK (end_date IS NULL OR end_date > start_date)
);

CREATE TABLE app.billing_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 period date NOT NULL CHECK (extract(day FROM period)=1),
 kind text NOT NULL CHECK (kind IN ('dues','water')),
 scope text NOT NULL CHECK (scope IN ('all_eligible','selected','individual')),
 selected_unit_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
 idempotency_key uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 UNIQUE (tenant_id,idempotency_key)
);

CREATE TABLE app.invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 unit_id uuid NOT NULL,
 bill_to_person_id uuid NOT NULL,
 billing_run_id uuid,
 invoice_number text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('dues','water')),
 period date NOT NULL CHECK (extract(day FROM period)=1),
 issue_date date NOT NULL,
 due_date date NOT NULL,
 currency text NOT NULL DEFAULT 'IDR' CHECK (currency='IDR'),
 bill_to_name_snapshot text NOT NULL,
 unit_label_snapshot text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','void')),
 total_amount numeric(18,0) NOT NULL CHECK (total_amount > 0),
 issued_at timestamptz,
 void_reason text,
 replaces_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 FOREIGN KEY (tenant_id,bill_to_person_id) REFERENCES app.people(tenant_id,id),
 FOREIGN KEY (tenant_id,billing_run_id) REFERENCES app.billing_runs(tenant_id,id),
 FOREIGN KEY (tenant_id,replaces_id) REFERENCES app.invoices(tenant_id,id),
 UNIQUE (tenant_id,invoice_number),
 CHECK (status='draft' OR issued_at IS NOT NULL),
 CHECK (status<>'void' OR coalesce(length(btrim(void_reason)),0)>0),
 CHECK (due_date >= issue_date)
);

CREATE UNIQUE INDEX one_invoice_per_period ON app.invoices(tenant_id,unit_id,bill_to_person_id,kind,period) WHERE status <> 'void';
CREATE TABLE app.invoice_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 invoice_id uuid NOT NULL,
 fee_item_id uuid,
 fee_schedule_id uuid,
 name_snapshot text NOT NULL,
 category_snapshot text NOT NULL,
 quantity numeric(18,4) NOT NULL DEFAULT 1 CHECK (quantity>0),
 unit_rate numeric(18,4) NOT NULL CHECK (unit_rate>=0),
 line_amount numeric(18,0) GENERATED ALWAYS AS (round(quantity*unit_rate,0)) STORED,
 charge_key text NOT NULL,
 calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,invoice_id) REFERENCES app.invoices(tenant_id,id),
 FOREIGN KEY (tenant_id,fee_item_id) REFERENCES app.fee_items(tenant_id,id),
 FOREIGN KEY (tenant_id,fee_schedule_id) REFERENCES app.fee_schedules(tenant_id,id),
 UNIQUE (tenant_id,charge_key),
 UNIQUE (tenant_id,invoice_id,id)
);

CREATE TABLE app.invoice_participants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 invoice_id uuid NOT NULL,
 person_id uuid NOT NULL,
 permission text NOT NULL CHECK (permission IN ('view','submit_payment')),
 granted_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,invoice_id) REFERENCES app.invoices(tenant_id,id),
 FOREIGN KEY (tenant_id,person_id) REFERENCES app.people(tenant_id,id),
 UNIQUE (tenant_id,invoice_id,person_id,permission)
);

CREATE TABLE app.meters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 unit_id uuid NOT NULL,
 serial_number text NOT NULL,
 installed_on date NOT NULL,
 retired_on date,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 CHECK (retired_on IS NULL OR retired_on>=installed_on),
 UNIQUE (tenant_id,serial_number)
);

CREATE UNIQUE INDEX one_current_meter ON app.meters(tenant_id,unit_id) WHERE retired_on IS NULL;
CREATE TABLE app.water_tariffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 name text NOT NULL,
 rate_per_m3 numeric(18,4) NOT NULL CHECK (rate_per_m3>=0),
 fixed_charge numeric(18,0) NOT NULL DEFAULT 0 CHECK (fixed_charge>=0),
 effective_from date NOT NULL,
 effective_to date,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 CHECK (effective_to IS NULL OR effective_to>effective_from)
);

CREATE TABLE app.meter_readings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 meter_id uuid NOT NULL,
 period date NOT NULL CHECK (extract(day FROM period)=1),
 previous_value numeric(18,3) NOT NULL CHECK (previous_value>=0),
 current_value numeric(18,3) NOT NULL CHECK (current_value>=previous_value),
 consumption numeric(18,3) GENERATED ALWAYS AS (current_value-previous_value) STORED,
 tariff_id uuid NOT NULL,
 invoice_item_id uuid,
 recorded_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,meter_id) REFERENCES app.meters(tenant_id,id),
 FOREIGN KEY (tenant_id,tariff_id) REFERENCES app.water_tariffs(tenant_id,id),
 FOREIGN KEY (tenant_id,invoice_item_id) REFERENCES app.invoice_items(tenant_id,id),
 UNIQUE (tenant_id,meter_id,period),
 UNIQUE (tenant_id,invoice_item_id)
);

CREATE TABLE app.cash_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 name text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('cash','bank')),
 opening_balance numeric(18,0) NOT NULL DEFAULT 0,
 opening_date date NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id)
);

CREATE TABLE app.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 unit_id uuid NOT NULL,
 bill_to_person_id uuid NOT NULL,
 cash_account_id uuid,
 submitted_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 origin text NOT NULL CHECK (origin IN ('resident','admin')),
 method text NOT NULL CHECK (method IN ('bank_transfer','cash')),
 amount numeric(18,0) NOT NULL CHECK (amount>0),
 currency text NOT NULL DEFAULT 'IDR' CHECK (currency='IDR'),
 claimed_paid_at date NOT NULL,
 bank_reference text,
 cash_collector text,
 proof_file_id uuid,
 status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','verified','rejected')),
 verified_by uuid REFERENCES app.user_profiles(user_id),
 verified_at timestamptz,
 rejection_reason text,
 client_submission_key uuid NOT NULL,
 supersedes_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 FOREIGN KEY (tenant_id,bill_to_person_id) REFERENCES app.people(tenant_id,id),
 FOREIGN KEY (tenant_id,cash_account_id) REFERENCES app.cash_accounts(tenant_id,id),
 FOREIGN KEY (tenant_id,proof_file_id) REFERENCES app.files(tenant_id,id),
 FOREIGN KEY (tenant_id,supersedes_id) REFERENCES app.payments(tenant_id,id),
 UNIQUE (tenant_id,submitted_by,client_submission_key),
 CHECK (status<>'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND cash_account_id IS NOT NULL)),
 CHECK (status<>'rejected' OR coalesce(length(btrim(rejection_reason)),0)>0)
);

CREATE TABLE app.payment_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 payment_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 invoice_item_id uuid NOT NULL,
 stage text NOT NULL CHECK (stage IN ('requested','verified')),
 amount numeric(18,0) NOT NULL CHECK (amount>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,payment_id) REFERENCES app.payments(tenant_id,id),
 FOREIGN KEY (tenant_id,invoice_id) REFERENCES app.invoices(tenant_id,id),
 FOREIGN KEY (tenant_id,invoice_id,invoice_item_id) REFERENCES app.invoice_items(tenant_id,invoice_id,id),
 UNIQUE (tenant_id,payment_id,invoice_item_id,stage)
);

CREATE TABLE app.payment_reversals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 payment_id uuid NOT NULL,
 reason text NOT NULL CHECK (length(btrim(reason))>0),
 reversed_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 reversed_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,payment_id) REFERENCES app.payments(tenant_id,id),
 UNIQUE (tenant_id,payment_id)
);

CREATE TABLE app.cash_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 cash_account_id uuid NOT NULL,
 direction text NOT NULL CHECK (direction IN ('income','expense')),
 transaction_date date NOT NULL,
 amount numeric(18,0) NOT NULL CHECK (amount>0),
 category text NOT NULL,
 description text NOT NULL,
 counterparty text,
 reference text,
 proof_file_id uuid,
 recorded_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 voided_at timestamptz,
 void_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,cash_account_id) REFERENCES app.cash_accounts(tenant_id,id),
 FOREIGN KEY (tenant_id,proof_file_id) REFERENCES app.files(tenant_id,id),
 CHECK (voided_at IS NULL OR coalesce(length(btrim(void_reason)),0)>0)
);

CREATE TABLE app.reminder_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 name text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('invoice','water','expense','cash_report','other')),
 body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
 allowed_variables text[] NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 UNIQUE (tenant_id,kind,version)
);

CREATE TABLE app.communication_preferences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 person_id uuid NOT NULL,
 whatsapp_reminders boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,person_id) REFERENCES app.people(tenant_id,id),
 UNIQUE (tenant_id,person_id)
);

CREATE TABLE app.reminder_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 template_id uuid NOT NULL,
 invoice_id uuid,
 recipient_person_id uuid NOT NULL,
 destination_snapshot text NOT NULL,
 body_snapshot text NOT NULL,
 status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','opened','cancelled')),
 prepared_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,template_id) REFERENCES app.reminder_templates(tenant_id,id),
 FOREIGN KEY (tenant_id,invoice_id) REFERENCES app.invoices(tenant_id,id),
 FOREIGN KEY (tenant_id,recipient_person_id) REFERENCES app.people(tenant_id,id)
);

CREATE TABLE app.posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 title text NOT NULL,
 slug text NOT NULL,
 body text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('news','event','announcement')),
 audience text NOT NULL CHECK (audience IN ('public','residents','cluster')),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
 author_id uuid NOT NULL REFERENCES app.user_profiles(user_id),
 published_at timestamptz,
 event_starts_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 UNIQUE (tenant_id,slug),
 CHECK (status<>'published' OR published_at IS NOT NULL)
);

CREATE TABLE app.post_audience_clusters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 post_id uuid NOT NULL,
 cluster_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,post_id) REFERENCES app.posts(tenant_id,id),
 FOREIGN KEY (tenant_id,cluster_id) REFERENCES app.clusters(tenant_id,id),
 UNIQUE (tenant_id,post_id,cluster_id)
);

CREATE TABLE app.post_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 post_id uuid NOT NULL,
 file_id uuid NOT NULL,
 caption text,
 sort_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,post_id) REFERENCES app.posts(tenant_id,id),
 FOREIGN KEY (tenant_id,file_id) REFERENCES app.files(tenant_id,id),
 UNIQUE (tenant_id,post_id,file_id)
);

CREATE TABLE app.post_reactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 post_id uuid NOT NULL,
 person_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,post_id) REFERENCES app.posts(tenant_id,id),
 FOREIGN KEY (tenant_id,person_id) REFERENCES app.people(tenant_id,id),
 UNIQUE (tenant_id,post_id,person_id)
);

CREATE TABLE app.contact_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 category text NOT NULL,
 display_name text NOT NULL,
 phone text NOT NULL,
 whatsapp text,
 service_hours text,
 visibility text NOT NULL CHECK (visibility IN ('public','residents')),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id)
);

CREATE TABLE app.service_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 requester_person_id uuid NOT NULL,
 unit_id uuid,
 category text NOT NULL CHECK (category IN ('report','event','other')),
 subject text NOT NULL,
 description text NOT NULL,
 location_text text,
 priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
 status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','in_progress','resolved','closed')),
 assigned_membership_id uuid,
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,requester_person_id) REFERENCES app.people(tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 FOREIGN KEY (tenant_id,assigned_membership_id) REFERENCES app.tenant_memberships(tenant_id,id)
);

CREATE TABLE app.service_request_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 service_request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES app.user_profiles(user_id),
 message text NOT NULL,
 visibility text NOT NULL CHECK (visibility IN ('requester','internal')),
 status_change text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,service_request_id) REFERENCES app.service_requests(tenant_id,id)
);

CREATE TABLE app.service_request_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 service_request_id uuid NOT NULL,
 file_id uuid NOT NULL,
 visibility text NOT NULL CHECK (visibility IN ('requester','internal')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,service_request_id) REFERENCES app.service_requests(tenant_id,id),
 FOREIGN KEY (tenant_id,file_id) REFERENCES app.files(tenant_id,id),
 UNIQUE (tenant_id,service_request_id,file_id)
);

CREATE TABLE app.letter_types (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 code text NOT NULL,
 name text NOT NULL,
 required_fields_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
 required_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 signatory_label text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 UNIQUE (tenant_id,code,version)
);

CREATE TABLE app.letter_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 type_id uuid NOT NULL,
 type_version integer NOT NULL CHECK (type_version>0),
 applicant_person_id uuid NOT NULL,
 unit_id uuid,
 form_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','in_review','needs_revision','approved','rejected','issued')),
 assigned_membership_id uuid,
 approved_by uuid REFERENCES app.user_profiles(user_id),
 reference_number text,
 issued_file_id uuid,
 issued_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,type_id) REFERENCES app.letter_types(tenant_id,id),
 FOREIGN KEY (tenant_id,applicant_person_id) REFERENCES app.people(tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 FOREIGN KEY (tenant_id,assigned_membership_id) REFERENCES app.tenant_memberships(tenant_id,id),
 FOREIGN KEY (tenant_id,issued_file_id) REFERENCES app.files(tenant_id,id),
 UNIQUE (tenant_id,reference_number),
 CHECK (status<>'issued' OR (reference_number IS NOT NULL AND issued_file_id IS NOT NULL AND issued_at IS NOT NULL AND approved_by IS NOT NULL))
);

CREATE TABLE app.letter_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 letter_request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES app.user_profiles(user_id),
 event_type text NOT NULL,
 message text,
 visibility text NOT NULL CHECK (visibility IN ('applicant','internal')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,letter_request_id) REFERENCES app.letter_requests(tenant_id,id)
);

CREATE TABLE app.letter_request_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 letter_request_id uuid NOT NULL,
 file_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,letter_request_id) REFERENCES app.letter_requests(tenant_id,id),
 FOREIGN KEY (tenant_id,file_id) REFERENCES app.files(tenant_id,id),
 UNIQUE (tenant_id,letter_request_id,file_id)
);

CREATE TABLE app.guest_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 host_person_id uuid NOT NULL,
 unit_id uuid NOT NULL,
 guest_name text NOT NULL,
 expected_from timestamptz NOT NULL,
 expected_until timestamptz NOT NULL,
 vehicle_plate text,
 note text,
 status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','acknowledged','cancelled')),
 acknowledged_by uuid REFERENCES app.user_profiles(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 FOREIGN KEY (tenant_id,host_person_id) REFERENCES app.people(tenant_id,id),
 FOREIGN KEY (tenant_id,unit_id) REFERENCES app.units(tenant_id,id),
 CHECK (expected_until>expected_from)
);

CREATE TABLE app.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 actor_user_id uuid REFERENCES app.user_profiles(user_id),
 action text NOT NULL,
 entity_type text NOT NULL,
 entity_id uuid,
 summary jsonb NOT NULL DEFAULT '{}'::jsonb,
 request_id uuid NOT NULL DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id)
);


CREATE INDEX people_name_search ON app.people(tenant_id,lower(full_name));
CREATE INDEX invoices_period_status ON app.invoices(tenant_id,period,status,due_date);
CREATE INDEX payments_review_queue ON app.payments(tenant_id,status,created_at);
CREATE INDEX requests_status ON app.service_requests(tenant_id,status,created_at);
CREATE INDEX roles_current ON app.role_assignments(tenant_id,membership_id,starts_at,ends_at) WHERE revoked_at IS NULL;
CREATE INDEX posts_feed ON app.posts(tenant_id,status,audience,published_at DESC);
