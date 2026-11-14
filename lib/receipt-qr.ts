import qrcode from 'qrcode-generator';
import type {KitchenOrder} from './order-state.ts';

export function whatsappLink(phone:string|undefined):string|null{
 let digits=(phone||'').replace(/\D/g,'');
 if(/^\d{10,11}$/.test(digits))digits='55'+digits;
 return /^55[1-9]\d\d{8,9}$/.test(digits)?`https://wa.me/${digits}`:null;
}
export function receiptWhatsappLink(order:KitchenOrder){return order.source==='HOUSE'&&!order.cancelled&&order.status!=='CANCELLED'?whatsappLink(order.phone):null;}
export function qrMatrix(value:string):boolean[][]{
 const code=qrcode(0,'M');code.addData(value);code.make();
 return Array.from({length:code.getModuleCount()},(_,y)=>Array.from({length:code.getModuleCount()},(_,x)=>code.isDark(y,x)));
}
// Raster graphics work on small ESC/POS printers without a native QR command.
// Four quiet modules and integer-sized pixels preserve scan readability.
export function escPosQr(value:string):Uint8Array{
 const matrix=qrMatrix(value),scale=5,quiet=4,pixels=(matrix.length+quiet*2)*scale,stride=Math.ceil(pixels/8),data=new Uint8Array(stride*pixels);
 for(let y=0;y<pixels;y++)for(let x=0;x<pixels;x++){
  const row=Math.floor(y/scale)-quiet,col=Math.floor(x/scale)-quiet;
  if(matrix[row]?.[col])data[y*stride+(x>>3)]|=0x80>>(x%8);
 }
 return new Uint8Array([0x1b,0x61,1,0x1d,0x76,0x30,0,stride&255,stride>>8,pixels&255,pixels>>8,...data,0x0a,0x1b,0x61,0]);
}
