export type Update={update_id:number;message?:{date:number;text?:string;from?:{id:number};chat:{id:number;type:string}}};
export function authorized(u:Update,owner:number){return u.message?.from?.id===owner && u.message.chat.id===owner && u.message.chat.type==='private';}
export class Telegram {
  offset=0;stopped=false;
  constructor(private token:string,private owner:number){}
  async api(method:string,body:unknown,timeout=35000):Promise<any>{
    const r=await fetch(`https://api.telegram.org/bot${this.token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
    if(!r.ok)throw new Error('Telegram HTTP hatası.');const j=await r.json() as any;if(!j.ok)throw new Error('Telegram API hatası.');return j.result;
  }
  notify(text:string){
    // Split large wallet/status lists; each failure is handled without blocking buys.
    for(let i=0;i<text.length;i+=3500)void this.api('sendMessage',{chat_id:this.owner,text:text.slice(i,i+3500),link_preview_options:{is_disabled:true}}).catch(()=>console.error('Telegram bildirimi teslim edilemedi.'));
  }
  async initialize(){
    await this.api('getMe',{});
    // Drop stale CA messages after downtime; there are no automatic restart buys.
    await this.api('deleteWebhook',{drop_pending_updates:true});
  }
  async run(handle:(text:string)=>Promise<string>){
    while(!this.stopped){
      try{
        const updates:Update[]=await this.api('getUpdates',{offset:this.offset,timeout:25,allowed_updates:['message']});
        for(const u of updates){
          this.offset=u.update_id+1;
          if(!authorized(u,this.owner) || !u.message?.text || Date.now()/1000-u.message.date>15)continue;
          // Do not await handler: /stop must remain responsive while quote/sign run.
          void handle(u.message.text.trim()).then(t=>this.notify(t)).catch(e=>this.notify(e instanceof UserError?e.message:'İşlem tamamlanamadı. /status ile kontrol edin; otomatik tekrar yapılmadı.'));
        }
      }catch{console.error('Telegram polling yeniden bağlanıyor.');await new Promise(r=>setTimeout(r,1500));}
    }
  }
}
import { UserError } from './commands.js';
