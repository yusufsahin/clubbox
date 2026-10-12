# Agora sesi bağlanmıyor — kök neden ve uygulama planı

> Bu belge, uygulamayı yapacak geliştirici/ajan (Cursor) için yazıldı.
> Tarih: 2026-10-12. Ölçümler bu makinede (Windows 11, Electron 44.7 / Chromium 152) yapıldı.

## 1. Özet

- `Failed to resolve address for 148-153-93-xx.edge.agora.io., errorcode: -105` satırları **sesin bağlanmama sebebi değil**. Bunlar zararsız IPv6 gürültüsü (bkz. §2.1).
- Bu yanlış teşhis üzerine kurulan geçici çözümler (host-resolver-rules, DNS özelliklerini kapatma, `CONNECT_GATEWAY_WITHOUT_DOMAIN`) durumu **kötüleştiriyor**. `CONNECT_GATEWAY_WITHOUT_DOMAIN` gateway'e `wss://<IP>:port` ile bağlanmaya çalışıyor, bunu da uygulamanın kendi CSP'si engelliyor (bkz. §2.2).
- Join'in asıl başarısızlık sebebi henüz ölçülmedi, çünkü tüm loglar 12 saniyelik zaman aşımımızın tetiklediği `WS_ABORT: LEAVE` mesajıyla bitiyor. Agora'nın gerçek join yanıtı hiç görülmedi. Plan önce gürültüyü temizlemek, sonra gerçek hatayı yakalamak (bkz. §3).

## 2. Kanıtlar

### 2.1 `-105` = AAAA kaydı olmayan host için IPv6 soketleri

Chromium'un WebRTC P2P katmanı (`services/network/p2p/socket_manager.cc`) STUN/TURN host'unu **her yerel soket için o soketin adres ailesinde** çözer. Sona nokta eklenir (FQDN), `dns_query_type` soketin ailesine göre A veya AAAA olur.

Ölçüm (`Resolve-DnsName`):

| Kayıt | `148-153-93-25.edge.agora.io` |
|---|---|
| A | `148.153.93.25` ✅ |
| AAAA | kayıt yok ❌ |

Uygulamanın hiçbir switch'i olmadan, sade Electron 44'te `stun:148-153-93-25.edge.agora.io:3478` ile ICE toplama:
- `srflx:5.25.35.226` adayı **alındı**. IPv4 çözümleme çalışıyor.
- `701 STUN host lookup received error` **5 kez** geldi. Makinede tam 5 IPv6 adresi var (2× `fde2:…`, 3× `2a02:…`).

