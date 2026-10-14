import 'dotenv/config';
async function main(){
  const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw new Error('Token eksik.');
  console.log('Botunuzun Telegram özel sohbetine /start yazın. Botun kendisi şu anda çalışmamalı.');
  const response=await fetch(`https://api.telegram.org/bot${token}/getUpdates`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timeout:25,allowed_updates:['message']}),signal:AbortSignal.timeout(30000)});
  const result=await response.json() as any;if(!response.ok || !result.ok)throw new Error('Telegram hatası.');
  const people=new Map<number,string>();for(const u of result.result){const m=u.message;if(m?.chat?.type==='private' && m.from?.id===m.chat.id)people.set(m.from.id,m.from.username??m.from.first_name??'');}
  if(!people.size)console.log('Özel sohbet mesajı bulunmadı. /start yazıp yeniden çalıştırın.');
  people.forEach((name,id)=>console.log(`TELEGRAM_OWNER_ID=${id} (${name}) — yalnızca kendi hesabınızı seçin.`));
}
main().catch(()=>{console.error('ID okunamadı: tokenı kontrol edin; çalışan botu durdurun.');process.exitCode=1;});
