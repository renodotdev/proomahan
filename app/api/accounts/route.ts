import { provisionResidentAccount } from "@/lib/neon/account-provisioning";
import { assertSameOrigin,jsonBody,apiError } from "@/lib/neon/request";
export async function POST(request:Request){
 try{assertSameOrigin(request);return Response.json(await provisionResidentAccount(await jsonBody(request)),{status:201,headers:{"Cache-Control":"private, no-store"}});}
 catch(error){return apiError(error);}
}
