import { mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { loadConfig } from './config.js';
import { loadWallets } from './vault.js';
import { hiddenPrompt } from './prompt.js';
import { Journal } from './journal.js';
import { Engine } from './engine.js';
import { BscNetwork } from './network.js';
import { Telegram } from './telegram.js';
import { createCommands } from './commands.js';
async function main(){
  process.umask(0o077);const cfg=loadConfig();
  mkdirSync('./data',{recursive:true,mode:0o700});
  // Prevent two processes reserving the same nonce. Stale lock needs manual removal.
  const lock=openSync('./data/bot.lock','wx',0o600);closeSync(lock);
  process.once('exit',()=>{try{unlinkSync('./data/bot.lock');}catch{}});
  let password:string|undefined;
  if(cfg.mode==='live'){password=await hiddenPrompt('Keystore şifresi: ');}
  const wallets=loadWallets(cfg.mode==='live'?cfg.walletFile:cfg.watchFile,password);password=undefined;
  const journal=new Journal('./data/journal.sqlite');
  const network=new BscNetwork(cfg);await network.verify();await network.refresh(wallets);
  const engine=new Engine(cfg,wallets,network,journal);engine.assertLimits();
  const tg=new Telegram(cfg.token,cfg.owner);await tg.initialize();
  let refreshRunning=false;
  const refresh=setInterval(()=>{
    if(engine.busy || refreshRunning)return;refreshRunning=true;
    void (async()=>{await network.reconcile(journal,s=>tg.notify(s));await network.refresh(wallets);})().catch(()=>console.error('RPC yenilemesi başarısız; eski önbellek ile alım kapalı.')).finally(()=>{refreshRunning=false;});
  },3000);
  const {handle,status,help}=createCommands(engine,network,journal,s=>tg.notify(s));
  tg.notify(`${help}\n\n${status()}`);
  const shutdown=()=>{engine.stop();tg.stopped=true;clearInterval(refresh);};
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  await tg.run(handle);
  // Allow in-flight broadcasts to finish and remain recorded before exiting.
  while(engine.busy || refreshRunning)await new Promise(r=>setTimeout(r,100));journal.close();
}
main().catch(()=>{console.error('Bot başlatılamadı. .env, keystore, RPC ve data/bot.lock dosyasını kontrol edin. Ayrıntılı sır/RPC URL loglanmaz.');process.exitCode=1;});
