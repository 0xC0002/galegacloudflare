import {authPage} from './independent-auth-page.ts';
export type IndependentEnv={DB?:D1Database;AUTH_SECRET?:string;SETUP_TOKEN?:string};
export type IndependentUser={id:string;username:string;email:string;name:string;role:'admin'|'manager'|'attendant'|'production';active:number;password_hash:string};
const encoder=new TextEncoder(),COOKIE='__Host-galega_session',SESSION_MS=30*86400_000,ITERATIONS=100_000;
const roles=['manager','attendant','production'];
class AccessError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status;}}
const base64url=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const unbase64=(v:string)=>Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const random=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
function db(env:IndependentEnv){if(!env.DB)throw new AccessError('Inicialização do sistema pendente.',503);return env.DB;}
function secret(env:IndependentEnv){if(!/^[a-f0-9]{64}$/i.test(env.AUTH_SECRET||''))throw new AccessError('Inicialização do acesso pendente.',503);return Uint8Array.from(env.AUTH_SECRET!.match(/../g)!,v=>parseInt(v,16));}
async function digest(env:IndependentEnv,value:string){const key=await crypto.subtle.importKey('raw',secret(env),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}
const equal=(a:Uint8Array,b:Uint8Array)=>{if(a.length!==b.length)return false;let result=0;for(let i=0;i<a.length;i++)result|=a[i]^b[i];return result===0;};
function username(value:FormDataEntryValue|null){const name=String(value||'').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(name))throw new AccessError('Use um usuário de 3 a 40 letras, números, ponto ou traço.');return name;}
function password(value:FormDataEntryValue|null){const p=String(value||'');if(p.length<12||p.length>128||/[\u0000-\u001f]/.test(p))throw new AccessError('A senha deve ter entre 12 e 128 caracteres.');return p;}
function name(value:FormDataEntryValue|null){const n=String(value||'').trim();if(!n||n.length>60||/[\u0000-\u001f\u007f]/.test(n))throw new AccessError('Confira o nome.');return n;}
export async function hashIndependentPassword(env:IndependentEnv,plain:string,salt=crypto.getRandomValues(new Uint8Array(24))):Promise<string>{
 const peppered=await digest(env,'password:v1\0'+plain),key=await crypto.subtle.importKey('raw',peppered,'PBKDF2',false,['deriveBits']);
 const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},key,256));
 return`v1$${ITERATIONS}$${base64url(salt)}$${base64url(bits)}`;
}
export async function verifyIndependentPassword(env:IndependentEnv,plain:string,stored:string){
 try{const [v,it,s,h]=stored.split('$');if(v!=='v1'||it!==String(ITERATIONS)||unbase64(s).length!==24||unbase64(h).length!==32)return false;
  const actual=await hashIndependentPassword(env,plain,unbase64(s));return equal(unbase64(actual.split('$')[3]),unbase64(h));
 }catch{return false;}
}
async function rateLimit(env:IndependentEnv,scope:string,now:number,max:number){
 const k=base64url(await digest(env,'attempt:'+scope)),row=await db(env).prepare(`INSERT INTO independent_attempts(key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count`).bind(k,now+15*60000,now,now).first<{count:number}>();
 if(!row||row.count>max)throw new AccessError('Muitas tentativas. Aguarde 15 minutos e tente novamente.',429);
}
function cookieToken(request:Request){const values=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE+'='));if(values.length!==1)return null;const value=values[0].slice(COOKIE.length+1);return/^[\w-]{43}$/.test(value)?value:null;}
export async function independentUser(env:IndependentEnv,request:Request,now=Date.now()):Promise<IndependentUser|null>{
 const token=cookieToken(request);if(!token)return null;
 return db(env).prepare(`SELECT u.* FROM independent_sessions s JOIN independent_users u ON u.id=s.user_id JOIN house_users h ON h.user_id=u.id AND h.email=u.email WHERE s.digest=? AND s.expires_at>? AND u.active=1 AND h.active=1 AND h.role=u.role`).bind(base64url(await digest(env,'session:'+token)),now).first<IndependentUser>();
}
async function newSession(env:IndependentEnv,userId:string,passwordHash:string,now:number){
 const token=random(),saved=await db(env).prepare('INSERT INTO independent_sessions(digest,user_id,expires_at,created_at) SELECT ?,id,?,? FROM independent_users WHERE id=? AND password_hash=? AND active=1').bind(base64url(await digest(env,'session:'+token)),now+SESSION_MS,now,userId,passwordHash).run();
 if(!saved.meta.changes)throw new AccessError('O acesso mudou. Entre novamente.',409);
 return`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS/1000}`;
}
function redirect(path:string,cookie?:string){const headers=new Headers({'Location':path,'Cache-Control':'private, no-store'});if(cookie)headers.set('Set-Cookie',cookie);return new Response(null,{status:303,headers});}
async function form(request:Request){const url=new URL(request.url);if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')throw new AccessError('Origem não autorizada.',403);if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw new AccessError('Formato inválido.',415);const body=await request.text();if(body.length>12000)throw new AccessError('Solicitação muito grande.',413);return new URLSearchParams(body);}
const ip=(r:Request)=>r.headers.get('CF-Connecting-IP')||'local';
async function configured(env:IndependentEnv){return !!await db(env).prepare('SELECT id FROM independent_setup LIMIT 1').first();}
export function stripIndependentIdentity(request:Request){const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.startsWith('oai-')||key.startsWith('x-galega-auth'))headers.delete(key);return new Request(request,{headers});}
export function withIndependentIdentity(request:Request,user:IndependentUser){const headers=new Headers(request.headers);headers.set('oai-authenticated-user-id',user.id);headers.set('oai-authenticated-user-email',user.email);headers.set('oai-authenticated-user-full-name',encodeURIComponent(user.name));headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');return new Request(request,{headers});}
async function bootstrap(env:IndependentEnv,r:Request,now:number){
 const f=await form(r);await rateLimit(env,'setup:'+ip(r),now,10);
 if(!/^[\w-]{32,128}$/.test(env.SETUP_TOKEN||''))throw new AccessError('Inicialização do acesso pendente.',503);
 if(!equal(await digest(env,'setup:'+String(f.get('setup')||'')),await digest(env,'setup:'+env.SETUP_TOKEN)))throw new AccessError('Código de primeiro acesso inválido.',403);
 const user=username(f.get('username')),fullName=name(f.get('name')),plain=password(f.get('password'));if(plain!==f.get('repeat'))throw new AccessError('As senhas não conferem.');
 const id=crypto.randomUUID(),email=user+'@acesso.galega.invalid',hash=await hashIndependentPassword(env,plain),DB=db(env);
 const result=await DB.batch([
  DB.prepare('INSERT INTO independent_setup(id,created_at) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM independent_setup)').bind(id,now),
  DB.prepare("INSERT INTO independent_users(id,username,email,name,role,password_hash,active,created_at,updated_at) SELECT ?,?,?,?,'admin',?,1,?,? WHERE EXISTS(SELECT 1 FROM independent_setup WHERE id=?)").bind(id,user,email,fullName,hash,now,now,id),
  DB.prepare("INSERT INTO house_users(email,user_id,name,role,active,updated_at) SELECT ?,?,?,'admin',1,? WHERE EXISTS(SELECT 1 FROM independent_setup WHERE id=?)").bind(email,id,fullName,new Date(now).toISOString(),id),
 ]);
 if(!result[0].meta.changes)throw new AccessError('O primeiro acesso já foi criado. Entre com seu usuário.',409);
 return redirect('/',await newSession(env,id,hash,now));
}
async function login(env:IndependentEnv,r:Request,now:number){
 const f=await form(r),raw=String(f.get('username')||'').trim().toLowerCase(),plain=String(f.get('password')||'');
 await rateLimit(env,'ip:'+ip(r),now,30);await rateLimit(env,'user:'+raw.slice(0,40),now,10);
 const user=await db(env).prepare('SELECT * FROM independent_users WHERE username=? AND active=1').bind(raw).first<IndependentUser>();
 const dummy='v1$100000$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
 const valid=await verifyIndependentPassword(env,plain.slice(0,128),user?.password_hash||dummy);
 if(!user||!valid||plain.length>128)throw new AccessError('Usuário ou senha inválidos.',401);
 await db(env).batch([db(env).prepare('DELETE FROM independent_sessions WHERE expires_at<=?').bind(now),db(env).prepare('DELETE FROM independent_attempts WHERE reset_at<=?').bind(now)]);
 return redirect('/',await newSession(env,user.id,user.password_hash,now));
}
async function createUser(env:IndependentEnv,r:Request,actor:IndependentUser,now:number){
 if(actor.role!=='admin')throw new AccessError('Acesso restrito ao responsável.',403);
 const f=await form(r),user=username(f.get('username')),fullName=name(f.get('name')),plain=password(f.get('password')),role=String(f.get('role'));
 if(!roles.includes(role))throw new AccessError('Selecione o perfil do aparelho.');
 if(await db(env).prepare('SELECT id FROM independent_users WHERE username=?').bind(user).first())throw new AccessError('Este usuário já existe.');
 const count=await db(env).prepare('SELECT COUNT(*) n FROM independent_users').first<{n:number}>();if((count?.n||0)>=30)throw new AccessError('Limite de acessos atingido.');
 const id=crypto.randomUUID(),email=user+'@acesso.galega.invalid',hash=await hashIndependentPassword(env,plain);
 await db(env).batch([
  db(env).prepare('INSERT INTO independent_users(id,username,email,name,role,password_hash,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)').bind(id,user,email,fullName,role,hash,now,now),
  db(env).prepare('INSERT INTO house_users(email,user_id,name,role,active,updated_at) VALUES (?,?,?,?,1,?)').bind(email,id,fullName,role,new Date(now).toISOString()),
 ]);return redirect('/acessos?salvo=1');
}
async function changeUser(env:IndependentEnv,r:Request,actor:IndependentUser,now:number){
 if(actor.role!=='admin')throw new AccessError('Acesso restrito ao responsável.',403);
 const f=await form(r),target=await db(env).prepare('SELECT * FROM independent_users WHERE id=?').bind(String(f.get('id')||'')).first<IndependentUser>();
 if(!target||target.role==='admin')throw new AccessError('Acesso inválido.');
 if(f.get('action')==='password'){
  const hash=await hashIndependentPassword(env,password(f.get('password')));await db(env).batch([db(env).prepare('UPDATE independent_users SET password_hash=?,updated_at=? WHERE id=?').bind(hash,now,target.id),db(env).prepare('DELETE FROM independent_sessions WHERE user_id=?').bind(target.id)]);
 }else if(f.get('action')==='active'){
  const active=target.active?0:1;await db(env).batch([db(env).prepare('UPDATE independent_users SET active=?,updated_at=? WHERE id=?').bind(active,now,target.id),db(env).prepare('UPDATE house_users SET active=?,updated_at=? WHERE email=?').bind(active,new Date(now).toISOString(),target.email),db(env).prepare('DELETE FROM independent_sessions WHERE user_id=?').bind(target.id)]);
 }else throw new AccessError('Ação inválida.');
 return redirect('/acessos?salvo=1');
}
async function changeOwnPassword(env:IndependentEnv,r:Request,user:IndependentUser,now:number){
 const f=await form(r),plain=password(f.get('password'));if(plain!==f.get('repeat'))throw new AccessError('As senhas não conferem.');
 if(!await verifyIndependentPassword(env,String(f.get('current')||''),user.password_hash))throw new AccessError('Senha atual inválida.',401);
 const hash=await hashIndependentPassword(env,plain),saved=await db(env).batch([db(env).prepare('UPDATE independent_users SET password_hash=?,updated_at=? WHERE id=? AND password_hash=?').bind(hash,now,user.id,user.password_hash),db(env).prepare('DELETE FROM independent_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM independent_users WHERE id=? AND password_hash=?)').bind(user.id,user.id,hash)]);
 if(!saved[0].meta.changes)throw new AccessError('A senha foi alterada em outro aparelho. Entre novamente.',409);
 return redirect('/minha-conta?salvo=1',await newSession(env,user.id,hash,now));
}
export async function independentAccess(request:Request,env:IndependentEnv,now=Date.now()):Promise<{response?:Response;request?:Request}>{
 const r=stripIndependentIdentity(request),url=new URL(r.url),path=url.pathname;
 try{
  // Only public, non-sensitive brand assets are reachable before login.
  if(r.method==='GET'&&['/logo-galega.png','/app-icon-192.png','/app-icon-512.png','/favicon.ico'].includes(path))return{request:r};
  secret(env);const user=await independentUser(env,r,now);
  if(path==='/signin-with-chatgpt'||path==='/callback')return{response:redirect('/entrar')};
  if(path==='/signout-with-chatgpt')return{response:redirect('/minha-conta')};
  if(path==='/primeiro-acesso'){
   if(await configured(env))return{response:redirect('/entrar')};
   if(r.method==='POST')return{response:await bootstrap(env,r,now)};
   if(r.method!=='GET')throw new AccessError('Método não permitido.',405);
   return{response:authPage('setup')};
  }
  if(path==='/entrar'){
   if(user)return{response:redirect('/')};
   if(!await configured(env))return{response:redirect('/primeiro-acesso')};
   if(r.method==='POST')return{response:await login(env,r,now)};
   if(r.method!=='GET')throw new AccessError('Método não permitido.',405);
   return{response:authPage('login')};
  }
  if(!user){if(path.startsWith('/api/'))return{response:Response.json({error:'Entre com o acesso da Galega.'},{status:401,headers:{'Cache-Control':'private, no-store'}})};return{response:redirect(await configured(env)?'/entrar':'/primeiro-acesso')};}
  if(path==='/sair'){
   if(r.method!=='POST')throw new AccessError('Método não permitido.',405);await form(r);
   const token=cookieToken(r);if(token)await db(env).prepare('DELETE FROM independent_sessions WHERE digest=?').bind(base64url(await digest(env,'session:'+token))).run();
   return{response:redirect('/entrar',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)};
  }
  if(path==='/minha-conta'){
   if(r.method==='POST')return{response:await changeOwnPassword(env,r,user,now)};
   if(r.method!=='GET')throw new AccessError('Método não permitido.',405);
   return{response:authPage('account',{user,success:url.searchParams.has('salvo')})};
  }
  if(path==='/acessos'||path==='/acessos/alterar'){
   if(user.role!=='admin')throw new AccessError('Acesso restrito ao responsável.',403);
   if(r.method==='POST')return{response:path==='/acessos'?await createUser(env,r,user,now):await changeUser(env,r,user,now)};
   if(r.method!=='GET'||path!=='/acessos')throw new AccessError('Método não permitido.',405);
   const users=await db(env).prepare('SELECT id,username,name,role,active FROM independent_users ORDER BY created_at,username LIMIT 30').all<IndependentUser>();
   return{response:authPage('users',{user,users:users.results,success:url.searchParams.has('salvo')})};
  }
  return{request:withIndependentIdentity(r,user)};
 }catch(e){
  const error=e instanceof AccessError?e:new AccessError('Não foi possível abrir o acesso. Confira a conexão e tente novamente.',503);
  if(path.startsWith('/api/'))return{response:Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'private, no-store'}})};
  const page=path==='/primeiro-acesso'?'setup':path==='/entrar'?'login':'error';
  return{response:authPage(page,{error:error.message},error.status)};
 }
}
