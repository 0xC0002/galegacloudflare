import {cleanSearch,type HouseItem} from './house-state.ts';

export const flavorKinds=['SALGADOS','CHURROS'] as const;
export type FlavorKind=typeof flavorKinds[number];
export type HouseFlavorCatalog={kind:FlavorKind;names:string[];revision:number};
export const defaultFlavors:Record<FlavorKind,string[]>={
 SALGADOS:['Bolinha de queijo','Travesseiro de pizza','Coxinha','Croquete de carne assada','Salsicha','Queijo com alho','Kibe'],
 CHURROS:['Doce de leite','Chocolate']
};
export function flavorKind(product:string):FlavorKind|null{const n=cleanSearch(product);return n.includes('churro')?'CHURROS':n.includes('salgad')?'SALGADOS':null;}
export function equalFlavorQuantities(quantity:number,count:number):number[]|null{
 if(!Number.isFinite(quantity)||quantity<=0||!Number.isInteger(count)||count<1)return null;
 const scale=Number.isInteger(quantity)?1:1000,units=Math.round(quantity*scale);
 if(units<count)return null;
 const base=Math.floor(units/count),extra=units%count;
 return Array.from({length:count},(_,i)=>(base+(i<extra?1:0))/scale);
}
export function mergeFlavors(flavors:HouseItem['flavors']):HouseItem['flavors']{
 const result:HouseItem['flavors']=[],known=new Map<string,number>();
 for(const flavor of flavors){const name=flavor.name.trim(),key=cleanSearch(name),index=known.get(key);if(index===undefined){known.set(key,result.length);result.push({name,quantity:flavor.quantity});}else result[index].quantity=Math.round((result[index].quantity+flavor.quantity)*1000)/1000;}
 return result;
}

// Keep a natural decimal entry while typing; group thousands only on blur.
// Typing 63 or 63,00 therefore produces the same value, without appending to 0,00.
export function moneyInput(value:string):string{
 const negative=value.includes('-');
 let v=value.replace(/[^\d.,]/g,'');
 if(v.includes(',')){const [whole,...fraction]=v.replace(/\./g,'').split(',');v=whole+','+fraction.join('').slice(0,2);}
 else if(v.includes('.')){if(/^\d{1,3}(?:\.\d{3})+$/.test(v))v=v.replace(/\./g,'');else{const [whole,...fraction]=v.split('.');v=whole+','+fraction.join('').slice(0,2);}}
 v=v.replace(/^0+(?=\d)/,'');if(v.startsWith(','))v='0'+v;
 return(negative?'-':'')+v;
}
export function moneyCents(value:string):number|null{
 const v=value.replace(/\./g,'');if(!/^\d+(?:,\d{0,2})?$/.test(v))return null;
 const [whole,fraction='']=v.split(','),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return Number.isSafeInteger(cents)&&cents>=0&&cents<=100_000_000?cents:null;
}
export const formatMoneyInput=(cents:number)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
