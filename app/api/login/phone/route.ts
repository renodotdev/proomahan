import { normalizePhone } from "@/lib/phone";
import { phoneLoginEmail } from "@/lib/neon/phone-login";
import { getAuth } from "@/lib/neon/auth-server";
import { assertSameOrigin,jsonBody,apiError } from "@/lib/neon/request";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const body=await jsonBody(request);
    let phone:string;
    try { phone=normalizePhone(String(body.phone||"")); } catch { throw new DatabaseAccessError("Nomor telepon atau kata sandi tidak sesuai.",401); }
    if (typeof body.password!=="string" || !body.password || body.password.length>128) throw new DatabaseAccessError("Nomor telepon atau kata sandi tidak sesuai.",401);
    const email=await phoneLoginEmail(phone);
    const {data,error}=await getAuth().signIn.email({email,password:body.password});
    if(error && error.status>=500)throw new DatabaseAccessError("Layanan masuk belum tersedia. Silakan coba lagi.",503);
    if (error || !data?.user) throw new DatabaseAccessError("Nomor telepon atau kata sandi tidak sesuai.",401);
    return Response.json({success:true},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return apiError(error); }
}
