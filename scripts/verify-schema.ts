import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { withActorTenant } from "../lib/neon/tenant-context.ts";
import { getDatabase } from "../lib/neon/database.ts";
nextEnv.loadEnvConfig(process.cwd());
const branch = process.argv[2];
if (!branch?.startsWith("schema-validation-")) throw new Error("Use a disposable schema-validation-* branch; production is forbidden");
const cli = (args:string[]) => execFileSync("neon",args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
const connection = cli(["connection-string",branch,"--ssl","verify-full"]);
process.env.DATABASE_URL=connection;
const authOutput = cli(["neon-auth","user","create","--branch",branch,"--email",`schema-test-${randomUUID()}@example.test`,"--name","Schema verification","-o","json"]);
const actor = authOutput.match(/ID:\s*([0-9a-f-]{36})/i)?.[1] || "";
if (!actor) throw new Error("Test auth identity was not returned");
const client = new Client({connectionString:connection,connectionTimeoutMillis:15000});
let checks=0;
async function rejects(sql:string,args:unknown[]=[],pattern?:RegExp) {
 await client.query("SAVEPOINT invalid_case");
 try { if (pattern) await assert.rejects(client.query(sql,args), pattern); else await assert.rejects(client.query(sql,args)); checks++; }
 finally { await client.query("ROLLBACK TO SAVEPOINT invalid_case"); }
}
async function id(sql:string,args:unknown[]=[]) { return (await client.query(sql+" RETURNING id",args)).rows[0].id as string; }
try {
 await client.connect();
 // Only test identities and synthetic records on the disposable branch.
 await client.query("INSERT INTO app.user_profiles(user_id,display_name,must_change_password) VALUES ($1,'Schema verification',false)",[actor]);
 const tenant=await id("INSERT INTO app.tenants(name,slug) VALUES ('Schema A',$1)",[`schema-a-${randomUUID()}`]);
 const other=await id("INSERT INTO app.tenants(name,slug) VALUES ('Schema B',$1)",[`schema-b-${randomUUID()}`]);
 const member=await id("INSERT INTO app.tenant_memberships(tenant_id,user_id) VALUES ($1,$2)",[tenant,actor]);
 await client.query("INSERT INTO app.role_assignments(tenant_id,membership_id,role,starts_at,ends_at,assigned_by,reason) VALUES ($1,$2,'billing_admin',now()-interval '1 day',now()+interval '1 day',$3,'Test term')",[tenant,member,actor]);
 await withActorTenant(actor,tenant,async (db,roles)=>{
  assert.equal((await db.query("SELECT current_user")).rows[0].current_user,"proomahan_app");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM app.tenants")).rows[0].n,1);
  assert.ok(roles.includes("billing_admin"));
 },["billing_admin"]); checks++;
 await assert.rejects(withActorTenant(actor,other,async()=>true),/membership/); checks++;
 await assert.rejects(withActorTenant(actor,tenant,async()=>true,["content_admin"]),/role/); checks++;
 const pooled=await getDatabase().query("SELECT current_user, current_setting('app.tenant_id',true) AS tenant");
 assert.notEqual(pooled.rows[0].current_user,"proomahan_app"); assert.ok(!pooled.rows[0].tenant); checks++;
 await client.query("UPDATE app.role_assignments SET starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' WHERE tenant_id=$1 AND membership_id=$2",[tenant,member]);
 await assert.rejects(withActorTenant(actor,tenant,async()=>true,["billing_admin"]),/role/); checks++;
 await withActorTenant(actor,tenant,async(_db,roles)=>{assert.deepEqual(roles,[]);}); checks++;
 await client.query("UPDATE app.role_assignments SET ends_at=now()+interval '1 day' WHERE tenant_id=$1 AND membership_id=$2",[tenant,member]);
 await client.query("UPDATE app.tenant_memberships SET status='suspended' WHERE id=$1",[member]);
 await assert.rejects(withActorTenant(actor,tenant,async()=>true),/membership/); checks++;
 await client.query("UPDATE app.tenant_memberships SET status='active' WHERE id=$1",[member]);
 await client.query("UPDATE app.user_profiles SET must_change_password=true WHERE user_id=$1",[actor]);
 await assert.rejects(withActorTenant(actor,tenant,async()=>true),/password change/); checks++;
 await client.query("UPDATE app.user_profiles SET must_change_password=false WHERE user_id=$1",[actor]);
 await client.query("BEGIN");
 const cluster=await id("INSERT INTO app.clusters(tenant_id,code,name) VALUES ($1,'A','Cluster A')",[tenant]);
 await client.query("UPDATE app.clusters SET name='Cluster A updated' WHERE id=$1",[cluster]);
 assert.equal(Number((await client.query("SELECT row_version FROM app.clusters WHERE id=$1",[cluster])).rows[0].row_version),2); checks++;
 const unit=await id("INSERT INTO app.units(tenant_id,cluster_id,number) VALUES ($1,$2,'A-01')",[tenant,cluster]);
 const person=await id("INSERT INTO app.people(tenant_id,full_name,phone) VALUES ($1,'Resident test','+6281200000000')",[tenant]);
 await rejects("INSERT INTO app.units(tenant_id,cluster_id,number) VALUES ($1,$2,'B-01')",[other,cluster],/foreign key/);
 await rejects("INSERT INTO app.clusters(tenant_id,code,name) VALUES ($1,' a ','Other')",[tenant],/duplicate key/);
 const occupancy=await id("INSERT INTO app.unit_occupancies(tenant_id,unit_id,occupancy_type,start_date,recorded_by) VALUES ($1,$2,'rented','2026-01-01',$3)",[tenant,unit,actor]);
 await rejects("INSERT INTO app.unit_occupancies(tenant_id,unit_id,occupancy_type,start_date,recorded_by) VALUES ($1,$2,'rented','2026-02-01',$3)",[tenant,unit,actor],/Overlapping/);
 await rejects("INSERT INTO app.occupancy_members(tenant_id,occupancy_id,person_id,start_date) VALUES ($1,$2,$3,'2025-01-01')",[tenant,occupancy,person],/outside occupancy/);
 await rejects("INSERT INTO app.role_assignments(tenant_id,membership_id,role,starts_at,ends_at,assigned_by,reason) VALUES ($1,$2,'billing_admin',now(),now()+interval '2 days',$3,'Overlap')",[tenant,member,actor],/Overlapping/);
 const account=await id("INSERT INTO app.cash_accounts(tenant_id,name,kind,opening_date) VALUES ($1,'Test cash','cash','2026-01-01')",[tenant]);
 const invoice=await id("INSERT INTO app.invoices(tenant_id,unit_id,bill_to_person_id,invoice_number,kind,period,issue_date,due_date,bill_to_name_snapshot,unit_label_snapshot,total_amount) VALUES ($1,$2,$3,'TEST-001','dues','2026-11-01','2026-11-01','2026-11-10','Resident test','A-01',100000)",[tenant,unit,person]);
 const item=await id("INSERT INTO app.invoice_items(tenant_id,invoice_id,name_snapshot,category_snapshot,quantity,unit_rate,charge_key) VALUES ($1,$2,'Dynamic fee','Dues',1,100000,'test-charge')",[tenant,invoice]);
 await rejects("UPDATE app.invoices SET total_amount=99999,status='issued',issued_at=now() WHERE id=$1",[invoice],/item sum/);
 await client.query("UPDATE app.invoices SET status='issued',issued_at=now() WHERE id=$1",[invoice]);
 await rejects("UPDATE app.invoice_items SET unit_rate=1 WHERE id=$1",[item],/draft/);
 await rejects("UPDATE app.invoices SET total_amount=1 WHERE id=$1",[invoice],/immutable/);
 async function payment(amount:number) {
  return id("INSERT INTO app.payments(tenant_id,unit_id,bill_to_person_id,cash_account_id,submitted_by,origin,method,amount,claimed_paid_at,client_submission_key) VALUES ($1,$2,$3,$4,$5,'admin','cash',$6,'2026-11-08',$7)",[tenant,unit,person,account,actor,amount,randomUUID()]);
 }
 await rejects("INSERT INTO app.payments(tenant_id,unit_id,bill_to_person_id,submitted_by,origin,method,amount,claimed_paid_at,client_submission_key) VALUES ($1,$2,$3,$4,'admin','cash','NaN','2026-11-08',$5)",[tenant,unit,person,actor,randomUUID()],/finite/);
 const paymentId=await payment(60000);
 await client.query("INSERT INTO app.payment_allocations(tenant_id,payment_id,invoice_id,invoice_item_id,stage,amount) VALUES ($1,$2,$3,$4,'verified',60000)",[tenant,paymentId,invoice,item]);
 await client.query("UPDATE app.payments SET status='verified',verified_by=$2,verified_at=now() WHERE id=$1",[paymentId,actor]);
 assert.equal(Number((await client.query("SELECT paid_amount FROM app.invoice_balances WHERE invoice_id=$1",[invoice])).rows[0].paid_amount),60000); checks++;
 const overpay=await payment(50000);
 await client.query("INSERT INTO app.payment_allocations(tenant_id,payment_id,invoice_id,invoice_item_id,stage,amount) VALUES ($1,$2,$3,$4,'verified',50000)",[tenant,overpay,invoice,item]);
 await rejects("UPDATE app.payments SET status='verified',verified_by=$2,verified_at=now() WHERE id=$1",[overpay,actor],/outstanding/);
 await rejects("UPDATE app.payment_allocations SET amount=1 WHERE payment_id=$1",[paymentId],/immutable/);
 await rejects("UPDATE app.invoices SET status='void',void_reason='Test' WHERE id=$1",[invoice],/Reverse verified/);
 await client.query("INSERT INTO app.payment_reversals(tenant_id,payment_id,reason,reversed_by) VALUES ($1,$2,'Test reversal',$3)",[tenant,paymentId,actor]);
 assert.equal(Number((await client.query("SELECT paid_amount FROM app.invoice_balances WHERE invoice_id=$1",[invoice])).rows[0].paid_amount),0); checks++;
 const cash=await client.query("SELECT direction,sum(amount)::text AS total FROM app.cash_statement WHERE tenant_id=$1 GROUP BY direction",[tenant]);
 assert.deepEqual(Object.fromEntries(cash.rows.map(row=>[row.direction,Number(row.total)])),{income:60000,expense:60000}); checks++;
 await rejects("UPDATE app.payment_reversals SET reason='Changed' WHERE payment_id=$1",[paymentId],/append-only/);
 await client.query("INSERT INTO app.platform_role_assignments(user_id,assigned_by,reason) VALUES ($1,$1,'Temporary fixture')",[actor]);
 // Isolate the last-admin invariant inside the rollback-only fixture transaction.
 await client.query("UPDATE app.platform_role_assignments SET revoked_at=now() WHERE user_id<>$1 AND revoked_at IS NULL AND starts_at<=now()",[actor]);
 await rejects("UPDATE app.platform_role_assignments SET revoked_at=now() WHERE user_id=$1",[actor],/last active/);
 await rejects("UPDATE app.user_profiles SET status='disabled' WHERE user_id=$1",[actor],/last active/);
 const events = await client.query("SELECT action FROM app.audit_events WHERE tenant_id=$1 AND entity_id=$2 ORDER BY created_at",[tenant,paymentId]);
 assert.ok(events.rows.some(row=>row.action==='payment.verified')); checks++;
 await rejects("UPDATE app.audit_events SET action='tampered' WHERE tenant_id=$1",[tenant],/append-only/);
 await client.query("ROLLBACK");
 console.log(`PASS ${checks} live schema, financial, tenant-isolation and RBAC checks on ${branch}`);
 console.log("PASS server pool role and tenant settings reset after transaction");
 console.log("PASS financial fixtures rolled back; no production test data written");
} catch(error) {
 await client.query("ROLLBACK").catch(()=>{});
 console.error("FAIL schema verification:",error instanceof Error ? error.message : "unknown error"); process.exitCode=1;
} finally { await client.end(); await getDatabase().end(); }
