# Flap Quick Buy v1

Mac Terminal’ine **tek bir CA** yapıştırıp Enter’a bas → seçili cüzdanlar için quote/simülasyon → paralel yerel imza → aynı imzalı işlem birden fazla BSC RPC’ye gönderilir. İlk sürüm Node.js 24 + TypeScript + viem kullanır. 1–20 farklı cüzdan destekler. Alım mesajı başına onay düğmesi yoktur; canlı alım önceden `/arm` ile açılır.

## Teslim edilen durum

Kaynak kod, bağımlılık kilidi, şifreli cüzdan içe aktarma aracı, Türkçe Terminal/Telegram komutları ve otomatik testler dahildir. Varsayılan `MODE=dry-run`: CA gönderilince quote ve gas simülasyonu yapılır; **işlem imzalanmaz ve yayınlanmaz**. Henüz sizin Telegram/RPC/cüzdan bilgileriniz bağlanmadı ve gerçek zincirde alım testi yapılmadı. Mock RPC testleri gerçek viem ABI encoding ve transaction signing kodunu çalıştırır; blok dahil edilme hızı ölçülmüş değildir.

## Telegram olmadan macOS Terminal kurulumu (varsayılan)

Node.js 24 LTS kurulu olmalı. ZIP’i açtıktan sonra proje klasöründe:

```sh
npm ci
npm run build
npm test
cp .env.example .env
cp watch-wallets.example.json watch-wallets.json
```

`.env` içinde yalnızca kendi BSC mainnet HTTPS adreslerinizi `RPC_URLS` alanına girin; diğer limitleri ihtiyacınıza göre ayarlayın. **TELEGRAM_BOT_TOKEN ve TELEGRAM_OWNER_ID boş kalabilir.** İlk deneme için `MODE=dry-run` bırakın. `watch-wallets.json` içindeki adresleri kendi public cüzdan adreslerinizle değiştirin. Dry-run gas simülasyonu için cüzdanlarda yeterli BNB gerekir.

```sh
npm start
```

`flap>` istemi açılır. Bu isteme komutları/CA’yı yazarsınız; bunlar macOS kabuğuna yazılan komutlar değildir:

```text
/status
/select all
/amount 0.005
/slippage 500
/quote 0xGERCEK_40_HEX_KARAKTERLI_CA
```

Örnek adres yerine gerçek CA kullanın. CA’yı tek başına yapıştırıp Enter’a basmak dry-run raporu verir; bu modda imza/yayın yoktur. CA için bekleme/deploy takibi yapılmaz.

Canlı kullanım için `/exit` ile kapatın; kendi Mac Terminal’inizde `npm run wallets:import` ile şifreli cüzdan dosyasını oluşturun. `.env` içinde `MODE=live` yapıp `npm start` ile yeniden açın. Terminalde keystore şifresini girin. Anahtarları Antigravity ajan sohbetine veya başka sohbetlere yazmayın.

```text
/select all
/amount 0.005
/slippage 500
/status
/arm
```

Bundan sonra gerçek CA’yı `flap>` istemine yapıştırıp **Enter** basın: ikinci bir onay sorulmadan seçili cüzdanların alımı başlar. `/arm` süresi ve limitler Telegram moduyla aynıdır. `/stop` yeni gönderimleri kapatır. `/exit`, Ctrl+C veya Ctrl+D oturumu kapatır; henüz gönderilmemiş işleri durdurur, gönderilmiş TX’leri geri alamaz. Bekleyen yayınların kayıt işlemleri bitmeden süreç çıkmaz.

Terminal arayüzü işlemler hazırlanırken yeni komutları okumaya devam eder; `/stop` RPC cevabını beklemez. Aynı anda ikinci alım ve ayar değişikliği motor tarafından engellenir. CA girişleri readline geçmişine kaydedilmez. Antigravity terminali interaktif giriş destekliyorsa oradan da çalışır; şifre/key girişi için macOS Terminal uygulamasını kullanın.

Mac uykudayken bot çalışmayı sürdüremez. Aktif oturumda uykuya geçmesini önlemek için isteğe bağlı olarak:

```sh
caffeinate -i npm start
```

