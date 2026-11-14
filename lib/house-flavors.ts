import {HouseError,type HouseActor} from './house-state.ts';
import {requireHouseRole} from './house-auth.ts';
import {defaultFlavors,flavorKinds,type HouseFlavorCatalog} from './house-editor.ts';

export async function readHouseFlavorCatalogs(_DB:D1Database):Promise<HouseFlavorCatalog[]>{
 // The store's fixed list replaces early editable catalogs without rewriting
 // saved orders or deleting legacy data. Availability is chosen per order.
 return flavorKinds.map(kind=>({kind,names:[...defaultFlavors[kind]],revision:0}));
}
export async function saveHouseFlavorCatalog(_DB:D1Database,actor:HouseActor,_input:any):Promise<HouseFlavorCatalog>{
 requireHouseRole(actor,['admin','manager','attendant']);
 // Give an already-open older editor an explicit response, rather than silently
 // accepting a catalog change that the new fixed-list editor will not display.
 throw new HouseError('Os sabores já estão definidos. Atualize a página e selecione os disponíveis no pedido.',409);
}
