"use client";
import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export default function InstallApp() {
 const prompt = useRef<InstallPrompt | null>(null), dialog = useRef<HTMLDialogElement>(null);
 const [installed, setInstalled] = useState(false), [opened, setOpened] = useState(false);
 useEffect(() => {
  const media = matchMedia("(display-mode: standalone)");
  const check = () => setInstalled(media.matches);
  const ready = (event: Event) => { event.preventDefault(); prompt.current = event as InstallPrompt; };
  const complete = () => { prompt.current = null; setInstalled(true); setOpened(false); };
  check(); media.addEventListener("change", check); window.addEventListener("beforeinstallprompt", ready); window.addEventListener("appinstalled", complete);
  return () => { media.removeEventListener("change", check); window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", complete); };
 }, []);
 useEffect(() => { if (opened) dialog.current?.showModal(); }, [opened]);
 async function install() {
  const event = prompt.current;
  if (!event) { setOpened(true); return; }
  prompt.current = null;
  try { await event.prompt(); const choice = await event.userChoice; if (choice.outcome === "accepted") setInstalled(true); }
  catch { setOpened(true); }
 }
 if (installed) return null;
 return <>
  <button className="button" onClick={() => void install()}><Download size={15}/>Instalar app</button>
  {opened && <dialog ref={dialog} className="cancel-dialog" aria-labelledby="install-title" onCancel={e => { e.preventDefault(); setOpened(false); }}>
   <div className="dialog-title"><h2 id="install-title">Galega no tablet</h2><button className="icon-button" aria-label="Fechar instruções de instalação" onClick={() => setOpened(false)}><X size={20}/></button></div>
   <p>Abra este sistema diretamente no Chrome do tablet. No menu de três pontos, escolha <strong>Adicionar à tela inicial → Instalar aplicativo</strong>. Se aparecer somente <strong>Criar atalho</strong>, use essa opção.</p>
   <p>O ícone abre a Galega diretamente. A conta continua protegendo o acesso e a operação precisa de internet.</p>
   <div className="dialog-actions"><button className="button" onClick={() => setOpened(false)}>Entendi</button></div>
  </dialog>}
 </>;
}
