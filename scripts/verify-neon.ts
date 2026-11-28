import assert from "node:assert/strict";
import { execFileSync,spawn } from "node:child_process";
import { mkdtemp,readFile,chmod,rm } from "node:fs/promises";
import { Client } from "pg";
import { randomBytes,createHmac } from "node:crypto";
import { parseEnv } from "node:util";
const branch=process.argv[2];
if(!branch?.startsWith("schema-validation-"))throw new Error("Use a disposable schema-validation-* branch; production is forbidden");
const residentPortalOnly = process.argv.includes("--resident-portal-only");
const projectOption = process.argv.indexOf("--project-id");
const projectId = projectOption === -1 ? undefined : process.argv[projectOption + 1];
if (projectOption !== -1 && (!projectId || projectId.startsWith("--"))) throw new Error("--project-id requires a Neon project ID");
const projectArgs = projectId ? ["--project-id",projectId] : [];
const cli=(args:string[])=>execFileSync("neon",[...args,...projectArgs],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
const directory=await mkdtemp('/private/tmp/proomahan-live-');await chmod(directory,0o700);
const password=randomBytes(24).toString('base64url');const residentPassword=randomBytes(24).toString('base64url');const newPassword=randomBytes(24).toString('base64url');
let server:ReturnType<typeof spawn>|undefined;let checks=0;
const origin="http://localhost:3003";
type Jar=Map<string,string>;
async function request(path:string,jar:Jar=new Map(),method='GET',body?:unknown,expected=200){
 const headers:Record<string,string>={Origin:origin,Cookie:[...jar].map(([key,value])=>`${key}=${value}`).join('; ')};
 if(body!==undefined && !(body instanceof Uint8Array))headers['Content-Type']='application/json';
 const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:body instanceof Uint8Array?new Uint8Array(body).buffer:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(60000)});
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0];const index=pair.indexOf('=');jar.set(pair.slice(0,index),pair.slice(index+1));}
 assert.equal(response.status,expected,`${method} ${path} returned ${response.status}, expected ${expected}`);checks++;
 return response;
}
const json=async(path:string,jar:Jar,method='GET',body?:unknown,expected=200)=>(await request(path,jar,method,body,expected)).json();

