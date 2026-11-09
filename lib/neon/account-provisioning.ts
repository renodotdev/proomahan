import "server-only";
import { randomUUID } from "node:crypto";
import { getAuth,getVerifiedSession } from "./auth-server.ts";
import { getDatabase } from "./database.ts";
import { DatabaseAccessError,validUuid,withActorTenant } from "./tenant-context.ts";
import { normalizePhone } from "../phone.ts";

export async function provisionResidentAccount(body:Record<string,unknown>){
 const {data:session}=await getVerifiedSession();
 if(!session?.user)throw new DatabaseAccessError("Silakan masuk terlebih dahulu.",401);
 if(typeof body.tenantId!=="string"||!validUuid(body.tenantId)||typeof body.personId!=="string"||!validUuid(body.personId)||typeof body.password!=="string"||body.password.length<12||body.password.length>128)throw new DatabaseAccessError("Pilih warga dan gunakan kata sandi sementara sepanjang 12–128 karakter.",400);
 let phone:string;try{phone=normalizePhone(String(body.phone||""));}catch{throw new DatabaseAccessError("Nomor login tidak valid.",400);}
 await withActorTenant(session.user.id,body.tenantId,async()=>true,["super_admin"]);
 const db=await getDatabase().connect();let createdId:string|undefined;
 try{
  await db.query("BEGIN");
  const authority=await db.query(`SELECT r.id FROM app.platform_role_assignments r JOIN app.user_profiles p ON p.user_id=r.user_id WHERE r.user_id=$1 AND r.revoked_at IS NULL AND r.starts_at<=now() AND p.status='active' AND NOT p.must_change_password FOR UPDATE OF p,r`,[session.user.id]);
  if(!authority.rows.length)throw new DatabaseAccessError("Hanya Super Administrator yang dapat membuat akun.");
  const person=await db.query<{full_name:string}>("SELECT full_name FROM app.people WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE",[body.tenantId,body.personId]);
  if(!person.rows.length)throw new DatabaseAccessError("Warga aktif tidak ditemukan.",400);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[phone]);
  const duplicate=await db.query("SELECT id FROM app_private.phone_login_identifiers WHERE phone_e164=$1 AND disabled_at IS NULL UNION ALL SELECT id FROM app.tenant_memberships WHERE tenant_id=$2 AND person_id=$3",[phone,body.tenantId,body.personId]);
  if(duplicate.rows.length)throw new DatabaseAccessError("Nomor login atau warga ini sudah memiliki akun.",409);
  const {data,error}=await getAuth().admin.createUser({email:`${randomUUID()}@accounts.proomahan.invalid`,name:person.rows[0].full_name,password:body.password,role:"user"});
  if(error||!data?.user)throw new DatabaseAccessError("Layanan pembuatan akun belum tersedia. Pastikan akun Super Administrator telah disiapkan.",503);
  createdId=data.user.id;
  await db.query("INSERT INTO app.user_profiles(user_id,display_name,provisioned_by,must_change_password) VALUES ($1,$2,$3,true)",[createdId,person.rows[0].full_name,session.user.id]);
  await db.query("INSERT INTO app.tenant_memberships(tenant_id,user_id,person_id) VALUES ($1,$2,$3)",[body.tenantId,createdId,body.personId]);
  await db.query("INSERT INTO app_private.phone_login_identifiers(user_id,phone_e164,approved_by,reason) VALUES ($1,$2,$3,'Administrator account provisioning')",[createdId,phone,session.user.id]);
  await db.query("INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,'account.provisioned','user',$3)",[body.tenantId,session.user.id,createdId]);
  await db.query("COMMIT");return {success:true};
 }catch(error){
  await db.query("ROLLBACK");
  if(createdId){const result=await getAuth().admin.removeUser({userId:createdId});if(result.error)throw new DatabaseAccessError("Pembuatan akun belum selesai. Hubungi operator untuk meninjau identitas yang belum terhubung.",503);}
  throw error;
 }finally{db.release();}
}
