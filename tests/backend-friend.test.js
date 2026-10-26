import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './backend-helpers.js';
import {classify} from '../src/ingest.js';
test('real Alliance RM0 prefix is not its charge amount; multilingual notification keeps merchant',()=>{
  const c=classify({type:'sms',text:'RM0 AllianceBank: Virtual Credit Card charged for MYR 88.00 at DECATHLON MALAYSIA on 251026@12:00. Call bank if not authorised.',at:'2026-10-25T12:00:00+08:00'});
  assert.equal(c.v.amount_cents,8800);assert.equal(c.v.merchant,'DECATHLON MALAYSIA');
});
test('learn category, human reply, telemetry, ignored passes do not suppress paid transactions',async()=>{
  const {mf,request}=await fixture();try{
    assert.equal((await request('/api/auth/setup','POST',{setup_token:'setup-test',password:'a safe testing password'})).status,200);
    const c=await request('/api/entries','POST',{amount:'9.90',merchant:'Tealive','category':'food'});assert.equal(c.status,201);
    const id=crypto.randomUUID();
    const r=await request('/api/ingest','POST',{event_id:id,type:'notification',title:'Payment successful',body:'You have paid RM 8.90 to Tealive.',at:'2026-10-25T12:00:00+08:00'});
    assert.match(r.data.message,/^Logged/);
    const st=(await request('/api/state')).data;assert.equal(st.entries.find(x=>x.client_id==='event:'+id).category,'food');assert.ok(st.ingest.last_at);assert.ok(st.ingest.bytes);
    const missing=await request('/api/ingest','POST',{event_id:crypto.randomUUID(),type:'applepay',merchant:'My key',at:'2026-10-25T12:01:00+08:00'});
    let e=(await request('/api/state')).data.entries.find(x=>x.merchant==='My key');
    assert.equal((await request(`/api/entries/${e.id}/not-payment`,'POST',{version:e.version})).status,200);
    const pay=await request('/api/ingest','POST',{event_id:crypto.randomUUID(),type:'applepay',merchant:'My key',amount:'12.50',at:'2026-10-25T12:02:00+08:00'});
    assert.equal(pay.data.accepted,1);
    // Beginner-friendly payload: no event_id, no at
    const beginnerPay=await request('/api/ingest','POST',{type:'applepay',merchant:'Kopi Station',amount:'6.50'});
    assert.equal(beginnerPay.data.accepted,1);
    assert.match(beginnerPay.data.message,/^Logged RM ?6\.50/);
    const skip=await request('/api/ingest','POST',{event_id:crypto.randomUUID(),type:'notification',title:'Cash In Successful',body:'RM23.99 to GO+',at:'2026-10-25T12:03:00+08:00'});
    assert.match(skip.data.message,/^Skipped/);
    const dup=await request('/api/ingest','POST',{event_id:id,type:'notification',body:'You have paid RM 8.90 to Tealive.'});assert.match(dup.data.message,/^Synced/);
  }finally{await mf.dispose();}
});