async function verify() {
 const branches: { id: string; name: string; default: boolean; primary: boolean; protected: boolean }[] = JSON.parse(cli(["branches","list","--output","json"]));
 const target = branches.find(item => item.name === branch);
 assert.ok(target && !target.default && !target.primary && !target.protected, "Use a confirmed disposable non-production branch");
 const args = ["env","pull","--branch",branch!,"--file",directory+"/.env.local","--service","postgres","--service","auth"];
 if (!residentPortalOnly) args.push("--service","object-storage");
 cli(args);
 await chmod(directory+"/.env.local",0o600);
 const branchEnv = parseEnv(await readFile(directory+"/.env.local","utf8"));
 assert.equal(branchEnv.NEON_BRANCH_ID, target.id, "Pulled environment must match the verified branch");
 assert.ok(branchEnv.DATABASE_URL && branchEnv.DATABASE_URL_UNPOOLED && branchEnv.NEON_AUTH_BASE_URL, "Missing branch-scoped database or auth environment");
 const env: NodeJS.ProcessEnv = {
  ...process.env, ...branchEnv, NEON_AUTH_COOKIE_SECRET: randomBytes(48).toString("base64url"),
  PROOMAHAN_PUBLIC_TENANT_SLUG: "dpark-city",
 };
 if (residentPortalOnly) {
  Object.assign(env, { AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "", AWS_ENDPOINT_URL_S3: "" });
  await withFixtureDatabase(branchEnv.DATABASE_URL_UNPOOLED, async db => {
   const existing = await db.query("SELECT EXISTS(SELECT 1 FROM app.user_profiles UNION ALL SELECT 1 FROM app.contact_entries) AS seeded");
   assert.equal(existing.rows[0].seeded, false, "Resident portal verification requires an empty fixture branch");
   await db.query("INSERT INTO app.tenants(name,slug) VALUES ('D''Park City','dpark-city') ON CONFLICT (slug) DO NOTHING");
  });
 }
 const result=execFileSync(process.execPath,['--experimental-strip-types','scripts/bootstrap-admin.ts','--branch',branch,'--test-input',...projectArgs],{input:JSON.stringify({name:'Integration administrator',phone:'081200000009',password}),encoding:'utf8',stdio:['pipe','pipe','pipe']});
 assert.ok(result.includes('Super Administrator configured'));assert.ok(!result.includes(password));checks++;
 assert.ok(/Disable Sign Up:\s*true/.test(cli(['neon-auth','config','email-password','get','--branch',branch])));checks++;
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3003','--hostname','127.0.0.1'],{env,stdio:['ignore','pipe','pipe']});
 await waitForFixtureServer(server);
 await request('/sign-in');
 const admin:Jar=new Map();const resident:Jar=new Map();const oldResident:Jar=new Map();
 await request('/api/workspace',undefined,'GET',undefined,401);
 await request('/api/auth/sign-in/email',undefined,'POST',{email:'not-used@example.test',password},403);
 await json('/api/login/phone',admin,'POST',{phone:'081200000009',password});
 const identity=await json('/api/workspace',admin);assert.equal(identity.name,'Integration administrator');assert.equal(identity.phone,'+6281200000009');assert.equal(identity.mustChangePassword,false);checks++;
 const tenant=identity.tenants.find((t:{name:string})=>t.name==="D'Park City").id;
 const base=`/api/neighborhoods/${tenant}`;
 for (const [phone, submitted] of [["081200000009","Wrong-password-example"],["081200000008",password]]) {
  const error = await json('/api/login/phone',new Map(),'POST',{phone,password:submitted},401);
  assert.equal(error.error, "Nomor telepon atau kata sandi tidak sesuai.");
 }
 if (residentPortalOnly) {
  await verifyResidentPortal(admin, tenant, branchEnv.DATABASE_URL_UNPOOLED);
  console.log(`PASS ${checks} resident portal setup and HTTP checks on the disposable fixture branch`);
  return;
 }
 const cluster=await json(base+'/records/clusters',admin,'POST',{name:'Integration cluster',code:'QA'},201);
 await request(base+'/records/clusters',admin,'POST',{name:'Duplicate',code:'qa'},409);
 const person=await json(base+'/records/people',admin,'POST',{fullName:'Integration resident',phone:'081200000007',documentsUrl:'https://drive.google.com/example'},201);
 const other=await json(base+'/records/people',admin,'POST',{fullName:'Other resident',phone:'081200000006'},201);
 await json(base+'/records/people/'+person.id,admin,'PATCH',{fullName:'Integration resident updated',phone:'081200000007',rowVersion:person.row_version});
 await request(base+'/records/people/'+person.id,admin,'PATCH',{fullName:'Stale edit',phone:'081200000007',rowVersion:person.row_version},409);
 const unit=await json(base+'/records/units',admin,'POST',{number:'QA-01',clusterId:cluster.id,availableForRent:true},201);
 await json(base+`/units/${unit.id}/occupancy`,admin,'POST',{action:'owner',personId:other.id,date:'2026-01-01'});
 await json(base+`/units/${unit.id}/occupancy`,admin,'POST',{action:'check_in',personId:person.id,date:'2026-01-01',occupancyType:'rented'});
 await request(base+`/units/${unit.id}/occupancy`,admin,'POST',{action:'check_in',personId:other.id,date:'2026-02-01',occupancyType:'rented'},400);
 let units=await json(base+'/records/units?q=QA-01',admin);assert.equal(units.rows[0].occupant,'Integration resident updated');assert.equal(units.rows[0].owner,'Other resident');checks++;
 await json(base+`/units/${unit.id}/occupancy`,admin,'POST',{action:'check_out',date:'2026-11-07'});
 units=await json(base+'/records/units?q=QA-01',admin);assert.equal(units.rows[0].occupant,null);checks++;
 await json(base+`/units/${unit.id}/occupancy`,admin,'POST',{action:'check_in',personId:person.id,date:'2026-11-08',occupancyType:'rented'});
 await json('/api/accounts',admin,'POST',{tenantId:tenant,personId:person.id,phone:'081200000007',password:residentPassword},201);
 await request('/api/accounts',admin,'POST',{tenantId:tenant,personId:person.id,phone:'081200000007',password:residentPassword},409);
 await json('/api/login/phone',resident,'POST',{phone:'081200000007',password:residentPassword});
 let residentIdentity=await json('/api/workspace',resident);assert.equal(residentIdentity.mustChangePassword,true);checks++;
 await request(base+'/records/people',resident,'GET',undefined,403);
 await request('/api/documents',resident,'GET',undefined,403);
 await request('/api/account/password',resident,'POST',{currentPassword:'Incorrect-password',newPassword},400);
 await json('/api/login/phone',oldResident,'POST',{phone:'081200000007',password:residentPassword});
 await json('/api/account/password',resident,'POST',{currentPassword:residentPassword,newPassword});
 await request('/api/workspace',oldResident,'GET',undefined,401);
 residentIdentity=await json('/api/workspace',resident);assert.equal(residentIdentity.mustChangePassword,false);checks++;
 const own=await json(base+'/records/people',resident);assert.equal(own.total,1);assert.equal(own.rows[0].id,person.id);assert.equal(own.canManage,false);checks++;
 const ownUnits=await json(base+'/records/units',resident);assert.equal(ownUnits.rows.length,1);assert.equal(ownUnits.rows[0].id,unit.id);checks++;
 await request(base+'/records/clusters',resident,'POST',{name:'Forbidden',code:'NO'},403);
 await request('/api/accounts',resident,'POST',{tenantId:tenant,personId:other.id,phone:'081200000006',password:residentPassword},403);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
 const uploaded=await json('/api/documents',resident,'POST',png,201);
 const downloaded=await request('/api/documents?key='+encodeURIComponent(uploaded.key),resident);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),png);checks++;
 await request('/api/documents?key='+encodeURIComponent(uploaded.key),admin,'GET',undefined,404);
 await json('/api/documents?key='+encodeURIComponent(uploaded.key),resident,'DELETE');
 const resetPassword=randomBytes(24).toString('base64url');
 await json('/api/accounts/reset-password',admin,'POST',{tenantId:tenant,personId:person.id,password:resetPassword});
 await request('/api/workspace',resident,'GET',undefined,401);
 await request('/api/login/phone',undefined,'POST',{phone:'081200000007',password:newPassword},401);
 await json('/api/login/phone',resident,'POST',{phone:'081200000007',password:resetPassword});
 assert.equal((await json('/api/workspace',resident)).mustChangePassword,true);checks++;
 await json('/api/auth/sign-out',resident,'POST',{});
 await request('/api/workspace',resident,'GET',undefined,401);
 const rateUrl=new URL(env.DATABASE_URL_UNPOOLED!);rateUrl.searchParams.set('sslmode','verify-full');
 const rateDb=new Client({connectionString:rateUrl.toString()});await rateDb.connect();
 try{
  const bucket=createHmac('sha256',env.NEON_AUTH_COOKIE_SECRET!).update('phone:+6281200000008').digest('hex');
  await rateDb.query("INSERT INTO app_private.login_rate_limits(bucket_key,window_start,attempts) SELECT $1,date_trunc('minute',now())+make_interval(mins=>n),10 FROM generate_series(0,1) n ON CONFLICT(bucket_key,window_start) DO UPDATE SET attempts=10",[bucket]);
  await request('/api/login/phone',undefined,'POST',{phone:'0812 0000 0008',password},429);
 }finally{await rateDb.end();}
 console.log(`PASS ${checks} live phone/password, bootstrap, resident CRUD, occupancy, account provisioning, password-change, isolation and storage checks`);
 console.log('PASS no SMS/email verification; upstream public signup restored to disabled');
 console.log('PASS old session revoked after password change; resident cannot administer or read another resident');
 console.log('All fixture identities and records are confined to the disposable test branch.');
}

