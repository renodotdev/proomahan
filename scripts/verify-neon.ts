import assert from "node:assert/strict";
import { execFileSync,spawn } from "node:child_process";
import { mkdtemp,readFile,chmod,rm } from "node:fs/promises";
import { Client } from "pg";
import { randomBytes,createHmac } from "node:crypto";
import { parseEnv } from "node:util";
const branch=process.argv[2];
if(!branch?.startsWith("schema-validation-"))throw new Error("Use a disposable schema-validation-* branch; production is forbidden");
const cli=(args:string[])=>execFileSync("neon",args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
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
try{
 const result=execFileSync(process.execPath,['--experimental-strip-types','scripts/bootstrap-admin.ts','--branch',branch,'--test-input'],{input:JSON.stringify({name:'Integration administrator',phone:'081200000009',password}),encoding:'utf8',stdio:['pipe','pipe','pipe']});
 assert.ok(result.includes('Super Administrator configured'));assert.ok(!result.includes(password));checks++;
 assert.ok(/Disable Sign Up:\s*true/.test(cli(['neon-auth','config','email-password','get','--branch',branch])));checks++;
 cli(['env','pull','--branch',branch,'--file',directory+'/.env.local','--service','postgres','--service','auth','--service','object-storage']);
 await chmod(directory+'/.env.local',0o600);
 const env:NodeJS.ProcessEnv={...process.env,...parseEnv(await readFile(directory+'/.env.local','utf8')),NEON_AUTH_COOKIE_SECRET:randomBytes(48).toString('base64url')};
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3003','--hostname','127.0.0.1'],{env,stdio:['ignore','pipe','pipe']});
 server.stdout?.on('data',()=>{});server.stderr?.on('data',()=>{});
 let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(origin+'/sign-in');if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 assert.ok(ready,'Production build did not start');checks++;
 const admin:Jar=new Map();const resident:Jar=new Map();const oldResident:Jar=new Map();
 await request('/api/workspace',undefined,'GET',undefined,401);
 await request('/api/auth/sign-in/email',undefined,'POST',{email:'not-used@example.test',password},403);
 await json('/api/login/phone',admin,'POST',{phone:'081200000009',password});
 const identity=await json('/api/workspace',admin);assert.equal(identity.name,'Integration administrator');assert.equal(identity.phone,'+6281200000009');assert.equal(identity.mustChangePassword,false);checks++;
 const tenant=identity.tenants.find((t:{name:string})=>t.name==="D'Park City").id;
 const base=`/api/neighborhoods/${tenant}`;
 await request('/api/login/phone',undefined,'POST',{phone:'081200000009',password:'Wrong-password-example'},401);
 await request('/api/login/phone',undefined,'POST',{phone:'081200000008',password},401);
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
}catch(error){console.error('FAIL live integration:',error instanceof Error?error.message:'unknown error');process.exitCode=1;}
finally{server?.kill('SIGTERM');await rm(directory,{recursive:true,force:true});}
