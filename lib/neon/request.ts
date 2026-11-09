import { DatabaseAccessError } from "./tenant-context.ts";
import { recordBodyLimit } from "./bulk-input.ts";
export function assertSameOrigin(request: Request) {
  let same=false;
  try { same=new URL(request.headers.get("origin")||"").host===request.headers.get("host"); } catch {}
  if (!same) throw new DatabaseAccessError("Permintaan tidak diizinkan.",403);
}
export async function jsonBody(request:Request):Promise<Record<string,unknown>> {
  const reader=request.body?.getReader();if(!reader)throw new DatabaseAccessError("Data tidak tersedia.",400);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>recordBodyLimit){await reader.cancel();throw new DatabaseAccessError("Data terlalu panjang.",413);}chunks.push(value);}
  const text=Buffer.concat(chunks).toString("utf8");
  try { const value=JSON.parse(text); if (!value || Array.isArray(value) || typeof value!=="object") throw new Error(); return value; }
  catch { throw new DatabaseAccessError("Format data tidak valid.",400); }
}
export function apiError(error:unknown) {
  const status=error instanceof DatabaseAccessError?error.status:503;
  const messages:Record<string,string>={"Invalid account or neighborhood":"Identitas akun atau lingkungan tidak valid.","Account requires administrator setup or a password change":"Akun memerlukan aktivasi atau perubahan kata sandi.","No active neighborhood membership":"Keanggotaan lingkungan belum aktif.","Neighborhood is unavailable":"Lingkungan belum tersedia.","Current role does not allow this operation":"Anda tidak memiliki akses pengurus untuk tindakan ini."};
  return Response.json({error: error instanceof DatabaseAccessError?(messages[error.message]||error.message):"Layanan belum tersedia. Silakan coba lagi."},{status,headers:{"Cache-Control":"private, no-store"}});
}
