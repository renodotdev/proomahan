import { workspaceIdentity,workspaceSummary } from "@/lib/neon/workspace";
import { apiError } from "@/lib/neon/request";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
 try {
  const tenantId=new URL(request.url).searchParams.get("tenantId");
  return Response.json(tenantId?await workspaceSummary(tenantId):await workspaceIdentity(),{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return apiError(error);}
}
