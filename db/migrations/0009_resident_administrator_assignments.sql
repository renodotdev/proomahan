CREATE FUNCTION app.change_resident_administrator(
 target_person uuid, requested_role text, end_date date, assignment_id uuid, change_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
 actor uuid := app.actor_context();
 tenant uuid := app.tenant_context();
 member uuid;
 term app.role_assignments;
BEGIN
 PERFORM r.id FROM app.platform_role_assignments r
 JOIN app.user_profiles p ON p.user_id=r.user_id
 JOIN app.tenants t ON t.id=tenant
 WHERE r.user_id=actor AND r.starts_at<=now() AND r.revoked_at IS NULL
   AND p.status='active' AND NOT p.must_change_password AND t.status='active'
 FOR SHARE OF r,p,t;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Super Administrator required' USING ERRCODE='42501';
 END IF;

 SELECT m.id INTO member FROM app.tenant_memberships m
 JOIN app.people p ON (p.tenant_id,p.id)=(m.tenant_id,m.person_id)
 JOIN app.user_profiles u ON u.user_id=m.user_id
 WHERE m.tenant_id=tenant AND m.person_id=target_person
   AND (assignment_id IS NOT NULL OR (m.status='active' AND p.archived_at IS NULL AND u.status='active'))
 FOR SHARE OF m,p,u;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Resident account unavailable' USING ERRCODE='P0002';
 END IF;

 IF change_reason IS NULL OR length(btrim(change_reason)) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION 'Invalid assignment reason' USING ERRCODE='22023';
 END IF;

 IF assignment_id IS NULL THEN
  IF requested_role IS NULL OR requested_role NOT IN ('neighborhood_admin','billing_admin')
    OR end_date IS NULL OR end_date<=CURRENT_DATE THEN
   RAISE EXCEPTION 'Invalid assignment term' USING ERRCODE='22023';
  END IF;
  INSERT INTO app.role_assignments(tenant_id,membership_id,role,starts_at,ends_at,assigned_by,reason)
  VALUES (tenant,member,requested_role,now(),end_date::timestamptz,actor,btrim(change_reason))
  RETURNING * INTO term;
 ELSE
  UPDATE app.role_assignments
  SET revoked_at=greatest(now(),starts_at),revoked_by=actor
  WHERE tenant_id=tenant AND membership_id=member AND id=assignment_id
    AND role IN ('neighborhood_admin','billing_admin') AND revoked_at IS NULL AND ends_at>now()
  RETURNING * INTO term;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Assignment unavailable' USING ERRCODE='P0002';
  END IF;
 END IF;

 INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,summary)
 VALUES (tenant,actor,CASE WHEN assignment_id IS NULL THEN 'role.assigned' ELSE 'role.revoked' END,
   'role_assignment',term.id,jsonb_build_object('membership_id',member,'role',term.role,
   'starts_at',term.starts_at,'ends_at',term.ends_at,'revoked_at',term.revoked_at,'reason',btrim(change_reason)));
END $$;

REVOKE ALL ON FUNCTION app.change_resident_administrator(uuid,text,date,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.change_resident_administrator(uuid,text,date,uuid,text) TO proomahan_app;
