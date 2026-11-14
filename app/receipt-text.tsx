import type {KitchenOrder} from '@/lib/order-state';
import {receiptText,houseFreezerNotice,houseFreezerFooter,isHouseCancellation} from '@/lib/receipt';
import {ReceiptWhatsapp} from './receipt-whatsapp';
export function HouseReceiptText({order}:{order:KitchenOrder}){
 const footer=houseFreezerFooter(order),text=receiptText(order),body=footer?text.slice(0,text.lastIndexOf('\n\n!\n')):text,lines=body.split('\n'),notice=houseFreezerNotice(order);
 if(isHouseCancellation(order))return <pre className="receipt-cancellation">{text}</pre>;
 return <><pre>{lines[0]+'\n'}{notice.length>0&&<strong className="receipt-freezer-notice">{lines.slice(1,1+notice.length).join('\n')+'\n'}</strong>}{lines.slice(1+notice.length).join('\n')}</pre><ReceiptWhatsapp order={order}/>{footer&&<div className="receipt-freezer-footer"><b aria-label="Aviso importante">!</b><strong>{footer}</strong></div>}</>;
}
