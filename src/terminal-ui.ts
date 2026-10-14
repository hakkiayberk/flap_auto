import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { UserError } from './commands.js';
export function createTerminal(input:Readable,output:Writable,onClose:()=>void){
  const rl=createInterface({input,output,terminal:!!(output as NodeJS.WriteStream).isTTY,historySize:0,prompt:'flap> '});
  let running=0,closed=false;
  const notify=(text:string)=>{output.write(`\n${text}\n`);if(!closed)rl.prompt(true);};
  const run=(handle:(s:string)=>Promise<string>)=>new Promise<void>(resolve=>{
    const finish=()=>{if(closed && running===0)resolve();};
    rl.on('line',line=>{
      const text=line.trim();if(!text || closed){if(!closed)rl.prompt();return;}
      if(text==='/exit' || text==='exit'){rl.close();return;}
      running++;
      // Keep reading while buy is awaiting RPC: /stop can cancel before broadcast.
      void handle(text).then(notify).catch(e=>notify(e instanceof UserError?e.message:'İşlem tamamlanamadı. /status ile kontrol edin; otomatik tekrar yapılmadı.')).finally(()=>{running--;finish();});
      rl.prompt();
    });
    rl.on('SIGINT',()=>rl.close());
    rl.once('close',()=>{closed=true;onClose();finish();});rl.prompt();
  });
  return {run,notify,close:()=>rl.close()};
}
