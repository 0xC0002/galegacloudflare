"use client";
import {useEffect,useRef,useState} from 'react';
import {appJson} from '@/lib/client-api';
import {requestId} from '@/lib/request-id';
type Status={destination:string|null;status:string;sender:string|null;phoneId:string;enabled:boolean;protected:boolean;recipients:{phone:string;name:string;displayPhone:string}[];jobs:{id:string;recipientPhone:string|null;recipientName:string|null;order:string;customer:string;state:string;acceptedByMeta:boolean;sentParts:number;totalParts:number;error:string|null;updatedAt:string}[]};
const labels:Record<string,string>={QUEUED:'Aguardando envio',SENDING:'Enviando',SENT:'Enviado à Meta',BLOCKED:'Envio recusado',REVIEW:'Conferir no WhatsApp'};
export function WhatsappSettings(){
 const [s,setStatus]=useState<Status|null>(null),[phoneId,setPhoneId]=useState(''),[token,setToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState(false),[recipient,setRecipient]=useState('');
 const sample=useRef(requestId());
 useEffect(()=>{sample.current=requestId();},[recipient]);
 useEffect(()=>{let live=true;const load=()=>appJson<Status>('/api/settings/whatsapp').then(v=>{if(live){setStatus(v);setPhoneId(current=>current||v.phoneId);setRecipient(current=>v.recipients.some(r=>r.phone===current)?current:v.recipients[0]?.phone||'');}}).catch(e=>{if(live)setError(e.message);});void load();const timer=setInterval(()=>{if(!document.hidden)void load();},6000);return()=>{live=false;clearInterval(timer);};},[]);
 async function send(body:unknown){setBusy(true);setError('');try{const v=await appJson<Status>('/api/settings/whatsapp',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});setStatus(v);setPhoneId(v.phoneId);return true;}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.');return false;}finally{setBusy(false);}}
 return <section className="whatsapp-test-settings" aria-label="WhatsApp de entregas"><h3>WhatsApp de entregas</h3>{s?<>

  <p role="status">{s.status==='connected'?`Meta conectada · ${s.sender}`:'Meta não conectada'}</p>
  {s.status==='connected'&&<p><strong>{s.enabled?'Avisos automáticos de teste ligados':'Avisos automáticos pausados'}</strong></p>}
  {(s.status!=='connected'||editing)?<form onSubmit={async e=>{e.preventDefault();const ok=await send({op:'connect',phoneId,token});setToken('');if(ok)setEditing(false);}} autoComplete="off"><fieldset disabled={busy||!s.protected}>
   <label className="field">ID do número da Meta<input required inputMode="numeric" maxLength={30} value={phoneId} onChange={e=>setPhoneId(e.target.value)} autoComplete="off"/></label>
   <label className="field">Token da Meta<input type="password" required value={token} maxLength={4096} onChange={e=>setToken(e.target.value)} autoComplete="off" spellCheck={false}/></label>
   <button className="button primary" disabled={busy}>{busy?'Validando…':'Conectar Meta'}</button>
   {editing&&<button type="button" className="button" onClick={()=>{setEditing(false);setToken('');}}>Voltar</button>}
  </fieldset></form>:<div className="whatsapp-actions">
   <button className="button" disabled={busy} onClick={()=>setEditing(true)}>Atualizar conexão</button>
   <label className="field">Destinatário do teste<select aria-label="Destinatário do teste" value={recipient} disabled={busy||!s.recipients.length} onChange={e=>setRecipient(e.target.value)}>{!s.recipients.length&&<option value="">Cadastre um entregador</option>}{s.recipients.map(r=><option key={r.phone} value={r.phone}>{r.name?r.name+' · ':''}{r.displayPhone}</option>)}</select></label>
   <button className="button" disabled={busy||!recipient||s.jobs.some(j=>j.id==='sample:'+sample.current)} onClick={()=>void send({op:'sample',requestId:sample.current,recipientPhone:recipient})}>{busy?'Enviando…':'Enviar pedido fictício'}</button>
   <button className={`button ${s.enabled?'':'primary'}`} disabled={busy} onClick={()=>void send({op:'enabled',enabled:!s.enabled})}>{s.enabled?'Pausar avisos':'Ativar avisos de teste'}</button>
  </div>}
  {!s.protected&&<p role="alert">Proteção das credenciais pendente.</p>}
  <p className="whatsapp-help">Teste: responda à conversa da Meta para permitir texto livre por 24 horas. Os avisos são processados com uma tela do laboratório aberta.</p>
  {s.jobs.length>0&&<div className="whatsapp-jobs"><h4>Últimos avisos</h4>{s.jobs.map(j=><article key={j.id}><strong>{j.order} · {j.customer}</strong><small>Para: {j.recipientName||j.recipientPhone||'Destino anterior'}</small><span>{j.state==='SENT'&&!j.acceptedByMeta?'Confirmado no WhatsApp':j.state==='QUEUED'&&j.sentParts>0?`Enviando · ${j.sentParts}/${j.totalParts}`:labels[j.state]||j.state}</span>{j.error&&<p role="alert">{j.error}</p>}{['BLOCKED','REVIEW'].includes(j.state)&&<div className="whatsapp-actions">{j.state==='REVIEW'&&<button className="button" disabled={busy} onClick={()=>void send({op:'resolve',id:j.id,action:'received'})}>Já recebi no WhatsApp</button>}<button className="button" disabled={busy} onClick={()=>{if(j.state==='BLOCKED'||confirm('Confirme que este aviso não chegou ao WhatsApp. Repetir o envio?'))void send({op:'resolve',id:j.id,action:'retry'});}}>Tentar novamente</button></div>}</article>)}</div>}
 </>:<p>Consultando configuração…</p>}{error&&<p className="error" role="alert">{error}</p>}</section>;
}
