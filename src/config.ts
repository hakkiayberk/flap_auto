import 'dotenv/config';
import { parseEther, parseGwei } from 'viem';
export function amount(s: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(s)) throw new Error('Pozitif BNB miktarı girin (nokta ile).');
  const n = parseEther(s); if (n <= 0n) throw new Error('Miktar sıfırdan büyük olmalı.'); return n;
}
export function integer(s: string, lo: number, hi: number): number {
  if (!/^\d+$/.test(s)) throw new Error('Geçerli tam sayı gerekli.');
  const n = Number(s); if (!Number.isSafeInteger(n) || n < lo || n > hi) throw new Error(`Sayı ${lo}–${hi} aralığında olmalı.`); return n;
}
export type Settings = ReturnType<typeof loadConfig>;
export function loadConfig(transport:'telegram'|'terminal'='telegram') {
  const e = process.env;
  if (transport==='telegram' && (!e.TELEGRAM_BOT_TOKEN || !/^\d+$/.test(e.TELEGRAM_OWNER_ID ?? ''))) throw new Error('Telegram token ve sayısal owner ID gerekli.');
  const mode = e.MODE ?? 'dry-run'; if (mode !== 'dry-run' && mode !== 'live') throw new Error('MODE dry-run veya live olmalı.');
  const urls = (e.RPC_URLS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!urls.length || urls.some(s => {try { return new URL(s).protocol !== 'https:'; } catch {return true;}})) throw new Error('HTTPS BSC RPC_URLS gerekli.');
  return {
    token: e.TELEGRAM_BOT_TOKEN ?? '', owner: Number(e.TELEGRAM_OWNER_ID ?? '0'), mode, urls,
    amount: amount(e.AMOUNT_BNB ?? '0.005'), slippage: integer(e.SLIPPAGE_BPS ?? '500', 1, 3000),
    maxWallet: amount(e.MAX_PER_WALLET_BNB ?? '0.05'), maxBatch: amount(e.MAX_BATCH_BNB ?? '0.25'),
    maxSession: amount(e.MAX_SESSION_BNB ?? '0.5'), gasCap: parseGwei(e.MAX_GAS_PRICE_GWEI ?? '5'),
    reserve: amount(e.GAS_RESERVE_BNB ?? '0.002'), cacheAge: integer(e.CACHE_MAX_AGE_MS ?? '15000',1000,60000),
    quoteAge: integer(e.QUOTE_MAX_AGE_MS ?? '5000',500,15000), armMinutes: integer(e.ARM_MINUTES ?? '15',1,60),
    walletFile: e.WALLETS_FILE ?? './data/wallets.enc.json', watchFile: e.WATCH_WALLETS_FILE ?? './watch-wallets.json',
  };
}
