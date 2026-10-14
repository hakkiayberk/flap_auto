import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { loadConfig } from '../src/config.js';
import { createTerminal } from '../src/terminal-ui.js';
test('terminal config needs no Telegram credentials; Telegram config still does',()=>{
  const saved={token:process.env.TELEGRAM_BOT_TOKEN,owner:process.env.TELEGRAM_OWNER_ID,rpc:process.env.RPC_URLS};
  try{
    delete process.env.TELEGRAM_BOT_TOKEN;delete process.env.TELEGRAM_OWNER_ID;process.env.RPC_URLS='https://rpc.invalid';
    assert.equal(loadConfig('terminal').token,'');assert.throws(()=>loadConfig('telegram'),/Telegram/);
  }finally{
    for(const [key,value] of [['TELEGRAM_BOT_TOKEN',saved.token],['TELEGRAM_OWNER_ID',saved.owner],['RPC_URLS',saved.rpc]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}
  }
});
test('terminal accepts stop while buy is waiting and waits for work on exit',async()=>{
  const input=new PassThrough(),output=new PassThrough();let text='',stopped=false,closed=0;
  output.on('data',b=>{text+=b.toString();});
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const terminal=createTerminal(input,output,()=>{closed++;stopped=true;});
  const commands:string[]=[];
  const run=terminal.run(async cmd=>{
    commands.push(cmd);
    if(cmd==='/buy'){await gate;return stopped?'cancelled':'sent';}
    if(cmd==='/stop'){stopped=true;return 'stopped';}return 'status';
  });
  input.write('/buy\n/stop\n');await new Promise(r=>setTimeout(r,20));
  assert.deepEqual(commands,['/buy','/stop']);assert.ok(stopped);assert.match(text,/stopped/);
  input.write('/exit\n');assert.equal(closed,1);release();await run;assert.match(text,/cancelled/);assert.doesNotMatch(text,/sent/);
  input.destroy();output.destroy();
});
