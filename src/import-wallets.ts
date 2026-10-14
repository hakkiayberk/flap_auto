import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hiddenPrompt } from './prompt.js';
import { encrypt, parseWallets } from './vault.js';
async function main(){
  const file=process.argv[2] ?? './data/wallets.enc.json';
  console.log('Yalnızca bu makinenin terminaline girin. Keyler ekranda görünmez.');
  const password=await hiddenPrompt('Keystore şifresi (en az 12 karakter): ');
  if(password!==await hiddenPrompt('Şifre tekrar: ')) throw new Error('Şifreler farklı.');
  const rows: {id:string;privateKey:string}[]=[];
  for(let i=1;i<=20;i++){
    const key=await hiddenPrompt(`w${String(i).padStart(2,'0')} private key (bitirmek için Enter): `);
    if(!key)break;rows.push({id:`w${String(i).padStart(2,'0')}`,privateKey:key});
  }
  const wallets=parseWallets(rows,true);mkdirSync(dirname(file),{recursive:true,mode:0o700});
  writeFileSync(file,JSON.stringify(encrypt(rows,password),null,2),{mode:0o600,flag:'wx'});
  console.log(`Şifreli dosya oluşturuldu: ${file}`);wallets.forEach(w=>console.log(`${w.id} ${w.address}`));
}
main().catch(()=>{console.error('İçe aktarma tamamlanamadı: girişleri/dosya yolunu kontrol edin. Var olan dosyanın üzerine yazılmaz.');process.exitCode=1;});
