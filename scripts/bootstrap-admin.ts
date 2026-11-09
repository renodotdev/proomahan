import nextEnv from "@next/env";
import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { normalizePhone } from "../lib/phone.ts";
nextEnv.loadEnvConfig(process.cwd());
const args=process.argv.slice(2);
const option=(name:string)=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const branch=option("--branch");
const test=args.includes("--test-input");
if(test&&!branch?.startsWith("schema-validation-")) throw new Error("Test input is allowed only on a disposable validation branch");
const cli=(values:string[])=>execFileSync("neon",values,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
const branchArgs=branch?["--branch",branch]:[];
const connection=branch?cli(["connection-string",branch,"--ssl","verify-full"]):process.env.DATABASE_URL_UNPOOLED;
if(!connection)throw new Error("Missing direct database URL");
const databaseUrl=new URL(connection);databaseUrl.searchParams.set("sslmode","verify-full");
const db=new Client({connectionString:databaseUrl.toString(),connectionTimeoutMillis:15000});
let restoring=false;let createdId:string|undefined;let committed=false;
const configure=(disabled:boolean)=>cli(["neon-auth","config","email-password","update",...branchArgs,"--disable-sign-up",String(disabled)]);
async function hidden(prompt:string){
 if(!process.stdin.isTTY)throw new Error("Run this command in your terminal to enter the password privately");
 process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.setEncoding("utf8");process.stdin.resume();
 return new Promise<string>((resolve,reject)=>{
  let value="";
  const finish=(error?:Error)=>{process.stdin.off("data",read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write("\n");error?reject(error):resolve(value);};
  const read=(chunk:string)=>{for(const char of chunk){if(char==='\u0003'){finish(new Error("Cancelled"));return;}if(char==='\r'||char==='\n'){finish();return;}if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(char>=' ')value+=char;}};
  process.stdin.on("data",read);
 });
}
async function restore(){if(restoring){configure(true);restoring=false;}}
try{
 await db.connect();await db.query("SELECT pg_advisory_lock(73180423)");
 const exists=await db.query("SELECT id FROM app.platform_role_assignments WHERE revoked_at IS NULL");
 if(exists.rows.length&&!test){console.log("A permanent Super Administrator already exists. No account or password was changed.");}
 else{
  let name=option("--name")||process.env.PROOMAHAN_BOOTSTRAP_NAME;let phone=option("--phone")||process.env.PROOMAHAN_BOOTSTRAP_PHONE;let password:string;
  if(test){let input="";for await(const chunk of process.stdin)input+=chunk;const data=JSON.parse(input);name=data.name;phone=data.phone;password=data.password;}
  else{
   if(!process.stdin.isTTY)throw new Error("Run interactively; never put passwords in command arguments");
   const rl=createInterface({input:process.stdin,output:process.stdout});
   if(!name)name=await rl.question("Nama Super Administrator: ");
   if(!phone)phone=await rl.question("Nomor telepon: ");
   rl.close();password=await hidden("Kata sandi (12–128 karakter, tidak ditampilkan): ");
   if(password!==await hidden("Ulangi kata sandi: "))throw new Error("Passwords do not match");
  }
  phone=normalizePhone(phone||"");name=name?.trim();
  if(!name||name.length>200||typeof password!=="string"||password.length<12||password.length>128)throw new Error("Valid name, phone and a 12–128 character password are required");
  const status=cli(["neon-auth","status",...branchArgs]);
  const baseUrl=branch?status.match(/Base URL:\s*(https:\/\/\S+)/)?.[1]:process.env.NEON_AUTH_BASE_URL;
  if(!baseUrl)throw new Error("Neon Auth endpoint is unavailable");
  const settings=cli(["neon-auth","config","email-password","get",...branchArgs]);
  if(!/Disable Sign Up:\s*true/.test(settings))throw new Error("Disable upstream signup before running bootstrap; existing Auth policy was left unchanged");
  if(!/Require Verification:\s*false/.test(settings)||!/Send Email On Sign Up:\s*false/.test(settings)||!/Send Email On Sign In:\s*false/.test(settings))throw new Error("The no-email-verification MVP requires verification and verification-email delivery disabled; no settings were changed");
  if(!test&&(await db.query("SELECT user_id FROM app.user_profiles LIMIT 1")).rows.length)throw new Error("Accounts already exist; use an audited administrator recovery procedure");
  // The app registration route remains blocked; unenrolled identities have no application access.
  restoring=true;configure(false);
  try{
   const response=await fetch(baseUrl.replace(/\/$/,"")+"/sign-up/email",{method:"POST",headers:{"Content-Type":"application/json",Origin:"http://localhost:3001"},body:JSON.stringify({name,email:`${randomUUID()}@accounts.proomahan.invalid`,password}),signal:AbortSignal.timeout(30000)});
   const data=await response.json();
   if(!response.ok||!data.user?.id)throw new Error(`Neon account creation failed (HTTP ${response.status})`);
   createdId=data.user.id;
  }finally{await restore();}
  cli(["neon-auth","user","set-role",createdId!,"--roles","admin",...branchArgs]);
  await db.query("BEGIN");
  const tenant=await db.query("SELECT id FROM app.tenants WHERE slug='dpark-city' AND status='active'");
  if(!tenant.rows.length)throw new Error("D'Park City tenant is missing");
  await db.query("INSERT INTO app.user_profiles(user_id,display_name,must_change_password,provisioned_by) VALUES ($1,$2,false,$1)",[createdId,name]);
  await db.query("INSERT INTO app.platform_role_assignments(user_id,assigned_by,reason) VALUES ($1,$1,'Initial operator bootstrap')",[createdId]);
  await db.query("INSERT INTO app.tenant_memberships(tenant_id,user_id) VALUES ($1,$2)",[tenant.rows[0].id,createdId]);
  await db.query("INSERT INTO app_private.phone_login_identifiers(user_id,phone_e164,approved_by,reason) VALUES ($1,$2,$1,'Initial operator bootstrap')",[createdId,phone]);
  await db.query("INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,'administrator.bootstrap','user',$2)",[tenant.rows[0].id,createdId]);
  await db.query("COMMIT");committed=true;
  console.log("Super Administrator configured. Phone/password sign-in is ready; public signup is disabled. Password was not printed or saved to a file.");
 }
}catch(error){await db.query("ROLLBACK").catch(()=>{});console.error("Setup failed:",error instanceof Error?error.message:"unknown error");process.exitCode=1;}
finally{
 try{await restore();}catch{console.error("IMPORTANT: Signup policy restoration failed. Run: neon neon-auth config email-password update --disable-sign-up true");process.exitCode=1;}
 if(createdId&&!committed){try{cli(["neon-auth","user","delete",createdId,...branchArgs]);}catch{console.error("Account cleanup failed; review the unlinked bootstrap identity in Neon Auth.");process.exitCode=1;}}
 await db.end();
}
