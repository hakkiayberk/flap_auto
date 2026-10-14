import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address, Hex } from 'viem';
import { Engine,protectedOutput,type Network,type Plan,type Prepared } from '../src/engine.js';
import { Journal } from '../src/journal.js';
import { encrypt,decrypt,parseWallets,type Wallet } from '../src/vault.js';
import { authorized } from '../src/telegram.js';
import { amount,integer,type Settings } from '../src/config.js';
const token='0x1111111111111111111111111111111111111111' as Address;
const other='0x2222222222222222222222222222222222222222' as Address;
const wallets:Wallet[]=[{id:'w01',address:'0x3333333333333333333333333333333333333333'},{id:'w02',address:'0x4444444444444444444444444444444444444444'}];
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve};}
function fixture(mode='live'){
  const dir=mkdtempSync(join(tmpdir(),'flap-test-')),file=join(dir,'state.sqlite'),journal=new Journal(file);
  const cfg={mode,amount:10n,slippage:500,maxWallet:20n,maxBatch:40n,maxSession:100n,armMinutes:15,quoteAge:5000} as Settings;
  let signs=0;const sends:Hex[]=[];
  const network:Network={
    refresh:async()=>{},invalidate:()=>{},
    prepare:async(t,ws,a,s)=>({token:t,amount:a,quote:100n,worstQuote:80n,progress:100n,created:Date.now(),rows:ws.map((wallet,i)=>({wallet,nonce:i,gas:100n,gasPrice:1n,minOut:protectedOutput(80n,s),data:'0x' as Hex}))}),
    sign:async r=>{signs++;return {raw:`0x0${r.nonce+1}` as Hex,hash:`0x${String(r.nonce+1).padStart(64,'0')}` as Hex};},
    broadcast:async(raw)=>{sends.push(raw);},
  };
  const engine=new Engine(cfg,wallets,network,journal);if(mode==='live')engine.arm();
  return {dir,file,journal,network,engine,sends,get signs(){return signs;},cleanup(){journal.close();rmSync(dir,{recursive:true,force:true});}};
}
test('dry-run never signs, broadcasts, or reserves token',async()=>{
  const f=fixture('dry-run');try{assert.match(await f.engine.buy(token,()=>{}),/DRY RUN/);assert.equal(f.signs,0);assert.equal(f.sends.length,0);assert.equal(f.journal.seen(token),false);}finally{f.cleanup();}
});
test('all broadcasts start before any completes; journal already durable',async()=>{
  const f=fixture(),gate=deferred<void>();try{
    f.network.broadcast=async raw=>{assert.equal(f.journal.pending().length,2);f.sends.push(raw);await gate.promise;};
    const buy=f.engine.buy(token,()=>{});await new Promise(r=>setTimeout(r,30));assert.equal(f.sends.length,2);gate.resolve();await buy;
    assert.equal(f.engine.spent,20n);assert.equal(f.journal.pending().length,2);
    await assert.rejects(f.engine.buy(token,()=>{}),/İkinci alım/);
    const reopened=new Journal(f.file);assert.ok(reopened.seen(token));assert.equal(reopened.pending().length,2);reopened.close();
  }finally{f.cleanup();}
});
test('stop while signing prevents all broadcasts and reservations',async()=>{
  const f=fixture(),gate=deferred<void>(),original=f.network.sign;try{
    f.network.sign=async row=>{await gate.promise;return original(row,10n);};const buy=f.engine.buy(token,()=>{});
    await new Promise(r=>setTimeout(r,20));f.engine.stop();gate.resolve();await assert.rejects(buy,/durduruldu/);
    assert.equal(f.sends.length,0);assert.equal(f.journal.seen(token),false);
  }finally{f.cleanup();}
});
test('ambiguous RPC timeout locks wallets and never auto-retries',async()=>{
  const f=fixture();try{
    f.network.broadcast=async()=>{throw new Error('timeout');};await f.engine.buy(token,()=>{});
    assert.equal(f.journal.pending().length,2);assert.equal(f.journal.pending()[0].status,'unknown');
    await assert.rejects(f.engine.buy(other,()=>{}),/belirsiz/);assert.equal(f.signs,2);
  }finally{f.cleanup();}
});
test('concurrent command cannot allocate duplicate nonce',async()=>{
  const f=fixture(),gate=deferred<void>(),original=f.network.prepare;try{
    f.network.prepare=async(...a)=>{await gate.promise;return original(...a);};const buy=f.engine.buy(token,()=>{});
    await assert.rejects(f.engine.buy(other,()=>{}),/Başka bir işlem/);gate.resolve();await buy;
  }finally{f.cleanup();}
});
test('stale quote and spending limits block sending',async()=>{
  const f=fixture(),original=f.network.prepare;try{
    f.network.prepare=async(...a)=>({...await original(...a),created:Date.now()-6000});await assert.rejects(f.engine.buy(token,()=>{}),/eskidi/);assert.equal(f.sends.length,0);
    f.engine.amount=30n;await assert.rejects(f.engine.buy(token,()=>{}),/limiti/);
    f.engine.amount=10n;f.engine.spent=90n;await assert.rejects(f.engine.buy(token,()=>{}),/harcama/);
  }finally{f.cleanup();}
});
test('authenticated encryption rejects wrong password and tampering',()=>{
  const p=encrypt([{id:'w01',privateKey:'secret'}],'long password 123');assert.deepEqual(decrypt(p,'long password 123'),[{id:'w01',privateKey:'secret'}]);
  assert.throws(()=>decrypt(p,'wrong password'));assert.throws(()=>decrypt({...p,tag:'0'.repeat(32)},'long password 123'));
});
test('input, wallet duplicates, and Telegram authorization are strict',()=>{
  assert.equal(amount('0.005'),5000000000000000n);for(const s of ['0','-1','NaN','1e2','0,5','01'])assert.throws(()=>amount(s));
  assert.throws(()=>integer('500.1',1,3000));assert.throws(()=>parseWallets([wallets[0],wallets[0]],false));
  assert.equal(protectedOutput(1000n,500),950n);assert.throws(()=>protectedOutput(1n,500));
  const u={update_id:1,message:{date:1,text:token,from:{id:123},chat:{id:123,type:'private'}}};assert.ok(authorized(u,123));
  assert.equal(authorized(u,999),false);assert.equal(authorized({...u,message:{...u.message,chat:{id:-123,type:'group'}}},123),false);
});
