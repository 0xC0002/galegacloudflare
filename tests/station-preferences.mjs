import assert from 'node:assert/strict';
import {readStationPreference,saveStationPreference,initialStationPreference} from '../lib/station-preferences.ts';
const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const initial=(saved,over={})=>initialStationPreference({saved,realRole:'admin',role:'manager',queryProfile:null,sessionProfile:null,sessionName:null,...over});
assert.equal(readStationPreference(storage,'owner'),null);
saveStationPreference(storage,'owner','Tablet da separação','production');
// New app sessions have no sessionStorage. The persisted device choice wins
// even over an old installed/bookmarked URL or a transient profile switch.
const saved=readStationPreference(storage,'owner');assert.deepEqual(initial(saved),{name:'Tablet da separação',profile:'production'});
assert.deepEqual(initial(saved,{queryProfile:'attendant',sessionProfile:'manager',sessionName:'Marcelo'}),{name:'Tablet da separação',profile:'production'});
assert.equal(readStationPreference(storage,'another-account'),null);
assert.equal(initial(saved,{realRole:'attendant',role:'attendant'}).profile,'attendant','device preferences never grant another account a role');
assert.deepEqual(initial(null,{sessionProfile:'production',sessionName:'Separação (teste)'}),{profile:'production',name:'Separação'});
assert.equal(initial(null,{queryProfile:'admin'}).profile,'manager');
values.set('galega-lab-station-preference:owner','malformed');assert.equal(readStationPreference(storage,'owner'),null);
values.set('galega-lab-station-preference:owner',JSON.stringify({version:1,profile:'admin',name:'Wrong'}));assert.equal(readStationPreference(storage,'owner'),null);
assert.throws(()=>saveStationPreference(storage,'owner','Aparelho','admin'));
assert.throws(()=>saveStationPreference({...storage,setItem(){throw Error('quota');}},'owner','Tablet','production'),/não permitiu salvar/);
assert.throws(()=>saveStationPreference({...storage,setItem(){}},'owner','Tablet','production'),/não permitiu salvar/,'silent storage failures must not be presented as a successful save');
console.log('PASS: permanent per-account station preference survives a fresh session, overrides stale install URLs, preserves legacy fallback, rejects corrupt data/role escalation and reports unavailable storage');
