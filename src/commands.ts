import { formatEther } from 'viem';
import { amount, integer } from './config.js';
import type { Engine } from './engine.js';
import type { BscNetwork } from './network.js';
import type { Journal } from './journal.js';
export class UserError extends Error {}
export const help=`⚡ Flap Quick Buy v1\n/status /wallets /balance\n/amount 0.005 — cüzdan başına BNB\n/select w01,w03 (veya all)\n/slippage 500 — BPS; 500 = %5\n/quote <CA> — yalnızca önizleme\n/arm — canlı quick buy aç\n/stop — yeni gönderimleri durdur\nCA veya /buy <CA> — alım\nAyar değişikliği /arm durumunu kapatır.`;
export function createCommands(engine:Engine, network:BscNetwork, journal:Journal, notify:(s:string)=>void){
  const cfg=engine.cfg, wallets=engine.wallets;
  const status=()=>`Mod: ${cfg.mode}\nQuick buy: ${Date.now()<engine.armedUntil?'AÇIK':'KAPALI'}\nSeçili: ${engine.selected.join(', ')}\nCüzdan başına: ${formatEther(engine.amount)} BNB\nToplam: ${formatEther(engine.assertLimits())} BNB + gas\nSlippage: ${engine.slippage/100}% (grup son alım tahminine göre)\nOturumda rezerve edilen: ${formatEther(engine.spent)} / ${formatEther(cfg.maxSession)} BNB\nBekleyen/belirsiz: ${journal.pending().length}\n${journal.recent().map(t=>`${t.status}: https://bscscan.com/tx/${t.hash}`).join('\n')}`;
  const handle=async(text:string)=>{
    const [cmd,arg,...extra]=text.split(/\s+/);
    if(extra.length)throw new UserError('Tek komut veya tek CA gönderin.');
    if(cmd==='/start'||cmd==='/help')return help;
    if(cmd==='/stop'){engine.stop();return 'Quick buy kapatıldı. Daha önce gönderilen TX’ler zincirde devam eder.';}
    if(cmd==='/status')return status();
    if(cmd==='/wallets')return wallets.map(w=>`${w.id} ${w.address}`).join('\n');
    if(cmd==='/balance')return wallets.map(w=>{const c=network.cache.get(w.address);return `${w.id}: ${c?formatEther(c.balance):'?'} BNB (önbellek)`;}).join('\n');
    if(cmd==='/arm'){try{engine.arm();}catch(e){throw new UserError((e as Error).message);}return `⚡ Quick buy ${cfg.armMinutes} dakika AÇIK. CA gönderince seçili cüzdanlar onaysız alır.\n${status()}`;}
    if(['/amount','/select','/slippage'].includes(cmd)){
      if(engine.busy)throw new UserError('İşlem sürerken ayarlar değiştirilemez.');engine.stop();
      try{
        if(cmd==='/amount'){const old=engine.amount;engine.amount=amount(arg??'');try{engine.assertLimits();}catch(e){engine.amount=old;throw e;}}
        if(cmd==='/slippage')engine.slippage=integer(arg??'',1,3000);
        if(cmd==='/select'){const ids=arg==='all'?wallets.map(w=>w.id):(arg??'').split(',');if(!ids.length || new Set(ids).size!==ids.length || ids.some(id=>!wallets.some(w=>w.id===id)))throw new Error('Cüzdan seçimi geçersiz.');const old=engine.selected;engine.selected=ids;try{engine.assertLimits();}catch(e){engine.selected=old;throw e;}}
      }catch(e){throw new UserError((e as Error).message);}return status();
    }
    const ca=cmd==='/buy'||cmd==='/quote'?arg:cmd;
    if(!ca || !/^0x[0-9a-fA-F]{40}$/.test(ca) || (arg && cmd!=='/buy' && cmd!=='/quote'))throw new UserError('Geçerli CA gönderin. /help');
    if(cmd==='/quote'){
      const p=await engine.quote(ca);return `QUOTE — işlem gönderilmez\nProgress: ${(Number(p.progress)/1e16).toFixed(2)}%\n${p.rows.length} × ${formatEther(p.amount)} BNB\nTek alım quote (ham birim): ${p.quote}\nGrup son alım tahmini: ${p.worstQuote}\nMin çıktı (ham birim): ${p.rows[0].minOut}`;
    }
    // Expected engine validation messages contain no keys or RPC URLs; RPC errors never surfaced.
    try{return await engine.buy(ca,s=>notify(s));}catch(e){
      const message=(e as Error).message;
      if(message.length<160 && !/https?:|0x[0-9a-fA-F]{64}|Request|HTTP/i.test(message))throw new UserError(message);
      throw e;
    }
  };
  return {handle,status,help};
}