Mac’i kapatmak, terminali sonlandırmak veya ağ bağlantısını kesmek hizmeti durdurur. Antigravity bu botun çalışması için gerekli değildir. Terminal modu hiçbir Telegram API çağrısı yapmaz. `npm run start:terminal` aynı terminal uygulamasını açar; `npm run start:telegram` isteğe bağlı Telegram uygulamasıdır. İki arayüzü aynı cüzdanlarla aynı anda çalıştırmayın.

**11 test geçmiştir:** önceki motor/RPC testlerine ek olarak Telegram bilgileri olmadan terminal konfigürasyonu ve bekleyen işlem sırasında stop/exit davranışı test edildi. Gerçek alım yapılmadı; mainnet hız/başarı testi değildir. Aşağıdaki Telegram kurulum bölümleri yalnızca isteğe bağlı alternatif arayüz içindir. Ortak motorun bonding/DEX, slippage ve belirsiz transaction sınırları her iki modda da geçerlidir.

## 1. Kurulum

Windows, Linux veya macOS üzerinde Node.js **24 LTS** kurun. ZIP’i açın, terminalde proje klasörüne girin:

```sh
npm ci
npm run build
npm test
```

Linux/macOS:

```sh
cp .env.example .env
cp watch-wallets.example.json watch-wallets.json
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item watch-wallets.example.json watch-wallets.json
```

`watch-wallets.json` içindeki örnek adresleri **kendi cüzdanlarınızın gerçek 0x adresleriyle** değiştirin; adresler private key değildir. Kullanmayacağınız satırları silin.

## 2. Telegram ve RPC

Telegram’ın resmi **@BotFather** hesabında `/newbot` ile bot oluşturun. Verdiği tokenı yalnızca kendi makinenizde `.env` dosyasının `TELEGRAM_BOT_TOKEN` alanına girin.

Kendi kullanıcı ID’nizi öğrenmek için botunuzun özel sohbetine `/start` yazın ve bot henüz kapalıyken çalıştırın:

```sh
npm run telegram:id
```

Çıktıdaki kendi hesabınıza ait sayısal ID’yi `TELEGRAM_OWNER_ID` alanına yazın. Bot yalnızca bu kullanıcıdan, aynı ID’ye ait **özel sohbetten** gelen mesajları kabul eder; grup kanallarından veya başka kullanıcılardan CA işlenmez.

`RPC_URLS` alanına BNB Smart Chain **mainnet / chainId 56** HTTPS RPC adreslerinizi virgülle ayırarak girin. İlk adres quote, gas, bakiye ve receipt okumalarını yapar. Diğer adresler aynı imzalı transaction’ın paralel yayını içindir; okuma tarafında otomatik failover yoktur. Her endpoint başlangıçta chain ID ve Portal kodu açısından kontrol edilir. HTTPS endpointler bağlantıyı açık tutan Node fetch üzerinden kullanılır.

Token, RPC API anahtarı, private key ve keystore şifresini ChatGPT’ye, Antigravity ajan sohbetine veya Telegram’a mesaj olarak göndermeyin.

## 3. Dry-run

`.env` içinde `MODE=dry-run` bırakın:

```sh
npm run start:telegram
```

Telegram özel sohbetinde:

```text
/status
/balance
/select w01,w02
/amount 0.005
/slippage 500
/quote 0xGERCEK_40_HEX_KARAKTERLI_CA
```

Son satırdaki açıklayıcı adresi gerçek CA ile değiştirin. Aynı şekilde doğrudan CA göndermek dry-run raporu üretir. Çıktılar tokenın **ham tamsayı birimleri** olarak gösterilir; decimals dönüşümü yapılmaz. Buradaki örnek miktar/slippage değerleri konfigürasyon örneğidir.

Dry-run da alım simülasyonu yaptığı için gerçek cüzdan adreslerinde yeterli BNB bulunmalı. Yetersiz bakiye veya gas rezervinde bot hazır raporu üretmez.

## 4. Cüzdanları yerel olarak şifreleme

Botu Ctrl+C ile durdurun ve kendi terminalinizde:

```sh
npm run wallets:import
```

En az 12 karakterlik şifre belirleyin. Ardından cüzdan private keylerini sırayla girin; girişler ekranda görünmez. Bitirmek için boş Enter verin. ID’ler `w01`, `w02`… şeklinde atanır. Mevcut keystore dosyasının üzerine yazılmaz. Aynı adres iki defa eklenemez.

