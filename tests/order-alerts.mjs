import assert from 'node:assert/strict';
import { collectOrderArrivals, createOrderAlertState } from '../lib/order-alerts.ts';

const now = Date.now();
const order = (id, overrides = {}) => ({ id, displayId:id, status:'CONFIRMED', cancelled:false, kitchenStage:'WAITING', timing:'IMMEDIATE', preparationStart:'', ...overrides });
const state = createOrderAlertState();
const old = order('antigo');
const ids = arrivals => ({ counter:arrivals.counter.map(o=>o.id), kitchen:arrivals.kitchen.map(o=>o.id) });
const check = orders => ids(collectOrderArrivals(state, orders));
const none = {counter:[],kitchen:[]};

assert.deepEqual(check([old,order('concluido',{status:'CONCLUDED'}),order('cancelado',{status:'CANCELLED'})]),none,'opening a screen must not ring for existing orders or history');
const a = order('A',{status:'PLACED'});
assert.deepEqual(check([old,a]),{counter:['A'],kitchen:['A']},'both screens must be alerted on arrival, including a PLACED order that is not visible in the separation queue yet');
assert.deepEqual(check([old,{...a,status:'CONFIRMED'}]),none,'confirmation must not ring again after the arrival alert');
assert.deepEqual(check([old,{...a,status:'PREPARING'}]),none,'status updates and repeated snapshots must not ring again');
assert.deepEqual(check([old,{...a,status:'PREPARING'}]),none);

const b = order('B',{status:'PREPARING'}), c = order('C');
assert.deepEqual(check([old,b,c]),{counter:['B','C'],kitchen:['B','C']},'several new auto-confirmed orders are detected as a single batch on either screen');
assert.deepEqual(check([old,{...b,kitchenStage:'SEPARATED'},c]),none,'marking separated must not create a second alert');
assert.deepEqual(check([old,b,c]),none,'switching screens or returning to an already seen order must not create a new alert');
assert.deepEqual(check([old,order('entregue',{status:'DISPATCHED'}),order('cancelado-antes',{status:'CANCELLED'}),order('flag-cancelado',{cancelled:true})]),none,'cancelled and dispatched orders must not trigger an arrival alert');

const scheduled = order('agendado',{timing:'SCHEDULED',preparationStart:new Date(now+60_000).toISOString()});
assert.deepEqual(check([old,scheduled]),{counter:['agendado'],kitchen:['agendado']},'scheduled orders also announce arrival on both screens');
assert.deepEqual(check([old,{...scheduled,preparationStart:new Date(now-60_000).toISOString()}]),none,'reaching preparation time must not repeat the arrival alert');
assert.deepEqual(check([old,scheduled]),none);
const missingTime = order('sem-horario',{timing:'SCHEDULED',preparationStart:''});
assert.deepEqual(check([old,missingTime]),{counter:['sem-horario'],kitchen:['sem-horario']},'arrival notification is independent of preparation eligibility');

console.log('PASS: immediate arrival alert on both screens, no confirmation/status duplicates, automatic confirmation, batches, terminal history and scheduled arrivals');
