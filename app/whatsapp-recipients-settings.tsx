"use client";
import {useEffect,useState} from 'react';
import {Trash2,Plus} from 'lucide-react';
import {appJson} from '@/lib/client-api';
type Recipient={phone:string;name:string;displayPhone:string};
type Status={revision:number;limit:number;recipients:Recipient[]};
export function WhatsappRecipientsSettings(){
 const [s,setStatus]=useState<Status|null>(null),[name,setName]=useState(''),[phone,setPhone]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;const load=()=>appJson<Status>('/api/settings/whatsapp/recipients').then(v=>{if(live)setStatus(v);}).catch(e=>{if(live)setError(e.message);});void load();const timer=setInterval(()=>{if(!document.hidden)void load();},6000);return()=>{live=false;clearInterval(timer);};},[]);
 async function change(body:Record<string,unknown>){if(!s)return;setBusy(true);setError('');try{setStatus(await appJson<Status>('/api/settings/whatsapp/recipients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,revision:s.revision})}));return true;}catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar a lista.');try{setStatus(await appJson<Status>('/api/settings/whatsapp/recipients'));}catch{}return false;}finally{setBusy(false);}}
 return <section className="whatsapp-recipient-settings" aria-label="Entregadores no WhatsApp"><h3>Entregadores no WhatsApp</h3>
 {s?<><p>Todos os números da lista recebem os novos pedidos de entrega da Casa.</p>
 <ul className="whatsapp-recipient-list">{s.recipients.map(r=><li key={r.phone}><div>{r.name&&<strong>{r.name}</strong>}<span>{r.displayPhone}</span></div><button className="icon-button" type="button" disabled={busy} aria-label={`Remover ${r.name||r.displayPhone}`} title="Remover entregador" onClick={()=>void change({op:'remove',phone:r.phone})}><Trash2 size={19}/></button></li>)}</ul>
 {!s.recipients.length&&<p role="status">Nenhum entregador cadastrado. Os envios estão sem destinatário.</p>}
 <form onSubmit={async e=>{e.preventDefault();if(await change({op:'add',name,phone,consent})){setName('');setPhone('');setConsent(false);}}}><fieldset disabled={busy||s.recipients.length>=s.limit}>
 <label className="field">Nome<input value={name} maxLength={60} autoComplete="off" onChange={e=>setName(e.target.value)}/></label>
 <label className="field">WhatsApp com DDD<input required type="tel" inputMode="tel" value={phone} maxLength={40} autoComplete="off" placeholder="(21) 99999-9999" onChange={e=>setPhone(e.target.value)}/></label>
 <label className="whatsapp-consent"><input required type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Este entregador autorizou receber os pedidos.</label>
 <button className="button" type="submit"><Plus size={17}/>{busy?'Salvando…':'Adicionar entregador'}</button>
 </fieldset></form>
 <p className="whatsapp-help">Teste: até {s.limit} números. Cada número também precisa ser adicionado e verificado em Meta → Configuração da API → Destinatários. Adicionar aqui não faz essa liberação.</p>
 </>:<p>Carregando entregadores…</p>}{error&&<p className="error" role="alert">{error}</p>}</section>;
}
