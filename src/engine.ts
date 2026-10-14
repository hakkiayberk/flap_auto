import { getAddress, formatEther, type Address, type Hex } from 'viem';
import type { Settings } from './config.js';
import type { Wallet } from './vault.js';
import type { Journal } from './journal.js';
export type Prepared = {wallet:Wallet;nonce:number;gas:bigint;gasPrice:bigint;minOut:bigint;data:Hex};
export type Plan = {token:Address;amount:bigint;quote:bigint;worstQuote:bigint;progress:bigint;created:number;rows:Prepared[]};
export interface Network {
  refresh(wallets:Wallet[]):Promise<void>;
  invalidate(wallets:Wallet[]):void;
  prepare(token:Address, wallets:Wallet[], amount:bigint, slippage:number):Promise<Plan>;
  sign(row:Prepared,amount:bigint):Promise<{raw:Hex;hash:Hex}>;
  broadcast(raw:Hex,hash:Hex):Promise<void>;
}
export function protectedOutput(quote:bigint,bps:number){
  if(quote<=0n || !Number.isInteger(bps) || bps<1 || bps>3000)throw new Error('Geçersiz quote/slippage.');
  const output=quote*BigInt(10000-bps)/10000n;if(output<=0n)throw new Error('Minimum çıktı sıfır olamaz.');return output;
}
export class Engine {
  armedUntil=0;spent=0n;busy=false;selected:string[];amount:bigint;slippage:number;
  constructor(public cfg:Settings, public wallets:Wallet[],public network:Network,public journal:Journal){
    this.selected=wallets.map(w=>w.id);this.amount=cfg.amount;this.slippage=cfg.slippage;
  }
  stop(){this.armedUntil=0;}
  selection(){return this.wallets.filter(w=>this.selected.includes(w.id));}
  assertLimits(){
    const batch=this.amount*BigInt(this.selection().length);
    if(this.amount>this.cfg.maxWallet || batch>this.cfg.maxBatch || !this.selection().length)throw new Error('Cüzdan/işlem limiti aşılıyor.');
    return batch;
  }
  arm(){this.assertLimits();if(this.cfg.mode!=='live')throw new Error('Dry-run modunda canlı alım açılamaz.');if(this.spent>=this.cfg.maxSession)throw new Error('Oturum harcama limiti doldu.');this.armedUntil=Date.now()+this.cfg.armMinutes*60000;}
  async quote(ca:string){return this.network.prepare(getAddress(ca),this.selection(),this.amount,this.slippage);}
  async buy(ca:string,notify:(s:string)=>void):Promise<string>{
    if(this.busy)throw new Error('Başka bir işlem hazırlanıyor.');
    const token=getAddress(ca), batch=this.assertLimits();
    if(this.journal.seen(token))throw new Error('Bu CA için daha önce alım gönderilmiş. İkinci alım engellendi.');
    const live=this.cfg.mode==='live';
    if(live && Date.now()>=this.armedUntil)throw new Error('Quick buy kapalı/süresi dolmuş. /arm ile açın.');
    if(live && this.spent+batch>this.cfg.maxSession)throw new Error('Oturum harcama limiti aşılır.');
    const blocked=new Set(this.journal.pending().map(t=>t.address.toLowerCase()));
    if(this.selection().some(w=>blocked.has(w.address.toLowerCase())))throw new Error('Cüzdanlardan birinin bekleyen/belirsiz işlemi var. /status ile kontrol edin.');
    this.busy=true;
    try{
      const start=performance.now(),plan=await this.quote(token);
      if(!live)return `DRY RUN — imza/gönderim yok\n${token}\n${plan.rows.length} cüzdan × ${formatEther(this.amount)} BNB\nToplam ${formatEther(batch)} BNB + gas\nBeklenen çıktı (tek cüzdan, ham birim): ${plan.quote}\nGrup son alım tahmini (ham birim): ${plan.worstQuote}\nMin çıktı (ham birim): ${plan.rows[0].minOut}\nHazırlık: ${Math.round(performance.now()-start)} ms`;
      const signed=await Promise.all(plan.rows.map(async row=>({...await this.network.sign(row,this.amount),row})));
      if(Date.now()>=this.armedUntil)throw new Error('Quick buy durduruldu/süresi doldu; gönderilmedi.');
      if(Date.now()-plan.created>this.cfg.quoteAge)throw new Error('Quote eskidi; gönderilmedi.');
      this.journal.reserve(token,signed.map(t=>({hash:t.hash,address:t.row.wallet.address,token,nonce:t.row.nonce})));
      this.network.invalidate(plan.rows.map(r=>r.wallet));
      this.spent+=batch;
      const tasks=signed.map(async t=>{
        try{await this.network.broadcast(t.raw,t.hash);this.journal.set(t.hash,'pending');notify(`${t.row.wallet.id}: gönderildi, henüz onaylanmadı\nhttps://bscscan.com/tx/${t.hash}`);}
        catch{notify(`${t.row.wallet.id}: gönderim sonucu BELİRSİZ; otomatik tekrar yok\nhttps://bscscan.com/tx/${t.hash}`);}
      });
      // All broadcasts already started; never wait for wallet 1 receipt here.
      notify(`⚡ ${signed.length} paralel gönderim başlatıldı. CA → broadcast başlatma: ${Math.round(performance.now()-start)} ms (Telegram ulaşım süresi hariç).`);
      await Promise.all(tasks);return 'Gönderim aşaması bitti. Onayları /status ile izleyebilirsiniz.';
    }finally{this.busy=false;}
  }
}
