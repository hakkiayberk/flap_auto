import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, encodeFunctionResult, zeroAddress, zeroHash, parseTransaction, keccak256, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { BscNetwork } from '../src/network.js';
import { portalAbi,PORTAL } from '../src/abi.js';
import type { Settings } from '../src/config.js';
const token='0x1111111111111111111111111111111111111111';
const account=privateKeyToAccount(`0x${'1'.repeat(64)}`),wallets=[{id:'w01',address:account.address,account}];
const state={status:1,reserve:100n,circulatingSupply:100n,price:1n,tokenVersion:0,r:1n,h:1n,k:1n,dexSupplyThresh:1000000n,quoteTokenAddress:zeroAddress,nativeToQuoteSwapEnabled:false,extensionID:zeroHash,buyTaxRate:0n,sellTaxRate:0n,pool:zeroAddress,progress:100n,lpFeeProfile:0,dexId:0};
test('real viem adapter encodes tuples, simulates, signs chain/value and broadcasts identical bytes',async()=>{
  const original=globalThis.fetch;let calls:string[]=[],status=1,extension=zeroHash,threshold=1000000000n;
  const sent:Hex[]=[];
  globalThis.fetch=async (_input,init)=>{
    const body=JSON.parse(String(init?.body));calls.push(body.method);let result:any;
    switch(body.method){
      case 'eth_chainId':result='0x38';break;
      case 'eth_getCode':result='0x6000';break;
      case 'eth_gasPrice':result='0x3b9aca00';break;
      case 'eth_getBalance':result='0xde0b6b3a7640000';break;
      case 'eth_getTransactionCount':result='0x7';break;
      case 'eth_getBlockByNumber':result={number:'0x10',timestamp:`0x${Math.floor(Date.now()/1000).toString(16)}`,hash:zeroHash,transactions:[]};break;
      case 'eth_call':{
        const d=decodeFunctionData({abi:portalAbi,data:body.params[0].data});
        if(d.functionName==='getTokenV8Safe')result=encodeFunctionResult({abi:portalAbi,functionName:d.functionName,result:{...state,status,extensionID:extension,dexSupplyThresh:threshold}});
        else {assert.equal(d.functionName,'quoteExactInput');assert.equal(d.args[0].inputToken,zeroAddress);result=encodeFunctionResult({abi:portalAbi,functionName:'quoteExactInput',result:d.args[0].inputAmount*1000n});}
        assert.equal(body.params[1],'0x10');break;
      }
      case 'eth_estimateGas':{
        const d=decodeFunctionData({abi:portalAbi,data:body.params[0].data});assert.equal(d.functionName,'swapExactInput');if(d.functionName==='swapExactInput'){assert.ok(d.args[0].minOutputAmount>0n);assert.equal(d.args[0].permitData,'0x');}result='0x186a0';break;
      }
      case 'eth_sendRawTransaction':sent.push(body.params[0]);result=keccak256(body.params[0]);break;
      default:throw new Error(`Unexpected RPC ${body.method}`);
    }
    return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{headers:{'Content-Type':'application/json'}});
  };
  try{
    const cfg={urls:['https://mock-primary.invalid','https://mock-secondary.invalid'],cacheAge:15000,quoteAge:5000,gasCap:5000000000n,reserve:1n} as Settings;
    const net=new BscNetwork(cfg);await net.verify();await net.refresh(wallets);const p=await net.prepare(token,wallets,1000n,500);
    assert.equal(p.rows[0].minOut,950000n);assert.equal(calls.includes('eth_sendRawTransaction'),false);
    const signed=await net.sign(p.rows[0],p.amount),parsed=parseTransaction(signed.raw);
    assert.equal(parsed.chainId,56);assert.equal(parsed.to?.toLowerCase(),PORTAL.toLowerCase());assert.equal(parsed.value,1000n);assert.equal(parsed.nonce,7);assert.equal(parsed.gas,125000n);
    await net.broadcast(signed.raw,signed.hash);assert.equal(sent.length,2);assert.ok(sent.every(s=>s===signed.raw));
    status=4;await assert.rejects(net.prepare(token,wallets,1000n,500),/DEX/);status=1;
    extension=`0x${'1'.repeat(64)}`;await assert.rejects(net.prepare(token,wallets,1000n,500),/extensionsız/);extension=zeroHash;
    threshold=500n;await assert.rejects(net.prepare(token,wallets,1000n,500),/graduation/);threshold=1000000000n;
    net.invalidate(wallets);await assert.rejects(net.prepare(token,wallets,1000n,500),/önbelleği/);
  }finally{globalThis.fetch=original;}
});
