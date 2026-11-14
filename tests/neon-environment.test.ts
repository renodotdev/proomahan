import test from "node:test";
import assert from "node:assert/strict";
import { requiredEnv, authEnvironment } from "../lib/neon/environment.ts";

test("missing secrets fail closed without exposing their values", () => {
  assert.throws(() => requiredEnv("DATABASE_URL", {}), /Missing server environment variable: DATABASE_URL/);
  assert.equal(requiredEnv("DATABASE_URL", { DATABASE_URL: "  test  " }), "test");
});

test("auth requires HTTPS and a strong cookie secret", () => {
  const env = { NEON_AUTH_BASE_URL: "https://example.neonauth.example/neondb/auth", NEON_AUTH_COOKIE_SECRET: "a".repeat(44) };
  assert.equal(authEnvironment(env).baseUrl, env.NEON_AUTH_BASE_URL);
  for (const value of ["invalid", "http://example.test/auth", "https://user:password@example.test"]) {
    assert.throws(() => authEnvironment({ ...env, NEON_AUTH_BASE_URL: value }), /HTTPS URL/);
  }
  assert.throws(() => authEnvironment({ ...env, NEON_AUTH_COOKIE_SECRET: "short" }), /32 characters/);
});

import { documentExtension, documentPrefix, ownedDocumentKey } from "../lib/neon/document-key.ts";
test("document keys are confined to the authenticated owner", () => {
  const key = `${documentPrefix("user-a")}12345678-1234-1234-1234-123456789012.pdf`;
  assert.equal(ownedDocumentKey("user-a", key), true);
  assert.equal(ownedDocumentKey("user-b", key), false);
  assert.equal(ownedDocumentKey("user-a", `${documentPrefix("user-a")}../user-b/file.pdf`), false);
  assert.equal(ownedDocumentKey("user-a", key + ".html"), false);
});
test("uploads check content signatures rather than trusting extensions", () => {
  assert.equal(documentExtension(Buffer.from("%PDF-1.7\n")), "pdf");
  assert.equal(documentExtension(new Uint8Array([137,80,78,71,13,10,26,10])), "png");
  assert.equal(documentExtension(new Uint8Array([255,216,255,224])), "jpg");
  assert.equal(documentExtension(Buffer.from("<html>")), null);
  assert.equal(documentExtension(new Uint8Array()), null);
});

import { normalizePhone } from "../lib/phone.ts";
test("phone login normalizes Indonesian local numbers and preserves international E164",()=>{
 assert.equal(normalizePhone("0812-3456-7890"),"+6281234567890");
 assert.equal(normalizePhone("62 812 3456 7890"),"+6281234567890");
 assert.equal(normalizePhone("+65 8123 4567"),"+6581234567");
 for(const value of ["", "user@example.com", "+620", "0812/3456/7890", "+628123456789012345"]) assert.throws(()=>normalizePhone(value));
});

import { coreInput,realDate } from "../lib/neon/core-input.ts";
import { deleteInput,deleteLimit } from "../lib/neon/delete-input.ts";
test("delete selections reject duplicate, oversized, or invalid record versions",()=>{
 const record={id:"12345678-1234-1234-1234-123456789012",rowVersion:"1"};
 assert.deepEqual(deleteInput([record]),[record]);
 for(const input of [[],null,[record,record],Array(deleteLimit+1).fill(record),[{...record,rowVersion:"0"}],[{...record,rowVersion:"9223372036854775808"}],[{...record,rowVersion:1}],[{...record,id:"units; DROP TABLE"}]]) {
  assert.throws(()=>deleteInput(input));
 }
});
import { bulkColumns,bulkInput,bulkRowLimit } from "../lib/neon/bulk-input.ts";
test("spreadsheet entry preserves identifiers, optional cells, and source row numbers",()=>{
 for(const resource of ["clusters","people","units"] as const){
  const example=bulkColumns[resource].map(column=>column.example).join("\t");
  assert.equal(bulkInput(resource,example).length,1);
 }
 assert.deepEqual(bulkInput("people","\r\n\"Warga \"\"A\"\"\"\t081234567890\t\thttps://drive.google.com/example\r\n"),[
  {line:2,body:{fullName:'Warga "A"',phone:"081234567890",email:"",documentsUrl:"https://drive.google.com/example"}},
 ]);
 assert.equal(bulkInput("units","001\tA\t\tYA")[0].body.availableForRent,true);
 assert.equal(bulkInput("units","001\tA")[0].body.number,"001");
 assert.throws(()=>bulkInput("units","001\tA\n\n002\tA\t\tMungkin"),/Baris 3/);
 assert.throws(()=>bulkInput("clusters","A\tAnggrek\tExtra"),/Baris 1/);
 assert.throws(()=>bulkInput("clusters",'A\t"Broken\nB\tValid'),/Baris 1/);
 assert.throws(()=>bulkInput("clusters",Array(bulkRowLimit+1).fill("A\tAnggrek").join("\n")),/Maksimal 50/);
});
test("live resident input keeps contact phones normalized and restricts document links",()=>{
 const person=coreInput("people",{fullName:"Warga Contoh",phone:"081234567890",documentsUrl:"https://drive.google.com/example"});
 assert.ok("phone" in person);assert.equal(person.phone,"+6281234567890");
 for(const documentsUrl of ["http://example.test","javascript:alert(1)","https://user:password@example.test"])assert.throws(()=>coreInput("people",{fullName:"Warga",phone:"081234567890",documentsUrl}));
 assert.throws(()=>coreInput("clusters",{name:"A",code:"A; DROP TABLE"}));
 assert.equal(realDate("2028-02-29"),"2028-02-29");assert.throws(()=>realDate("2026-02-29"));
});
