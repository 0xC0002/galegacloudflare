import app from './index';
import {independentAccess} from '../lib/independent-auth';
export default {
 async fetch(request:Request,env:Cloudflare.Env,ctx:Parameters<typeof app.fetch>[2]){
  const access=await independentAccess(request,env);
  if(access.response)return access.response;
  const response=await app.fetch(access.request!,env,ctx);
  const headers=new Headers(response.headers);
  if(!new URL(request.url).pathname.startsWith('/assets/'))headers.set('Cache-Control','private, no-store');
  headers.set('X-Content-Type-Options','nosniff');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }
};
