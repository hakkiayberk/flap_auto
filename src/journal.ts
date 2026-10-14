import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Address, Hex } from 'viem';
export type Pending = {hash:Hex;address:Address;token:Address;nonce:number;status:string};
export class Journal {
  db: DatabaseSync;
  constructor(file:string){
    mkdirSync(dirname(file),{recursive:true,mode:0o700});this.db=new DatabaseSync(file);chmodSync(file,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS buys(token TEXT PRIMARY KEY, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS txs(hash TEXT PRIMARY KEY,address TEXT NOT NULL,token TEXT NOT NULL,nonce INTEGER NOT NULL,status TEXT NOT NULL);
    `);
  }
  seen(token:Address){return !!this.db.prepare('SELECT token FROM buys WHERE token=?').get(token.toLowerCase());}
  // Transaction hash is durably recorded BEFORE any network broadcast.
  reserve(token:Address,txs:Omit<Pending,'status'>[]){
    this.db.exec('BEGIN IMMEDIATE');try{
      this.db.prepare('INSERT INTO buys VALUES(?,?)').run(token.toLowerCase(),Date.now());
      const s=this.db.prepare('INSERT INTO txs VALUES(?,?,?,?,?)');for(const t of txs)s.run(t.hash,t.address,t.token,t.nonce,'unknown');this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  set(hash:Hex,status:string){this.db.prepare('UPDATE txs SET status=? WHERE hash=?').run(status,hash);}
  pending():Pending[]{return this.db.prepare("SELECT * FROM txs WHERE status IN ('unknown','pending')").all() as unknown as Pending[];}
  recent():Pending[]{return this.db.prepare('SELECT * FROM txs ORDER BY rowid DESC LIMIT 20').all() as unknown as Pending[];}
  close(){this.db.close();}
}
