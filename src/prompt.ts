export function hiddenPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Şifre/key girişi için yerel interaktif terminal gerekli.');
  return new Promise((resolve,reject)=>{
    process.stdout.write(label); let value='';process.stdin.setRawMode(true); process.stdin.resume();
    const done=()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',onData);process.stdout.write('\n');};
    const onData=(b:Buffer)=>{for(const ch of b.toString()){if(ch==='\u0003'){done();reject(new Error('İptal'));return;}if(ch==='\r'||ch==='\n'){done();resolve(value);return;}if(ch==='\u007f'){value=value.slice(0,-1);}else if(ch>=' ') value+=ch;}};
    process.stdin.on('data',onData);
  });
}
