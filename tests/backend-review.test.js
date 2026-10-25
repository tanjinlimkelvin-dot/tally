import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './backend-helpers.js';
import {classify} from '../src/ingest.js';
test('negative merchant names and malformed precision do not silently lose or round spending',()=>{
  assert.notEqual(classify({type:'notification',body:'Paid RM 20.00 at Income Cafe'}).status,'ignored');
  assert.equal(classify({type:'notification',body:'Paid RM 20.00 at Shop. Your refund will be credited separately.'}).status,'skipped');
  const malformed=classify({type:'sms',body:'Paid RM 12.345 at Shop'});assert.equal(malformed.status,'skipped');assert.match(malformed.raw,/12\.345/);
});
test('quick endpoint never exposes owner rows to uploader and never guesses partial amounts',async()=>{
 const {mf,request}=await fixture();try{
  await request('/api/auth/setup','POST',{setup_token:'setup-test',password:'review test password safe'});
  await request('/api/entries','POST',{amount:'99',merchant:'Private shop',note:'confidential',client_id:'phone-001'});
  const t=(await request('/api/tokens','POST',{label:'review'})).data.token;
  const headers={Authorization:'Bearer '+t,Cookie:''};
  const q=await request('/api/quick','POST',{amount:'1',client_id:'phone-001'},headers);
  assert.equal(q.status,201);assert.ok(!q.data.entry);assert.ok(!JSON.stringify(q.data).includes('confidential'));
  const r=await request('/api/quick','POST',{text:'RM 1,234.50 laptop',client_id:'laptop'},headers);assert.equal(r.status,201);
  const state=(await request('/api/state')).data;assert.equal(state.entries.find(e=>e.merchant==='laptop').amount_cents,123450);
  assert.equal((await request('/api/quick','POST',{text:'JPY 500 dinner'},headers)).status,422);
  const shop=await request('/api/quick','POST',{text:'7-Eleven RM 12.50'},headers);assert.equal(shop.status,201);
  assert.equal((await request('/api/state')).data.entries.find(e=>e.merchant==='7-Eleven').amount_cents,1250);
 }finally{await mf.dispose();}
});
