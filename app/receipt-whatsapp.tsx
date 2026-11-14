import {qrMatrix,receiptWhatsappLink} from '@/lib/receipt-qr';
import type {KitchenOrder} from '@/lib/order-state';
export function ReceiptWhatsapp({order}:{order:KitchenOrder}){
 const link=receiptWhatsappLink(order);if(!link)return null;
 const matrix=qrMatrix(link),size=matrix.length+8;
 const path=matrix.flatMap((row,y)=>row.flatMap((dark,x)=>dark?[`M${x+4},${y+4}h1v1h-1z`]:[])).join('');
 return <figure className="receipt-whatsapp"><figcaption>WhatsApp do cliente</figcaption><svg role="img" aria-label="QR Code para conversar com o cliente no WhatsApp" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges"><rect width={size} height={size} fill="#fff"/><path d={path} fill="#000"/></svg></figure>;
}
