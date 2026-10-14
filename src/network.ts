import { createPublicClient, http, encodeFunctionData, decodeFunctionResult, zeroAddress, zeroHash, keccak256, type Address, type Hex } from 'viem';
import { bsc } from 'viem/chains';
import { portalAbi, PORTAL } from './abi.js';
import type { Settings } from './config.js';
import type { Wallet } from './vault.js';
import { protectedOutput, type Network, type Plan, type Prepared } from './engine.js';
import type { Journal } from './journal.js';
type Cached={balance:bigint;nonce:number;time:number};
export class BscNetwork implements Network {
  clients; primary;cache=new Map<Address,Cached>();gasPrice=0n;gasTime=0;
  constructor(public cfg:Settings){
    this.clients=cfg.urls.map(url=>createPublicClient({chain:bsc,transport:http(url,{timeout:4000,retryCount:0})}));this.primary=this.clients[0];
  }
  async verify(){
    await Promise.all(this.clients.map(async c=>{if(await c.getChainId()!==56)throw new Error('RPC BSC chain 56 olmalı.');const code=await c.getCode({address:PORTAL});if(!code || code==='0x')throw new Error('Portal kontratı bulunamadı.');}));
  }
  invalidate(wallets:Wallet[]){for(const w of wallets)this.cache.delete(w.address);}
  async refresh(wallets:Wallet[]){
    try{
      const [gas,rows]=await Promise.all([
        this.primary.getGasPrice(),
        Promise.all(wallets.map(async w=>{const [balance,nonce]=await Promise.all([this.primary.getBalance({address:w.address,blockTag:'pending'}),this.primary.getTransactionCount({address:w.address,blockTag:'pending'})]);return {address:w.address,balance,nonce,time:Date.now()};})),
      ]);
      this.gasPrice=gas;this.gasTime=Date.now();this.cache=new Map(rows.map(r=>[r.address,r]));
    }catch{this.gasTime=0;this.cache.clear();throw new Error('RPC önbelleği yenilenemedi.');}
  }
  async prepare(token:Address,wallets:Wallet[],amount:bigint,slippage:number):Promise<Plan>{
    const created=Date.now(), gasPrice=this.gasPrice*120n/100n;
    if(!wallets.length || created-this.gasTime>this.cfg.cacheAge || gasPrice<=0n || gasPrice>this.cfg.gasCap)throw new Error('RPC/gas önbelleği hazır değil veya gas limiti aşıldı.');
    for(const w of wallets){const c=this.cache.get(w.address);if(!c || created-c.time>this.cfg.cacheAge)throw new Error('Cüzdan önbelleği eskidi.');}
    const block=await this.primary.getBlock();
    if(created-Number(block.timestamp)*1000>15000)throw new Error('RPC eski blok döndürüyor.');
    const total=amount*BigInt(wallets.length);
    const quote=async(inputAmount:bigint)=>{
      if(!inputAmount)return 0n;
      const data=encodeFunctionData({abi:portalAbi,functionName:'quoteExactInput',args:[{inputToken:zeroAddress,outputToken:token,inputAmount}]});
      const result=await this.primary.call({to:PORTAL,data,account:wallets[0].address,blockNumber:block.number});
      if(!result.data)throw new Error('Quote sonucu yok.');
      return decodeFunctionResult({abi:portalAbi,functionName:'quoteExactInput',data:result.data});
    };
    const [state,code,qOne,qTotal,qPrior]=await Promise.all([
      this.primary.readContract({address:PORTAL,abi:portalAbi,functionName:'getTokenV8Safe',args:[token],blockNumber:block.number}),
      this.primary.getCode({address:token,blockNumber:block.number}), quote(amount), quote(total), quote(total-amount),
    ]);
    if(!code || code==='0x' || state.status!==1)throw new Error('Token oluşturulmamış, tradable değil veya DEX aşamasında.');
    if(state.quoteTokenAddress!==zeroAddress || state.extensionID!==zeroHash)throw new Error('V1 yalnızca BNB quote ve extensionsız tokenları destekler.');
    if(state.buyTaxRate>=10000n)throw new Error('Geçersiz buy tax.');
    // Quote can be net of tax; gross up conservatively to screen migration boundary.
    const gross=(qTotal*10000n+(10000n-state.buyTaxRate)-1n)/(10000n-state.buyTaxRate);
    if(state.circulatingSupply+gross>=state.dexSupplyThresh)throw new Error('Toplam alım graduation sınırına ulaşıyor; V1 göndermiyor.');
    // Cumulative quote difference estimates the worst marginal fill among OUR buys.
    // Not a guarantee: tax rounding, competing trades and ordering can change fills.
    const marginal=qTotal-qPrior, worstQuote=marginal<qOne?marginal:qOne;
    const minOut=protectedOutput(worstQuote,slippage);
    const data=encodeFunctionData({abi:portalAbi,functionName:'swapExactInput',args:[{inputToken:zeroAddress,outputToken:token,inputAmount:amount,minOutputAmount:minOut,permitData:'0x'}]});
    const rows=await Promise.all(wallets.map(async wallet=>{
      const cached=this.cache.get(wallet.address)!;
      // eth_estimateGas simulates sender, value and slippage; no signing or broadcast.
      const estimated=await this.primary.estimateGas({account:wallet.address,to:PORTAL,data,value:amount,blockNumber:block.number});
      const gas=estimated*125n/100n;
      if(gas>2000000n)throw new Error('Gas ihtiyacı V1 sınırını aşıyor.');
      if(cached.balance<amount+gas*gasPrice+this.cfg.reserve)throw new Error('BNB bakiye/gas rezervi yetersiz.');
      return {wallet,nonce:cached.nonce,gas,gasPrice,minOut,data};
    }));
    if(Date.now()-created>this.cfg.quoteAge)throw new Error('Hazırlık süresi quote yaş limitini aştı.');
    return {token,amount,quote:qOne,worstQuote,progress:state.progress,created,rows};
  }
  async sign(row:Prepared,amount:bigint){
    if(!row.wallet.account)throw new Error('İmzalayıcı yok.');
    const raw=await row.wallet.account.signTransaction({chainId:56,type:'legacy',to:PORTAL,value:amount,data:row.data,nonce:row.nonce,gas:row.gas,gasPrice:row.gasPrice});
    return {raw,hash:keccak256(raw)};
  }
  async broadcast(raw:Hex,hash:Hex){
    // Identical signed bytes to all endpoints. Never re-sign/re-nonce after timeout.
    await Promise.any(this.clients.map(async c=>{const result=await c.sendRawTransaction({serializedTransaction:raw});if(result.toLowerCase()!==hash.toLowerCase())throw new Error('RPC hash uyuşmazlığı.');}));
  }
  async reconcile(journal:Journal,notify:(s:string)=>void){
    await Promise.all(journal.pending().map(async t=>{
      try{
        const receipt=await this.primary.getTransactionReceipt({hash:t.hash});
        const head=await this.primary.getBlockNumber();if(head<receipt.blockNumber+2n)return;
        const status=receipt.status==='success'?'confirmed':'reverted';this.cache.delete(t.address);journal.set(t.hash,status);
        notify(`${t.address}: ${status==='confirmed'?'✅ Onaylandı':'❌ Revert (gas harcandı)'}\nhttps://bscscan.com/tx/${t.hash}`);
      }catch{/* unknown != failed. Keep lock; poll again even after process restart. */}
    }));
  }
}
