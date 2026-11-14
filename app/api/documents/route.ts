import { randomUUID } from "node:crypto";
import { getVerifiedSession } from "@/lib/neon/auth-server";
import { getDatabase } from "@/lib/neon/database";
import { getStorage } from "@/lib/neon/storage";
import { documentExtension, documentPrefix, MAX_DOCUMENT_SIZE, ownedDocumentKey } from "@/lib/neon/document-key";
import { apiError,jsonBody } from "@/lib/neon/request";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function handle(request: Request) {
  try {
    const { data: session } = await getVerifiedSession();
    if (!session?.user) return Response.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401, headers });
    const userId = session.user.id;
    // Identity comes from the verified server session, never from a supplied user ID.
    const profile = await getDatabase().query<{ id: string; name: string }>(`SELECT u.id, p.display_name AS name FROM neon_auth."user" u JOIN app.user_profiles p ON p.user_id=u.id WHERE u.id=$1 AND p.status='active' AND NOT p.must_change_password`, [userId]);
    if (!profile.rows.length) return Response.json({ error: "Akun tidak ditemukan." }, { status: 403, headers });
    const storage = getStorage();
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if(request.method==="DELETE"&&!key) {
      const {keys}=await jsonBody(request);
      if(!Array.isArray(keys)||!keys.length||keys.length>20||new Set(keys).size!==keys.length) {
        throw new DatabaseAccessError("Pilih 1–20 dokumen yang berbeda.",400);
      }
      if(keys.some(key=>typeof key!=="string"||!ownedDocumentKey(userId,key))) {
        throw new DatabaseAccessError("Dokumen tidak ditemukan.",404);
      }
      const deleted:string[]=[];
      const failed:string[]=[];
      for(const key of keys as string[]) {
        try { await storage.delete(key);deleted.push(key); }
        catch { failed.push(key); }
      }
      return Response.json({deleted,failed},{headers});
    }
    if (key) {
      if (!ownedDocumentKey(userId, key)) return Response.json({ error: "Dokumen tidak ditemukan." }, { status: 404, headers });
      if (request.method === "DELETE") {
        await storage.delete(key);
        return Response.json({ deleted: true }, { headers });
      }
      if (request.method !== "GET") return Response.json({ error: "Permintaan tidak valid." }, { status: 400, headers });
      const file = await storage.download(key);
      return new Response(await file.arrayBuffer(), { headers: { ...headers, "Content-Type": file.contentType, "Content-Disposition": 'attachment; filename="dokumen.' + key.split(".").pop() + '"', "X-Content-Type-Options": "nosniff" } });
    }
    if (request.method === "GET") {
      const cursor = url.searchParams.get("cursor") || undefined;
      if (cursor && cursor.length > 4096) return Response.json({ error: "Halaman tidak valid." }, { status: 400, headers });
      const result = await storage.list({ prefix: documentPrefix(userId), limit: 20, cursor });
      return Response.json({ owner: profile.rows[0].name, files: result.items, cursor: result.cursor }, { headers });
    }
    if (request.method !== "POST") return Response.json({ error: "Pilih dokumen terlebih dahulu." }, { status: 400, headers });
    if (Number(request.headers.get("content-length")) > MAX_DOCUMENT_SIZE + 65536) return Response.json({ error: "Ukuran dokumen maksimal 3 MB." }, { status: 413, headers });
    // Enforce a bound even when the request uses chunked transfer without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Pilih dokumen terlebih dahulu." }, { status: 400, headers });
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_DOCUMENT_SIZE) { await reader.cancel(); return Response.json({ error: "Ukuran dokumen maksimal 3 MB." }, { status: 413, headers }); }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const extension = documentExtension(bytes);
    if (!extension) return Response.json({ error: "Gunakan dokumen PDF atau gambar JPG/PNG." }, { status: 400, headers });
    const newKey = `${documentPrefix(userId)}${randomUUID()}.${extension}`;
    const contentType = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" }[extension];
    await storage.upload(newKey, bytes, { contentType });
    return Response.json({ key: newKey, size: bytes.length }, { status: 201, headers });
  } catch(error) {
    if(error instanceof DatabaseAccessError)return apiError(error);
    return Response.json({ error: "Layanan dokumen belum tersedia. Silakan coba lagi." }, { status: 503, headers });
  }
}

function mutate(request: Request) {
  let sameOrigin = false;
  try { sameOrigin = new URL(request.headers.get("origin") || "").host === request.headers.get("host"); } catch {}
  if (!sameOrigin) return Response.json({ error: "Asal permintaan tidak diizinkan." }, { status: 403, headers });
  return handle(request);
}
export const GET = handle;
export const POST = mutate;
export const DELETE = mutate;