Anahtarlar `data/wallets.enc.json` içinde scrypt anahtar türetme + AES-256-GCM ile saklanır. Başlangıçta şifre terminalden alınır, anahtarlar RAM’de hazırlanır. Anahtarlar `.env` içine yazılmaz veya Telegram’a gönderilmez. İşlem imzası sunucuda üretilir; RPC’ye private key verilmez. Çalışan süreç ele geçirilirse RAM’deki anahtarlar da erişilebilir; şifreleme bunu engellemez. POSIX izinleri 600/700 ayarlanır; Windows üzerinde klasör erişimini kendi Windows hesabınızla sınırlayın.

## 5. Canlı quick buy

`.env` içindeki `MODE=live` değerini ayarlayın; miktar ve harcama limitlerinizi kontrol edin. Ardından:

```sh
npm run start:telegram
```

Yerel terminalde keystore şifresini girin. Bot açılışta **quick buy kapalı** başlar. Telegram’da:

```text
/select all
/amount 0.005
/slippage 500
/status
/arm
```

`/arm` sonrası gerçek CA’yı **tek mesaj** olarak gönderin. Seçili her cüzdan ayarlanan BNB miktarıyla alır. `/buy <CA>` de aynı işlemi yapar. Bir cüzdanın receipt’i beklenmeden diğerlerinin gönderimi başlar. TX hash almak alımın onaylandığı anlamına gelmez; receipt sonucu ayrı bildirilir.

`/arm` varsayılan 15 dakika geçerlidir. Miktar, seçim veya slippage değişikliği quick buy durumunu kapatır; tekrar `/arm` gerekir. `/stop` yeni yayınları engeller; daha önce yayınlanmış transactionları geri alamaz. Süreç yeniden başlayınca quick buy açılmaz ve Telegram’da biriken eski mesajlar atılır.

## Komutlar

| Komut | İşlev |
|---|---|
| `/help` | Kullanım |
| `/wallets` | ID ve public adresler |
| `/balance` | Arka planda tutulan BNB bakiyeleri |
| `/status` | Mod, ayarlar, limitler ve son TX durumları |
| `/amount 0.005` | Cüzdan başına BNB |
| `/select w01,w03` | Seçilen cüzdanlar |
| `/select all` | Tüm cüzdanlar |
| `/slippage 500` | BPS; 500 = %5, izin verilen 1–3000 |
| `/quote <CA>` | Gönderimsiz önizleme |
| `/arm` | Canlı quick buy oturumunu aç |
| `/stop` | Quick buy kapat |
| `<CA>` veya `/buy <CA>` | Modun gerektirdiği alım/dry-run |

## Hız ve sınırlar

- Cüzdan anahtarları, ABI ve clientlar başlangıçta yüklenir. Bakiye/pending nonce/gas bilgileri yaklaşık 3 saniyede bir yenilenir. Cache eskirse alım durur. Cüzdanları bot çalışırken başka uygulamalardan kullanmak nonce/bakiye yarışına yol açabilir; bu bot için ayrı cüzdanlar kullanın.
- Token state, bytecode ve kümülatif quote okumaları aynı blok üzerinde paralel yapılır. Her cüzdan için `eth_estimateGas` simülasyonu da paraleldir; bu RPC çağrısı gecikmeye katkı yapar. Sabit gas ile simülasyonsuz mod bu sürümde yoktur.
- İmzalar paralel hazırlanır; yayınlar paralel başlar. Her RPC’ye **aynı imzalı bytes** gönderilir; bu ayrı alım yaratmaz. Public mempool kullanılır; özel relay/bundle veya MEV koruması yoktur.
- Grup son alımı için `quote(toplam) - quote(toplam - tek alım)` farkı kullanılır ve slippage bu tahmine uygulanır. Diğer alıcılar, farklı sıralama ve vergi yuvarlamaları sonucu değiştirebilir; bu yaklaşım fiyat etkisinin garantili bir simülasyonu değildir. Minimum çıktı sıfır bırakılmaz. Grup etkisi nedeniyle başlangıçtaki tek cüzdan quote’una kıyasla toplam toleransınız daha geniş olabilir.
- `.env` limitleri: cüzdan başına, batch ve bot sürecinin canlı oturumunda toplam **alım ana parası**. Gas bunlara dahil değildir; gas fiyat tavanı ve her cüzdanda ek BNB rezervi ayrıca vardır. `/stop` veya tekrar `/arm` harcama sayacını sıfırlamaz; süreç yeniden başlatıldığında oturum sayacı sıfırlanır. Günlük hesap genelinde kalıcı harcama limiti değildir.
- V1 yalnızca **Tradable (status 1), BNB quote, extensionsız** tokenları destekler. Staged, geçersiz, DEX tokenları ve toplam alımla graduation sınırına ulaşacağı tahmin edilen tokenlar reddedilir. Henüz deploy edilmemiş CA için otomatik bekleme/sniping yoktur. Sell, TP/SL, DEX route, webhook ve WebSocket yoktur.
- Önemli kontrat sınırı: Portal `swapExactInput` hem curve hem DEX alımını destekler. Okunan blok ile işlemin yürütülmesi arasında token graduate olabilir. Bu durumda Portal DEX üzerinden işleyebilir veya revert edebilir. **Bu sürüm zincirde kesin curve-only yürütme garantisi vermez.** Bunun için ayrıca denetlenmiş atomik durum kontrolü yapan bir execution kontratı gerekir.
- Token kayıtlı olması ekonomik güvenliğinin veya satılabilirliğinin garantisi değildir. Kısmi batch başarısı mümkündür: bazı cüzdanlar alır, bazıları revert eder. Revert durumunda gas harcanır. Otomatik telafi/tekrar yoktur.
- Raporda ölçülen süre backend’in CA’yı işleme başlangıcından yayın çağrılarının başlatılmasına kadardır; Telegram taşıma süresi ve blok dahil edilme süresi dahil değildir. Alt saniye başarı iddiası veya garanti yoktur.

