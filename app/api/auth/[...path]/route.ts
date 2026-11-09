import { getAuth } from "@/lib/neon/auth-server";

export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  const path = (await context.params).path.join("/");
  const allowed = request.method === "GET" ? ["get-session"] : ["sign-out"];
  if (!allowed.includes(path)) return Response.json({ error: "Layanan akun ini dikelola administrator." }, { status: 403 });
  try {
    const handlers = getAuth().handler();
    return request.method === "GET" ? handlers.GET(request, context) : handlers.POST(request, context);
  } catch {
    return Response.json({ error: "Layanan masuk belum tersedia. Silakan coba lagi." }, { status: 503 });
  }
}
export const GET = handle;
export const POST = handle;
