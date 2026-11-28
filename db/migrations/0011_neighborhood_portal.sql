ALTER TABLE app.people ALTER COLUMN phone DROP NOT NULL;

CREATE TABLE app.public_page_content (
 tenant_id uuid PRIMARY KEY REFERENCES app.tenants(id),
 draft jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(draft) = 'object'),
 published jsonb CHECK (jsonb_typeof(published) = 'object'),
 published_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((published IS NULL) = (published_at IS NULL))
);
ALTER TABLE app.public_page_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON app.public_page_content
 USING (tenant_id = app.tenant_context()) WITH CHECK (tenant_id = app.tenant_context());
REVOKE ALL ON app.public_page_content FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON app.public_page_content TO proomahan_app;

ALTER TABLE app.invoice_participants
 ADD COLUMN notification_created_at timestamptz,
 ADD COLUMN notification_read_at timestamptz,
 ADD CONSTRAINT invoice_participant_notification_dates CHECK (
  notification_read_at IS NULL OR (
   notification_created_at IS NOT NULL AND notification_read_at >= notification_created_at
  )
 );
CREATE UNIQUE INDEX invoice_participant_one_notification
 ON app.invoice_participants (tenant_id, person_id, invoice_id)
 WHERE notification_created_at IS NOT NULL;

CREATE TABLE app_private.admin_login_identifiers (
 identifier text PRIMARY KEY CHECK (identifier = 'super-admin-dpark'),
 user_id uuid NOT NULL REFERENCES app.user_profiles(user_id)
);
REVOKE ALL ON app_private.admin_login_identifiers FROM PUBLIC, proomahan_app;

-- Bind only when there is exactly one active administrator. Keep the phone mapping for cutover.
INSERT INTO app_private.admin_login_identifiers (identifier, user_id)
SELECT 'super-admin-dpark', eligible.user_id
FROM (
 SELECT p.user_id, count(*) OVER () AS administrator_count
 FROM app.user_profiles p
 JOIN app.platform_role_assignments r ON r.user_id = p.user_id
 WHERE p.status = 'active' AND r.starts_at <= now() AND r.revoked_at IS NULL
) AS eligible
WHERE eligible.administrator_count = 1;
