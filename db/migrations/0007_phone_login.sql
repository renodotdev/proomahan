-- Login identity is distinct from a shared resident contact number.
CREATE TABLE app_private.phone_login_identifiers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app.user_profiles(user_id),
 phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 approved_by uuid NOT NULL REFERENCES app.user_profiles(user_id),
 approved_at timestamptz NOT NULL DEFAULT now(),
 disabled_at timestamptz,
 reason text NOT NULL CHECK (length(btrim(reason))>0)
);
CREATE UNIQUE INDEX phone_login_unique ON app_private.phone_login_identifiers(phone_e164) WHERE disabled_at IS NULL;
CREATE UNIQUE INDEX user_phone_login_unique ON app_private.phone_login_identifiers(user_id) WHERE disabled_at IS NULL;
CREATE TABLE app_private.login_rate_limits (
 bucket_key text NOT NULL,
 window_start timestamptz NOT NULL,
 attempts integer NOT NULL CHECK (attempts>0),
 PRIMARY KEY (bucket_key,window_start)
);
REVOKE ALL ON app_private.phone_login_identifiers,app_private.login_rate_limits FROM PUBLIC,proomahan_app;
