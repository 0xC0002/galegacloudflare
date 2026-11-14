type Outcome = "success" | "http_error" | "network_error" | "timeout";

export function ifoodOperation(path: string) {
 const pathname=path.split("?")[0];
 if(pathname==="/authentication/v1.0/oauth/token")return "authentication";
 if(/\/events:polling$/.test(pathname))return "events.polling";
 if(/\/events\/acknowledgment$/.test(pathname))return "events.acknowledgment";
 if(/\/orders\/[^/]+$/.test(pathname))return "order.details";
 const action=pathname.match(/\/orders\/[^/]+\/(confirm|startPreparation|readyToPickup|dispatch|requestCancellation|cancellationReasons)$/)?.[1];
 if(action)return `order.${action}`;
 if(/\/cancellationEvidences\/[^/]+$/.test(pathname))return "order.evidence";
 if(/\/disputes\/[^/]+\/alternatives\/[^/]+$/.test(pathname))return "dispute.alternative";
 if(/\/disputes\/[^/]+\/(accept|reject)$/.test(pathname))return "dispute.reply";
 return "other";
}

// Only controlled labels enter the log. Never include paths, IDs, headers, bodies or upstream errors.
export function requestTrace(path:string,method="GET",options:{enabled?:boolean;clock?:()=>number;write?:(line:string)=>void}={}) {
 if(options.enabled===false)return (_status:number|null,_outcome:Outcome)=>{};
 const clock=options.clock||(()=>performance.now()),write=options.write||((line:string)=>console.info(line));
 const started=clock(),at=new Date().toISOString(),requestId=crypto.randomUUID(),operation=ifoodOperation(path);
 const verb=["GET","POST","PUT","PATCH","DELETE"].includes(method.toUpperCase())?method.toUpperCase():"OTHER";
 let finished=false;
 return (status:number|null,outcome:Outcome)=>{
  if(finished)return;finished=true;
  const elapsed=clock()-started;
  try{write(JSON.stringify({event:"ifood_request",level:outcome==="success"?"info":"warn",at,requestId,operation,method:verb,status,durationMs:Number.isFinite(elapsed)?Math.max(0,Math.round(elapsed)):null,outcome}));}catch{/* Diagnostics must never change the result of a business operation. */}
 };
}
