import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
export type Wallet = { id: string; address: Address; account?: PrivateKeyAccount };
export function encrypt(value: unknown, password: string) {
  if (password.length < 12) throw new Error('Şifre en az 12 karakter olmalı.');
  const salt = randomBytes(32), iv = randomBytes(12);
  const key = scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  const c = createCipheriv('aes-256-gcm',key,iv);
  const data = Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]); key.fill(0);
  return {version:1,salt:salt.toString('hex'),iv:iv.toString('hex'),tag:c.getAuthTag().toString('hex'),data:data.toString('hex')};
}
export function decrypt(payload: ReturnType<typeof encrypt>, password: string): unknown {
  if (payload.version !== 1 || !/^[0-9a-f]{64}$/.test(payload.salt) || !/^[0-9a-f]{24}$/.test(payload.iv) || !/^[0-9a-f]{32}$/.test(payload.tag)) throw new Error('Geçersiz keystore.');
  const key = scryptSync(password,Buffer.from(payload.salt,'hex'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  try {const d = createDecipheriv('aes-256-gcm',key,Buffer.from(payload.iv,'hex'));d.setAuthTag(Buffer.from(payload.tag,'hex'));return JSON.parse(Buffer.concat([d.update(Buffer.from(payload.data,'hex')),d.final()]).toString());}
  finally {key.fill(0);}
}
export function parseWallets(value: unknown, live: boolean): Wallet[] {
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new Error('1–20 cüzdan gerekli.');
  const rows = value.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,24}$/.test(row.id)) throw new Error('Geçersiz cüzdan ID.');
    if (live && !/^0x[0-9a-fA-F]{64}$/.test(row.privateKey ?? '')) throw new Error('Geçersiz private key.');
    const account = live ? privateKeyToAccount(row.privateKey as Hex) : undefined;
    const address = account ? account.address : getAddress(row.address);
    return {id:row.id,address,account};
  });
  if (new Set(rows.map(w=>w.id)).size !== rows.length || new Set(rows.map(w=>w.address.toLowerCase())).size !== rows.length) throw new Error('Tekrarlanan cüzdan ID/adresi.');
  return rows;
}
export function loadWallets(file: string,password?: string): Wallet[] {
  const data = JSON.parse(readFileSync(file,'utf8')); return password ? parseWallets(decrypt(data,password),true) : parseWallets(data,false);
}
