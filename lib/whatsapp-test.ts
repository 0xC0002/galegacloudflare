export function whatsappTestStatus(env:{WHATSAPP_TEST_TO?:string}){
 const digits=(env.WHATSAPP_TEST_TO||'').replace(/\D/g,''),local=digits.length===13&&digits.startsWith('55')?digits.slice(2):digits;
 const valid=/^[1-9]\d9\d{8}$/.test(local);
 return{destination:valid?`(${local.slice(0,2)}) ${local.slice(2,7)}-${local.slice(7)}`:null,status:'not_connected' as const};
}
