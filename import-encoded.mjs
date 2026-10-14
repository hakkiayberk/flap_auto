/**
 * encoded.txt (Trust Wallet PBKDF2 AES-256-CBC) → wallets.enc.json
 * macOS uyumlu gizli şifre okuma (stty -echo)
 */
import { randomBytes, scryptSync, createCipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { privateKeyToAccount } from 'viem/accounts';

// ── Gizli şifre okuma (macOS stty ile) ────────────────────────────────────
function readHidden(prompt) {
  process.stdout.write(prompt);
  let result;
  try {
    result = execFileSync('bash', ['-c', 'stty -echo; read -r PW </dev/tty; stty echo; printf "%s" "$PW"'], {
      stdio: ['inherit', 'pipe', 'inherit']
    });
  } catch (e) {
    try { execFileSync('stty', ['echo']); } catch {}
    throw e;
  }
  process.stdout.write('\n');
  return result.toString();
}

// ── OpenSSL ile şifre çözme (Kullanıcının bulduğu komut) ──────────────────
function decryptTrustWallet(filePath, password) {
  try {
    // Komut: openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -pass pass:<password> -in encoded.txt -base64
    const output = execFileSync('openssl', [
      'enc', '-d',
      '-aes-256-cbc',
      '-pbkdf2',
      '-iter', '600000',
      '-md', 'sha256',
      '-pass', `pass:${password}`,
      '-in', filePath,
      '-base64'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    
    return output.toString('utf8').trim();
  } catch (e) {
    throw new Error(`OpenSSL şifre çözme başarısız oldu. Şifre yanlış olabilir.`);
  }
}

// ── Vault şifreleme ────────────────────────────────────────────────────────
function encrypt(value, password) {
  if (password.length < 12) throw new Error('Vault şifresi en az 12 karakter olmalı.');
  const salt = randomBytes(32), iv = randomBytes(12);
  const key = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  key.fill(0);
  return { version: 1, salt: salt.toString('hex'), iv: iv.toString('hex'), tag: c.getAuthTag().toString('hex'), data: data.toString('hex') };
}

// ── Ana akış ──────────────────────────────────────────────────────────────
const files = [
  '/Users/hakkiayberk/Downloads/encoded.txt',
  '/Users/hakkiayberk/Downloads/encoded (1).txt',
  '/Users/hakkiayberk/Downloads/encoded (2).txt',
];

console.log('\n🔐 Trust Wallet encoded.txt → wallets.enc.json import aracı\n');
files.forEach((f, i) => console.log(`  ${i + 1}. ${f} — ${existsSync(f) ? '✅ Mevcut' : '❌ Bulunamadı'}`));
console.log();

// Script içinde şifreyi otomatik al (eğer argümanla verilmişse), yoksa sor
const encPass = readHidden('Encrypted export password: ');


const wallets = [];
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  if (!existsSync(file)) { console.log(`⚠️  Dosya bulunamadı, atlanıyor.`); continue; }
  try {
    let pk = decryptTrustWallet(file, encPass);
    if (!pk.startsWith('0x')) pk = '0x' + pk; // Başına 0x ekle (eğer yoksa)
    
    if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
      throw new Error(`Çözülen değer private key formatında değil.`);
    }
    
    const account = privateKeyToAccount(pk);
    wallets.push({ id: `w0${i + 1}`, privateKey: pk });
    console.log(`✅ w0${i + 1}: ${account.address}`);
  } catch (e) {
    console.error(`❌ ${file.split('/').pop()} çözülemedi: ${e.message}`);
    process.exit(1);
  }
}

if (!wallets.length) { console.error('❌ Hiç cüzdan yüklenemedi.'); process.exit(1); }

console.log();
const vaultPass = readHidden('Bot için yeni Vault şifresi belirle (min 12 karakter — BUNU UNUTMA!): ');
const vaultPass2 = readHidden('Tekrar gir: ');
if (vaultPass !== vaultPass2) { console.error('❌ Şifreler eşleşmiyor.'); process.exit(1); }
if (vaultPass.length < 12) { console.error('❌ En az 12 karakter olmalı.'); process.exit(1); }

mkdirSync('./data', { recursive: true, mode: 0o700 });
const outFile = './data/wallets.enc.json';
if (existsSync(outFile)) {
  console.log(`⚠️  ${outFile} zaten var, siliniyor...`);
  import('node:fs').then(fs => fs.unlinkSync(outFile));
}

const payload = encrypt(wallets, vaultPass);
writeFileSync(outFile, JSON.stringify(payload, null, 2), { mode: 0o600 });

console.log(`\n🎉 BAŞARILI! ${wallets.length} cüzdan şifrelendi → ${outFile}`);
console.log('Şimdi botu başlatmak için şu komutu çalıştır:\n\n   npm start\n');
process.exit(0);
