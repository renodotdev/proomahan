import { normalizePhone } from "@/lib/phone";
import { loginEmail } from "@/lib/neon/phone-login";
import { getAuth } from "@/lib/neon/auth-server";
import { assertSameOrigin,jsonBody,apiError } from "@/lib/neon/request";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const body=await jsonBody(request);
    const raw = String(body.identifier ?? body.phone ?? "").trim().toLowerCase();
    let identifier: string;
    try { identifier = raw === "super-admin-dpark" ? raw : normalizePhone(raw); }
    catch { throw new DatabaseAccessError("ID, nomor telepon, atau kata sandi tidak sesuai.",401); }
    if (typeof body.password!=="string" || !body.password || body.password.length>128) throw new DatabaseAccessError("ID, nomor telepon, atau kata sandi tidak sesuai.",401);
    const email=await loginEmail(identifier);
    const {data,error}=await getAuth().signIn.email({email,password:body.password});
    if (error?.code === "INVALID_ORIGIN") throw new DatabaseAccessError("Alamat ini tidak diizinkan untuk masuk. Buka Proomahan melalui alamat yang diberikan pengelola.", 403);
    if(error && error.status>=500)throw new DatabaseAccessError("Layanan masuk belum tersedia. Silakan coba lagi.",503);
    if (error || !data?.user) throw new DatabaseAccessError("ID, nomor telepon, atau kata sandi tidak sesuai.",401);
    return Response.json({success:true},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return apiError(error); }
}