function waitForFixtureServer(child: ReturnType<typeof spawn>) {
 return new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Fixture server did not start on port 3003")), 20000);
  child.stderr?.resume();
  child.once("error", error => { clearTimeout(timeout); reject(error); });
  child.once("exit", () => { clearTimeout(timeout); reject(new Error("Fixture server exited before it was ready")); });
  child.stdout?.on("data", (chunk: Buffer) => {
   if (/Ready in/.test(chunk.toString())) { clearTimeout(timeout); resolve(); }
  });
 });
}

async function withFixtureDatabase<T>(connectionString: string, work: (db: Client) => Promise<T>) {
 const url = new URL(connectionString);
 url.searchParams.set("sslmode", "verify-full");
 const db = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000 });
 try {
  await db.connect();
  return await work(db);
 } finally {
  await db.end();
 }
}

async function verifyResidentPortal(admin: Jar, tenant: string, connectionString: string) {
 const base = `/api/neighborhoods/${tenant}`;
 const endpoint = `${base}/resident`;
 const linked: Jar = new Map();
 const unlinked: Jar = new Map();
 const readSignIn = async () => (await request("/sign-in")).text();
 const otherTenant = await withFixtureDatabase(connectionString, async db => {
  const result = await db.query("INSERT INTO app.tenants(name,slug) VALUES ('Fixture community','fixture-community') RETURNING id");
  await db.query(`INSERT INTO app.contact_entries(tenant_id,category,display_name,phone,visibility)
   VALUES ($1,'pengurus','Resident contact','+628120000003','residents'),
          ($2,'pengurus','Other community','+628120000004','public')`, [tenant, result.rows[0].id]);
  return result.rows[0].id as string;
 });
 const fallback = await readSignIn();
 assert.match(fallback, /Minta akun/);
 assert.match(fallback, /Lupa kata sandi/);
 assert.match(fallback, /datang ke kantor pengurus/);
 assert.doesNotMatch(fallback, /628120000003|628120000004/);
 await withFixtureDatabase(connectionString, async db => {
  await db.query(`INSERT INTO app.contact_entries(tenant_id,category,display_name,phone,whatsapp,visibility)
   VALUES ($1,'pengurus','Public contact','+628120000001','+628120000002','public')`, [tenant]);
 });
 const signIn = await readSignIn();
 assert.match(signIn, /href="https:\/\/wa\.me\/628120000002"/);
 assert.doesNotMatch(signIn, /628120000003|628120000004/);

 const cluster = await json(base+"/records/clusters",admin,"POST",{name:"Fixture cluster",code:"QA"},201);
 const person = await json(base+"/records/people",admin,"POST",{fullName:"Fixture linked",phone:"081200000007",email:"linked@example.test"},201);
 const other = await json(base+"/records/people",admin,"POST",{fullName:"Fixture unlinked",phone:"081200000006"},201);
 const first = await json(base+"/records/units",admin,"POST",{number:"QA-01",clusterId:cluster.id,addressDetail:"Jalan Uji"},201);
 const second = await json(base+"/records/units",admin,"POST",{number:"QA-02",clusterId:cluster.id},201);
 await json(base+"/records/units",admin,"POST",{number:"QA-03",clusterId:cluster.id},201);
 const date = "2026-01-01";
 await json(base+`/units/${first.id}/occupancy`,admin,"POST",{action:"owner",personId:person.id,date});
 await json(base+`/units/${first.id}/occupancy`,admin,"POST",{action:"check_in",personId:person.id,date,occupancyType:"owner_occupied"});
 await json(base+`/units/${second.id}/occupancy`,admin,"POST",{action:"check_in",personId:person.id,date,occupancyType:"rented"});
 await json("/api/accounts",admin,"POST",{tenantId:tenant,personId:person.id,phone:"081200000007",password:residentPassword},201);
 await request("/api/accounts",admin,"POST",{tenantId:tenant,personId:other.id,phone:"+6281200000007",password:residentPassword},409);
 await json("/api/accounts",admin,"POST",{tenantId:tenant,personId:other.id,phone:"081200000006",password:residentPassword},201);

 await request(endpoint,undefined,"GET",undefined,401);
 await json("/api/login/phone",linked,"POST",{phone:"081200000007",password:residentPassword});
 assert.equal((await json("/api/workspace",linked)).mustChangePassword,true);
 await request("/api/account/password",linked,"POST",{currentPassword:"Incorrect-password",newPassword},400);
 assert.equal((await json("/api/workspace",linked)).mustChangePassword,true);
 await request(endpoint,linked,"GET",undefined,403);
 await request(base+"/records/people",linked,"GET",undefined,403);
 await json("/api/account/password",linked,"POST",{currentPassword:residentPassword,newPassword});
 assert.equal((await json("/api/workspace",linked)).mustChangePassword,false);
 await json("/api/auth/sign-out",linked,"POST",{});
 await request(endpoint,linked,"GET",undefined,401);
 await json("/api/login/phone",linked,"POST",{phone:"+6281200000007",password:newPassword});
 const response = await request(endpoint,linked);
 assert.equal(response.headers.get("cache-control"),"private, no-store");
 assert.deepEqual(await response.json(), {
  profile: {name:"Fixture linked",phone:"+6281200000007",email:"linked@example.test"},
  units: [
   {id:first.id,number:"QA-01",cluster:"Fixture cluster",address:"Jalan Uji"},
   {id:second.id,number:"QA-02",cluster:"Fixture cluster",address:null},
  ],
  contact: {href:"tel:+628120000003",channel:"Telepon",number:"+628120000003"},
 });
 await request(`/api/neighborhoods/${otherTenant}/resident`,linked,"GET",undefined,403);
 await json("/api/login/phone",unlinked,"POST",{phone:"+6281200000006",password:residentPassword});
 await json("/api/account/password",unlinked,"POST",{currentPassword:residentPassword,newPassword});
 const own = await json(endpoint,unlinked);
 assert.equal(own.profile.name,"Fixture unlinked");
 assert.deepEqual(own.units,[]);
}

try { await verify(); }
catch(error){console.error('FAIL live integration:',error instanceof Error?error.message:"unknown error");process.exitCode=1;}
finally{server?.kill('SIGTERM');await rm(directory,{recursive:true,force:true});}
