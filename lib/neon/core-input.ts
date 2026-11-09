import { normalizePhone } from "../phone.ts";
export type CoreResource="clusters"|"people"|"units";
export function coreResource(value:string):CoreResource {
 if(!["clusters","people","units"].includes(value)) throw new Error("Jenis data tidak tersedia.");
 return value as CoreResource;
}
export function coreInput(resource:CoreResource,body:Record<string,unknown>) {
 const text=(key:string,max:number,required=false)=>{
  if(body[key]!==undefined && typeof body[key]!=="string") throw new Error("Periksa isian formulir.");
  const value=String(body[key]||"").trim();
  if((required && !value) || value.length>max) throw new Error("Lengkapi isian wajib dan periksa panjang data.");
  return value;
 };
 const archived=body.archived===true;
 if(body.archived!==undefined && typeof body.archived!=="boolean") throw new Error("Status arsip tidak valid.");
 if(resource==="clusters") {
  const code=text("code",20,true).toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) throw new Error("Kode klaster hanya memakai huruf, angka, atau tanda hubung.");
  return {code,name:text("name",100,true),archived};
 }
 if(resource==="people") {
  const documentsUrl=text("documentsUrl",2000); const email=text("email",254);
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email kontak tidak valid.");
  if(documentsUrl) { let url:URL; try{url=new URL(documentsUrl);}catch{throw new Error("URL dokumen harus berupa tautan HTTPS.");} if(url.protocol!=="https:" || url.username || url.password) throw new Error("URL dokumen harus berupa tautan HTTPS tanpa kredensial."); }
  return {fullName:text("fullName",200,true),phone:normalizePhone(text("phone",25,true)),email,documentsUrl,archived};
 }
 const clusterId=text("clusterId",36,true);
 if(!/^[0-9a-f-]{36}$/i.test(clusterId)) throw new Error("Pilih klaster yang valid.");
 if(body.availableForRent!==undefined && typeof body.availableForRent!=="boolean") throw new Error("Status sewa tidak valid.");
 return {clusterId,number:text("number",50,true),addressDetail:text("addressDetail",500),availableForRent:body.availableForRent===true,archived};
}
export function realDate(value:unknown) {
 if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+"T00:00:00Z")) || new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value) throw new Error("Tanggal tidak valid.");
 return value;
}