## Tekrar alım ve kesinti davranışı

İmzalı TX hashleri **yayından önce**, SQLite WAL + FULL synchronous ile diske kaydedilir. Aynı CA için bot yeniden başlatılsa bile tekrar alım engellenir. Bir cüzdanın pending/unknown kaydı varken o cüzdanla yeni batch başlatılmaz. Timeout, “başarısız alım” olarak kabul edilmez; hash üzerinden receipt aranır. Receipt iki ek blok beklenerek confirmed/reverted yapılır; derin reorg tespiti yoktur.

Belirsiz TX zincirde hiç görünmezse V1 otomatik unlock/replacement yapmaz. `/status` hashlerini explorer ve RPC üzerinden inceleyin; nonce ve bekleyen işlem durumunu doğrulamadan veritabanını silerek yeni alım açmayın. Sign sonrası kayıt/yayın öncesi kesinti senaryosunda hash kaydedilmiş ama hiç yayınlanmamış olabilir; otomatik yeniden yayın yoktur.

`data/bot.lock` aynı klasörde ikinci bot sürecini engeller. Ani kapanmadan kalan lock dosyasını yalnızca başka bot süreci çalışmadığını doğruladıktan sonra kaldırın. Aynı keystore’u farklı klasörlerde çalıştırmak bu kilidi aşar; yalnızca bir süreç kullanın. `data/` ve `.env` dosyalarını yedekleyin; bunları repo/ZIP olarak paylaşmayın.

## Doğrulama

Testler: dry-run’da imza/yayın olmaması, paralel yayın başlangıcı, kalıcı CA deduplikasyonu, imza sırasında stop, belirsiz yayında cüzdan kilidi, eşzamanlı CA, quote yaş ve harcama sınırları, şifreleme bütünlüğü, Telegram yetkilendirme; ayrıca mock JSON-RPC ile gerçek viem tuple kodlaması, simülasyon, chain 56/nonce/value imzası ve aynı signed bytes’ın çoklu RPC yayını.

## Kaynaklar

Resmi arayüz 6 Ekim 2026 tarihinde kontrol edildi:

- https://github.com/flap-sh/FlapVaultExample/blob/main/src/flap/IPortal.sol
- https://github.com/flap-sh/FlapVaultExample/blob/main/test/FlapBSCFixture.sol
- https://core.telegram.org/bots/api

Portal: `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`, BSC chain 56. ABI `getTokenV8Safe`, `quoteExactInput`, `swapExactInput` için bu resmi Solidity arayüzünden türetildi. Dağıtılmış kontratın her fonksiyonu gerçek RPC’de ayrıca doğrulanmalıdır; desteklenmeyen ABI veya RPC çağrısında V1 göndermeyi durdurur.
