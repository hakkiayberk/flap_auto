import { mkdirSync,openSync,closeSync,unlinkSync } from 'node:fs';
import { loadConfig } from './config.js';
import { loadWallets } from './vault.js';
import { hiddenPrompt } from './prompt.js';
import { Journal } from './journal.js';
import { Engine } from './engine.js';
import { BscNetwork } from './network.js';
import { createCommands } from './commands.js';
import { createTerminal } from './terminal-ui.js';
async function main(){
  process.umask(0o077);
  if(!process.stdin.isTTY || !process.stdout.isTTY)throw new Error('İnteraktif Terminal gerekli.');
  const cfg=loadConfig('terminal');
  mkdirSync('./data',{recursive:true,mode:0o700});const lock=openSync('./data/bot.lock','wx',0o600);closeSync(lock);
  process.once('exit',()=>{try{unlinkSync('./data/bot.lock');}catch{}});
  let password:string|undefined;if(cfg.mode==='live')password=await hiddenPrompt('Keystore şifresi: ');
  const wallets=loadWallets(cfg.mode==='live'?cfg.walletFile:cfg.watchFile,password);password=undefined;
  const journal=new Journal('./data/journal.sqlite'),network=new BscNetwork(cfg);
  await network.verify();await network.refresh(wallets);
  const engine=new Engine(cfg,wallets,network,journal);engine.assertLimits();
  let refreshRunning=false;
  const terminal=createTerminal(process.stdin,process.stdout,()=>{engine.stop();clearInterval(refresh);});
  const {handle,status,help}=createCommands(engine,network,journal,terminal.notify);
  const refresh=setInterval(()=>{
    if(engine.busy || refreshRunning)return;refreshRunning=true;
    void (async()=>{await network.reconcile(journal,terminal.notify);await network.refresh(wallets);})().catch(()=>console.error('RPC yenilemesi başarısız; eski önbellek ile alım kapalı.')).finally(()=>{refreshRunning=false;});
  },3000);
  const terminate=()=>terminal.close();process.on('SIGTERM',terminate);
  console.log(`⚡ TERMINAL MODU — Telegram bağlantısı/tokenı gerekmez.\n${help}\n/exit — quick buy durdur ve çık\n\n${status()}`);
  await terminal.run(handle);
  while(engine.busy || refreshRunning)await new Promise(r=>setTimeout(r,100));
  journal.close();process.off('SIGTERM',terminate);
}
main().catch(()=>{console.error('Başlatılamadı: Node 24+, interaktif Terminal, .env/RPC, cüzdan dosyası ve data/bot.lock kontrol edilmeli.');process.exitCode=1;});
