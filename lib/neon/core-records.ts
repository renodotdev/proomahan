import "server-only";
import { withActorTenant,DatabaseAccessError,validUuid } from "./tenant-context.ts";
import { coreInput,type CoreResource,realDate } from "./core-input.ts";
import { bulkInput } from "./bulk-input.ts";
import { deleteInput } from "./delete-input.ts";
import type { PoolClient } from "pg";

export async function listRecords(actorId:string,tenantId:string,resource:CoreResource,url:URL) {
 return withActorTenant(actorId,tenantId,async(db,roles)=>{
  const admin=roles.includes("super_admin")||roles.includes("neighborhood_admin");
  const q=(url.searchParams.get("q")||"").trim().slice(0,100);
  const page=Math.max(1,Math.min(100000,Number(url.searchParams.get("page"))||1));
  const status=url.searchParams.get("status")||"active";
  const cluster=url.searchParams.get("cluster")||"";
  if(cluster && !validUuid(cluster)) throw new DatabaseAccessError("Klaster tidak valid.",400);
  const params:unknown[]=[tenantId];
  const bind=(value:unknown)=>{params.push(value);return `$${params.length}`;};
  let select:string; const where=["r.tenant_id=$1"];
  if(resource==="clusters") { select="r.id,r.code,r.name,r.archived_at,r.row_version"; if(q) where.push(`(r.name ILIKE ${bind('%'+q+'%')} OR r.code ILIKE $${params.length})`); }
  else if(resource==="people") {
   select="r.id,r.full_name,r.phone,r.email,r.documents_url,r.archived_at,r.row_version,EXISTS(SELECT 1 FROM app.tenant_memberships m WHERE m.tenant_id=r.tenant_id AND m.person_id=r.id) AS has_account";
   if(!admin) where.push(`r.id=(SELECT person_id FROM app.tenant_memberships WHERE user_id=${bind(actorId)} AND tenant_id=$1 AND status='active')`);
   if(q) where.push(`(r.full_name ILIKE ${bind('%'+q+'%')} OR r.phone ILIKE $${params.length})`);
  } else {
   select=`r.id,r.number,r.cluster_id,r.address_detail,r.available_for_rent,r.archived_at,r.row_version,c.name AS cluster_name,
    (SELECT p.full_name FROM app.unit_ownerships o JOIN app.people p ON (p.tenant_id,p.id)=(o.tenant_id,o.person_id) WHERE o.tenant_id=r.tenant_id AND o.unit_id=r.id AND o.is_primary_contact AND o.start_date<=CURRENT_DATE AND (o.end_date IS NULL OR o.end_date>CURRENT_DATE) LIMIT 1) AS owner,
    (SELECT p.full_name FROM app.unit_occupancies o JOIN app.occupancy_members m ON (m.tenant_id,m.occupancy_id)=(o.tenant_id,o.id) JOIN app.people p ON (p.tenant_id,p.id)=(m.tenant_id,m.person_id) WHERE o.tenant_id=r.tenant_id AND o.unit_id=r.id AND o.start_date<=CURRENT_DATE AND (o.end_date IS NULL OR o.end_date>CURRENT_DATE) AND m.start_date<=CURRENT_DATE AND (m.end_date IS NULL OR m.end_date>CURRENT_DATE) ORDER BY m.is_primary_contact DESC LIMIT 1) AS occupant`;
   if(!admin) where.push(`(EXISTS(SELECT 1 FROM app.tenant_memberships tm JOIN app.unit_ownerships o ON (o.tenant_id,o.person_id)=(tm.tenant_id,tm.person_id) WHERE tm.tenant_id=r.tenant_id AND tm.user_id=${bind(actorId)} AND tm.status='active' AND o.unit_id=r.id AND o.start_date<=CURRENT_DATE AND (o.end_date IS NULL OR o.end_date>CURRENT_DATE)) OR EXISTS(SELECT 1 FROM app.tenant_memberships tm JOIN app.occupancy_members m ON (m.tenant_id,m.person_id)=(tm.tenant_id,tm.person_id) JOIN app.unit_occupancies o ON (o.tenant_id,o.id)=(m.tenant_id,m.occupancy_id) WHERE tm.tenant_id=r.tenant_id AND tm.user_id=$${params.length} AND tm.status='active' AND o.unit_id=r.id AND o.start_date<=CURRENT_DATE AND (o.end_date IS NULL OR o.end_date>CURRENT_DATE) AND m.start_date<=CURRENT_DATE AND (m.end_date IS NULL OR m.end_date>CURRENT_DATE)))`);
   if(q) where.push(`r.number ILIKE ${bind('%'+q+'%')}`);
   if(cluster) where.push(`r.cluster_id=${bind(cluster)}`);
  }
  if(status!=="all") where.push(`r.archived_at IS ${status==="archived"?"NOT ":""}NULL`);
  const from=`app.${resource} r${resource==="units"?" JOIN app.clusters c ON (c.tenant_id,c.id)=(r.tenant_id,r.cluster_id)":""} WHERE ${where.join(" AND ")}`;
  const total=Number((await db.query(`SELECT count(*) AS total FROM ${from}`,params)).rows[0].total);
  const actualPage=Math.min(Math.ceil(total/20)||1,Math.floor(page));
  const rows=await db.query(`SELECT ${select} FROM ${from} ORDER BY ${resource==="people"?"r.full_name":resource==="units"?"r.number":"r.name"},r.id LIMIT 20 OFFSET ${bind((actualPage-1)*20)}`,params);
  return {rows:rows.rows,total,page:actualPage,pageSize:20,canManage:admin};
 });
}
export async function deleteRecords(actorId:string,tenantId:string,resource:CoreResource,body:Record<string,unknown>) {
 let records:ReturnType<typeof deleteInput>;
 try { records=deleteInput(body.records); }
 catch(error) { throw new DatabaseAccessError((error as Error).message,400); }
 try {
  return await withActorTenant(actorId,tenantId,async db=>{
   const ids=records.map(record=>record.id);
   const locked=await db.query<{id:string;row_version:string}>(`SELECT id,row_version FROM app.${resource} WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,[tenantId,ids]);
   const versions=new Map(locked.rows.map(row=>[row.id,String(row.row_version)]));
   if(records.some(record=>versions.get(record.id)!==record.rowVersion)) {
    throw new DatabaseAccessError("Data sudah berubah atau tidak tersedia. Muat ulang halaman sebelum menghapus.",409);
   }
   for(const record of records) {
    await db.query(`DELETE FROM app.${resource} WHERE tenant_id=$1 AND id=$2`,[tenantId,record.id]);
    await audit(db,tenantId,actorId,`${resource}.deleted`,resource,record.id,{});
   }
   return {deleted:records.length};
  },["neighborhood_admin"]);
 } catch(error) {
  if((error as {code?:string})?.code==="23503") {
   throw new DatabaseAccessError("Data masih terhubung dengan akun, unit, tagihan, atau riwayat lain. Tidak ada data yang dihapus. Gunakan arsip untuk menyimpan riwayat.",409);
  }
  throw error;
 }
}

export async function saveRecord(actorId:string,tenantId:string,resource:CoreResource,body:Record<string,unknown>,id?:string) {
 let input:ReturnType<typeof coreInput>;
 try{input=coreInput(resource,body);}catch(error){throw new DatabaseAccessError(error instanceof Error?error.message:"Periksa isian formulir.",400);}
 if(id && (!validUuid(id)||!/^\d+$/.test(String(body.rowVersion))||String(body.rowVersion)==="0")) throw new DatabaseAccessError("Versi data tidak valid. Muat ulang halaman.",400);
 return withActorTenant(actorId,tenantId,db=>writeRecord(db,actorId,tenantId,resource,input,id,String(body.rowVersion)),["neighborhood_admin"]);
}

export async function saveBulkRecords(actorId:string,tenantId:string,resource:CoreResource,text:unknown) {
 return withActorTenant(actorId,tenantId,async db=>{
  let records:ReturnType<typeof bulkInput>;
  try { records=bulkInput(resource,text); }
  catch(error) { throw new DatabaseAccessError((error as Error).message,400); }
  if(resource==="people") {
   // Serialize resident imports so a retry cannot create copies of a committed batch.
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`bulk-people:${tenantId.toLowerCase()}`]);
  }
  for(const {line,body} of records) {
   try {
    if(resource==="units") {
     const cluster=await db.query<{id:string}>("SELECT id FROM app.clusters WHERE tenant_id=$1 AND lower(btrim(code))=lower($2) AND archived_at IS NULL FOR SHARE",[tenantId,body.clusterCode]);
     if(!cluster.rows.length) throw new DatabaseAccessError("Kode klaster aktif tidak ditemukan.",400);
     body.clusterId=cluster.rows[0].id;
    }
    let input:ReturnType<typeof coreInput>;
    try { input=coreInput(resource,body); }
    catch(error) { throw new DatabaseAccessError((error as Error).message,400); }
    if("fullName" in input) {
     const existing=await db.query("SELECT 1 FROM app.people WHERE tenant_id=$1 AND lower(btrim(full_name))=lower($2) AND phone=$3 LIMIT 1",[tenantId,input.fullName,input.phone]);
     if(existing.rows.length) throw new DatabaseAccessError("Warga dengan nama dan nomor telepon ini sudah ada.",409);
    }
    await writeRecord(db,actorId,tenantId,resource,input);
   } catch(error) {
    if(error instanceof DatabaseAccessError) throw new DatabaseAccessError(`Baris ${line}: ${error.message}`,error.status);
    const code=(error as {code?:string})?.code;
    if(code==="23505") throw new DatabaseAccessError(`Baris ${line}: kode, nama, atau nomor sudah digunakan.`,409);
    if(code==="23514" || code==="23503" || code==="22021") throw new DatabaseAccessError(`Baris ${line}: periksa isian dan klaster.`,400);
    throw error;
   }
  }
  return {created:records.length};
 },["neighborhood_admin"]);
}

async function writeRecord(db:PoolClient,actorId:string,tenantId:string,resource:CoreResource,input:ReturnType<typeof coreInput>,id?:string,rowVersion?:string) {
  const values:unknown[]=[tenantId]; const fields:Record<string,unknown>={};
  if("code" in input){fields.code=input.code;fields.name=input.name;}
  else if("fullName" in input){fields.full_name=input.fullName;fields.phone=input.phone;fields.email=input.email||null;fields.documents_url=input.documentsUrl||null;}
  else {
   const cluster=await db.query("SELECT c.id FROM app.clusters c WHERE c.tenant_id=$1 AND c.id=$2 AND (c.archived_at IS NULL OR EXISTS(SELECT 1 FROM app.units u WHERE u.tenant_id=$1 AND u.id=$3 AND u.cluster_id=c.id))",[tenantId,input.clusterId,id||null]);
   if(!cluster.rows.length) throw new DatabaseAccessError("Pilih klaster yang masih aktif.",400);
   fields.cluster_id=input.clusterId;fields.number=input.number;fields.address_detail=input.addressDetail||null;fields.available_for_rent=input.availableForRent;
  }
  fields.archived_at=input.archived?new Date():null;
  const columns=Object.keys(fields); values.push(...Object.values(fields));
  let result;
  if(id){values.push(id,rowVersion);result=await db.query(`UPDATE app.${resource} SET ${columns.map((key,i)=>`${key}=$${i+2}`).join(',')} WHERE tenant_id=$1 AND id=$${values.length-1} AND row_version=$${values.length} RETURNING id,row_version`,values);}
  else result=await db.query(`INSERT INTO app.${resource}(tenant_id,${columns.join(',')}) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id,row_version`,values);
  if(!result.rows.length) throw new DatabaseAccessError("Data sudah berubah. Muat ulang lalu coba lagi.",409);
  await audit(db,tenantId,actorId,`${resource}.${id?'updated':'created'}`,resource,result.rows[0].id,{fields:columns});
  return result.rows[0];
}
export async function changeOccupancy(actorId:string,tenantId:string,unitId:string,body:Record<string,unknown>) {
 if(!validUuid(unitId)) throw new DatabaseAccessError("Unit tidak valid.",400);
 let date:string;try{date=realDate(body.date);}catch{throw new DatabaseAccessError("Tanggal tidak valid.",400);}
 if(!["check_in","check_out","owner"].includes(String(body.action))) throw new DatabaseAccessError("Tindakan tidak valid.",400);
 if(body.action!=="check_out" && (typeof body.personId!=="string"||!validUuid(body.personId))) throw new DatabaseAccessError("Pilih warga yang valid.",400);
 return withActorTenant(actorId,tenantId,async(db)=>{
  const unit=await db.query("SELECT id FROM app.units WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE",[tenantId,unitId]);
  if(!unit.rows.length) throw new DatabaseAccessError("Unit aktif tidak ditemukan.",404);
  if(body.action!=="check_out") {
   const person=await db.query("SELECT id FROM app.people WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL",[tenantId,body.personId]);
   if(!person.rows.length) throw new DatabaseAccessError("Warga aktif tidak ditemukan.",400);
  }
  if(body.action==="owner") {
   await db.query("UPDATE app.unit_ownerships SET end_date=$3 WHERE tenant_id=$1 AND unit_id=$2 AND is_primary_contact AND end_date IS NULL",[tenantId,unitId,date]);
   await db.query("INSERT INTO app.unit_ownerships(tenant_id,unit_id,person_id,start_date) VALUES ($1,$2,$3,$4)",[tenantId,unitId,body.personId,date]);
  } else if(body.action==="check_in") {
   if(!["rented","owner_occupied","caretaker","other"].includes(String(body.occupancyType))) throw new DatabaseAccessError("Pilih jenis hunian.",400);
   const occupancy=await db.query("INSERT INTO app.unit_occupancies(tenant_id,unit_id,occupancy_type,start_date,recorded_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",[tenantId,unitId,body.occupancyType,date,actorId]);
   await db.query("INSERT INTO app.occupancy_members(tenant_id,occupancy_id,person_id,start_date,is_primary_contact) VALUES ($1,$2,$3,$4,true)",[tenantId,occupancy.rows[0].id,body.personId,date]);
  } else {
   const occupancy=await db.query("SELECT id FROM app.unit_occupancies WHERE tenant_id=$1 AND unit_id=$2 AND end_date IS NULL AND start_date<$3 FOR UPDATE",[tenantId,unitId,date]);
   if(!occupancy.rows.length) throw new DatabaseAccessError("Tidak ada hunian terbuka sebelum tanggal keluar tersebut.",400);
   const occupancyId=occupancy.rows[0].id;
   await db.query("UPDATE app.occupancy_members SET end_date=$3 WHERE tenant_id=$1 AND occupancy_id=$2 AND (end_date IS NULL OR end_date>$3)",[tenantId,occupancyId,date]);
   await db.query("UPDATE app.unit_occupancies SET end_date=$3 WHERE tenant_id=$1 AND id=$2",[tenantId,occupancyId,date]);
  }
  await audit(db,tenantId,actorId,`occupancy.${body.action}`,"unit",unitId,{date});
  return {success:true};
 },["neighborhood_admin"]);
}
async function audit(db:PoolClient,tenantId:string,actorId:string,action:string,entity:string,id:string,summary:object) {
 await db.query("INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,summary) VALUES ($1,$2,$3,$4,$5,$6)",[tenantId,actorId,action,entity,id,JSON.stringify(summary)]);
}
