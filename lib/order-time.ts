export function orderDateTime(value:string) {
 return Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"}).format(new Date(value)) : "Horário a verificar";
}