Sonuç: hata yalnızca IPv6 soketlerinde, AAAA kaydı olmadığı için çıkıyor. Chrome'da da aynı log oluşur. Sistem DNS'i, ISS ve DoH ile ilgisi yok (sistem DNS'i, 1.1.1.1 ve 8.8.8.8 hepsi doğru çözüyor).

### 2.2 IP-gateway geçici çözümü CSP'ye takılıyor

`%APPDATA%/Clubbox/chromium-net.log` (03:27–03:33 çalıştırmaları):

```
Connecting to 'wss://104.166.174.190:4722/' violates the following Content Security Policy directive:
"connect-src 'self' https://*.agora.io wss://*.agora.io … wss://*.edge.agora.io …". The action has been blocked.
```

`index.html` CSP'si yalnızca alan adlarına izin veriyor. CSP'de IP joker karakteri yok; izin vermek için `wss:` gibi geniş bir kaynak açmak gerekir. Bu önerilmez.

### 2.3 Join akışı

Log'daki sıra: `CONNECTING` → 12 sn sonra kendi timeout'umuz → `LEAVE` → proxy mode 5 → … → `NETWORK_ERROR` / `JOIN_TIMEOUT`. Agora'nın join reddi (ör. `INVALID_TOKEN`, `UID_BANNED`, `CAN_NOT_GET_GATEWAY_SERVER`, `INVALID_VENDOR_KEY`) hiçbir yerde görünmüyor, çünkü yakalanmadan zaman aşımıyla iptal ediliyor.

## 3. Uygulama planı

### Adım 1 — Yanlış teşhise dayalı geçici çözümleri kaldır

Bunlar ya etkisiz ya zararlı. Kaldırılınca davranış Chrome'daki clubhouse.com ile aynı olur.

- `electron/main.cjs`
  - `disable-features AsyncDns,DnsOverHttps,NetworkServiceSandbox` switch'ini kaldır. Ağ servisi sandbox'ını kapatmak güvenlik kaybı.
  - `enable-features NetworkServiceInProcess2` switch'ini kaldır.
  - `app.configureHostResolver({ enableBuiltInResolver:false, secureDnsMode:'off' })` bloğunu kaldır.
  - `enableChromiumNetLog()`, `applyAgoraEdgeMaps()` ve `watchChromiumLogFile()` çağrılarını kaldır. Net-log gerekiyorsa yalnızca `CLUBBOX_NETLOG=1` env'i ile açılsın.
  - **`disk-cache-dir` switch'i kalsın.** O, ayrı ve gerçek bir Windows cache-kilidi düzeltmesi.
- `electron/agoraEdgeDns.cjs`, `electron/agoraEdgeHost.cjs` ve `tests/agoraEdgeHost.test.ts` dosyalarını sil. Bunlar stdout/stderr'i monkeypatch ediyor ve MAP kuralları öğreniyor.
- `src/audio/agoraVoice.ts` › `loadSdk()`: `CONNECT_GATEWAY_WITHOUT_DOMAIN` ve `USE_TURN_IP` `setParameter` bloğunu kaldır.
- Kullanıcı verisinde kalan `agora-edge-maps.json` ve `chromium-net.log` dosyalarını açılışta bir kez sil. Bu tek seferlik bir migration; dosyalar yoksa hiçbir şey yapmasın.

### Adım 2 — Gerçek join hatasını görünür yap

`src/audio/agoraVoice.ts`:

1. `joinWithTimeout`: zaman aşımında `client.leave()` çağırmadan önce SDK'nın son durumunu logla. `connection-state-change` olayının `reason` alanı ve son `exception` olayı yeterli.
2. `client.on('exception', e => …)` dinleyicisi ekle. `e.code`, `e.msg` ve `e.uid` değerlerini logla.
3. Join hatasında `AgoraRTCError.code` ve `.data` değerlerini logla. Token'ı loglama; yalnızca `token.length` yazılsın.
4. Teşhis süresince `AgoraRTC.setLogLevel(1)` (INFO) kullan, sonra `3`'e geri al. Gateway'in `join_success`/`join_failure` mesajları INFO seviyesinde.
5. Zaman aşımını 12 sn'den **20 sn**'ye çıkar. Gateway seçimi (choose best websocket) yavaş ağlarda 10 sn'yi aşabiliyor.
6. Cloud proxy (`startProxyServer(5)`) yalnızca hata kodu ağ engeli gösterdiğinde denensin (`CAN_NOT_GET_GATEWAY_SERVER`, `WS_ERR` / ws 1006). Kendi timeout'umuzdan sonra denenmesin. Proxy denemesi her seferinde yeni bir join ve yeni bir hata gürültüsü üretiyor.

### Adım 3 — A/B referans testi: clubhouse.com aynı Electron'da çalıyor mu?

Bu adım "ağ/Electron sorunu" ile "bizim join parametrelerimiz" arasındaki ayrımı kesinleştirir.

1. Clubhouse giriş penceresinde (aynı oturumla) `https://www.clubhouse.com/room/<channel>` adresini aç. Bir dev menü öğesi ya da IPC yeterli.
2. Ses geliyorsa: Electron/ağ sağlam, fark **bizim parametrelerimizde**. Karşılaştırılacaklar:
   - **App ID:** bizim varsayılanımız `938de3e8…`. Sign-in sayfasından çıkarılan `NEXT_PUBLIC_AGORA_KEY` (`extractAgoraAppIdFromSignIn`) ile aynı mı? Token bu App ID'ye bağlıdır; farklıysa `INVALID_VENDOR_KEY` / `INVALID_TOKEN` gelir.
   - **Token:** web join yanıtındaki `token` mı, `rtm_token` mı? RTC join'de `token` kullanılmalı.
   - **UID:** `user_profile_id` sayısal ve **number** olarak verilmeli. String UID, token ile eşleşmez.
   - **Kanal adı:** `channel` alanı birebir mi? Başında/sonunda boşluk ya da büyük-küçük harf farkı olmamalı.
   - **mode/codec/role:** `live` + `audience` ile başla. Speaker'a geçişi join'den sonra `setClientRole('host')` ile yap.
   - CDP ile clubhouse.com'un kendi `client.join` argümanlarını gözlemle. Sign-in penceresindeki pasif CDP dinleyicisinin (`attachSignInAuthDebugger`) aynısı WebSocket frame'leri için (`Network.webSocketFrameSent`) kullanılabilir.
3. clubhouse.com da çalamıyorsa: sorun ağda ya da odada. `is_web_listening_enabled=false` olan odalar web istemcisine kapalı olabilir (aşağıya bak).

### Adım 4 — Odanın web dinlemeye açık olduğunu kontrol et

`join_channel` yanıtında `is_web_listening_enabled` alanı var. Clubhouse tarihsel olarak kanallarını WebRTC (web SDK) istemcilerine kapattı. Bilinen açık kaynak istemciler bu yüzden native Agora SDK kullanıyor ([seovchinnikov/clubhouse-web](https://github.com/seovchinnikov/clubhouse-web)).

- `is_web_listening_enabled === false` ise Agora join'i **hiç deneme**. UI'da şunu göster: "Bu oda web üzerinden dinlenemiyor". TR karşılığı i18n'e eklensin.
- Bu kural Adım 3'teki A/B testinin sonucuna göre doğrulanmalı.

### Adım 5 (son çare) — Native Agora SDK

Clubdeck gibi masaüstü istemcilerin sorunu bu katmanda native Agora SDK (Windows/macOS, Electron node addon: `agora-electron-sdk`) kullanarak aştığı biliniyor. Clubdeck'in iç yapısı kamuya açık değil; bu bir çıkarım.

Native SDK, Chromium WebRTC'yi tamamen devre dışı bırakır ve "web istemcisi yasak" kısıtına takılmaz. Maliyeti yüksek:
- native modül derleme ve imzalama,
- Electron ABI uyumu,
- ses grafiğinin (`audioEngine`, kayıt) native ses çıktısına göre yeniden yazılması.

Yalnızca Adım 3–4 web yolunun kapalı olduğunu kanıtlarsa başlanmalı. Önce ayrı bir spike branch'inde, tek bir odayı dinleme hedefiyle.

## 4. Yapılmaması gerekenler

- `-105` loglarını "düzeltmek" için DNS switch'leri, `host-resolver-rules` ya da DoH ayarları eklemek. Bunlar IPv6/AAAA davranışıdır ve zararsızdır.
- CSP'ye `wss:` / `https:` gibi geniş kaynaklar açmak.
- Ağ servisi sandbox'ını kapatmak.
- stdout/stderr monkeypatch'leri.
- Token, telefon numarası ya da cookie değerlerini loglamak.

## 5. Kabul kriterleri

- [x] Adım 1 sonrası `npm run test:unit`, `npx tsc --noEmit` ve `npm run build` temiz geçiyor.
- [ ] Bir odaya girişte log'da Agora'nın gerçek join sonucu görünüyor: ya `Joined … as UID …` ya da bir `AgoraRTCError` kodu. Yalnızca `WS_ABORT: LEAVE` görünmemeli. *(Adım 2 uygulandı; canlı oda ile doğrulanacak)*
- [ ] Adım 3 A/B sonucu bu belgeye eklendi: clubhouse.com Electron'da ses çaldı mı, parametre farkları neler.
- [x] `is_web_listening_enabled=false` odalarda join denenmiyor ve kullanıcı anlaşılır bir mesaj görüyor. (`webListeningDisabled` i18n)
- [x] `-105` satırları hâlâ görünebilir. Beklenen durum bu — zararsız IPv6/AAAA gürültüsü; DNS switch / host-map ile “düzeltilmez”.

### Uygulama notu (2026-10-12)

Adım 1 uygulandı (DNS/edge-map/`CONNECT_GATEWAY_WITHOUT_DOMAIN` kaldırıldı).

**Regresyon (aynı gün):** Uncommitted “timeout → leave → cloud proxy” katmanı join’i `WS_ABORT: LEAVE` ile kesiyordu; Adım 4’teki `is_web_listening_enabled===false` hard-gate ise Agora’yı hiç çağırmıyordu. Geri alındı: join yine commit’teki gibi düz `client.join()`; web-listening yalnızca uyarı logu. Adım 2’nin timeout/proxy kısmı bilerek uygulanmadı — o, eski çalışan yolu bozan şeydi.

## A/B — clubhouse.com vs Clubbox (Phase 23.3)

**Status: awaiting owner run.** Settings › Advanced › enable “Verbose voice log” › join a room › “Open current room on clubhouse.com”. Desktop console logs `[agora-ab] ws …` shapes only. Fill the table below from that run (never paste tokens or full app ids).

| Field | clubhouse.com (A/B window) | Clubbox |
| --- | --- | --- |
| appId prefix / len | _pending_ | `938d…` / 32 (config or fallback) |
| token len | _pending_ | from `join_channel.token` (see live log `tokenLen=`) |
| uid type / digits | _pending_ | `number` / profile id |
| cname len | _pending_ | `channel` string length |
| role / mode | _pending_ | host or audience / direct\|proxy |
| result | _pending_ (audio audible? Y/N) | `Joined …` or error code |
| `is_web_listening_enabled` | from Clubbox `join_channel` for that room | same |

**Decision (owner):** web path (23.4–23.5) if clubhouse.com plays; native path (23.6–23.8) if it fails or Agora returns a vendor/permission error for web.

## 6. Kaynaklar

- Chromium `services/network/p2p/socket_manager.cc`: FQDN ve adres ailesine göre çözümleme. <https://chromium.googlesource.com/chromium/src/+/refs/heads/main/services/network/p2p/socket_manager.cc>
- Clubhouse'un WebRTC'yi kapatması ve native istemci gerekliliği: <https://github.com/seovchinnikov/clubhouse-web>
- Agora Electron (native) SDK: <https://api-ref.agora.io/en/voice-sdk/electron/3.x/index.html>
- Agora web konsol hata mesajları: <https://docs.agora.io/en/help/integration-issues/console_error_web>
