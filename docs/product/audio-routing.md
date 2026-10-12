# Ses yönlendirme / Audio routing

Public install + VB-Cable guide (distribution repo):

- [USER_GUIDE.md](https://github.com/yusufsahin/clubbox-app/blob/main/USER_GUIDE.md)
- [VB_CABLE.md](https://github.com/yusufsahin/clubbox-app/blob/main/VB_CABLE.md)

## Türkçe

İki kurulum var. Ayarlar › Ses › **Müzik ve harici ses kurulumu** aynı pencereyi koridordan ve odadan da açar. **Uygula** demeden aygıtlar değişmez.

### Kurulum 1 — Clubbox miksi (önerilen, yalnızca VB-Cable yeter)

- Mikrofon = gerçek mikrofon
- Harici giriş = CABLE Output (aynı `N-` kablo)
- Diğer uygulamaların çıkışı = CABLE Input veya `Speakers (N- VB-Audio Virtual Cable)`
- Clubbox çıkışı = kulaklık veya hoparlör
- Clubbox ducking yapar. Mikrofonu kapatmak müziği kesmez. Kayıt mikse dahildir.

### Kurulum 2 — Mikser mikrofon (Voicemeeter / Loopback / BlackHole)

- Mikrofon = VoiceMeeter Output (veya mikserin çıkışı)
- Harici giriş = kapalı
- Clubbox çıkışı = VoiceMeeter Aux Input. Ana VAIO girişi B1’i besler; onu seçme.
- Sessize almak tüm miksi kapatır, çünkü mikser mikrofonun kendisidir.

### Voicemeeter veri yolları

| Kaynak | B1 (Clubbox mikrofonu) | A1 (kulaklık) |
| --- | --- | --- |
| Mikrofon, donanım girişi 1 | açık | isteğe bağlı (kendini dinle) |
| VAIO (Windows / müzik) | açık | açık |
| AUX (Clubhouse sesi) | **kapalı** | açık |

A1 kulaklıktır. Oda sesi B1’e hiç gitmemelidir; gittiği anda oda kendi sesini geri alır.

### Windows biçimi

Windows Ses › Kayıt › CABLE Output › Özellikler › Gelişmiş: 2 kanal, 48000 Hz. Aynı ayarı çalma tarafı (CABLE Input / Speakers) için de yap. Stereo sorunlarının çoğu bu varsayılan biçimden gelir.

### Odadayken mikrofon değiştirmek

Ayarlar veya kurulum sihirbazından mikrofon değişince Clubbox `applyMicDevice` kullanır: Agora konuşmacıyken aynı yakalama profilinde `setDevice`, sanal↔fiziksel (veya AEC) değişince `republish`. Agora’nın track’i varken ikinci bir `getUserMedia` açılmaz.

Clubdeck tek giriş kullanır (miksi dışarıda kurar). Clubbox Kurulum 1’de gerçek mikrofon + Harici giriş avantajını korur; kalite (Normal/High/Music) yalnızca Oda detayları › Ses’tedir.

### VB-Cable rehberli kontrol (30.7)

Müzik ve harici ses kurulumu › adım 4 › **VB-Cable kontrolünü çalıştır** beş geçti/kaldı adımıdır. Ton yalnızca Speakers (N- VB-Cable)’e gider; odaya gitmez. Sonuç Live details › Sesimde görünür. 26.7 elle matrisin yerine geçer; telefonla duyma / ducking / stereo hâlâ sahip doğrulamasıdır.

### Çift yayın vs tek track miks (30.6 — sahip ölçene kadar açık)

Harici / soundboard açıkken Clubbox hâlâ **iki** Agora track yayınlar (mikrofon + extras); her biri seçilen seviyenin encoder’ı ile. SDK yayınları sunucu tarafında karıştırır; miksin hangi encoder’ı izlediği henüz canlı ölçülmedi.

- Yayın sırasında Agora debug açıksa 5 sn’de bir `getLocalAudioStats()` loglanır.
- Cockpit’te gönderim kalitesi çipi; Live details › Sesimde bitrate / stereo örneklenince görünür.
- Sahip normal vs music’i harici stereo dosya + telefon dinleyici ile karşılaştırıp buraya yazana kadar **tek** Web Audio mixed custom track’e geçilmez.

## English

Two setups. Settings › Audio › **Music & external audio setup** is the same pane the hallway and the room open. Nothing changes until **Apply**.

### Setup 1 — Clubbox mix (recommended, VB-Cable is enough)

- Microphone = your real microphone
- External input = CABLE Output of that cable
- Other apps’ output = CABLE Input or `Speakers (N- VB-Audio Virtual Cable)`
- Clubbox output = headphones or speakers
- Clubbox ducks the music under your voice. Muting the mic does not stop the music. A recording includes the mix.

### Setup 2 — Mixer as microphone (Voicemeeter / Loopback / BlackHole)

- Microphone = VoiceMeeter Output (or the mixer’s output)
- External input = off
- Clubbox output = VoiceMeeter Aux Input. The main VAIO input feeds B1; do not use it.
- Mute mutes the whole mix, because the mixer is the microphone.

### Voicemeeter buses

| Source | B1 (Clubbox microphone) | A1 (headphones) |
| --- | --- | --- |
| Mic, hardware input 1 | on | optional (self-monitor) |
| VAIO (Windows / music) | on | on |
| AUX (Clubhouse audio) | **off** | on |

A1 is the headphones. Room audio must never reach B1. If it does, the room hears itself.

### Windows format

Windows Sound › Recording › CABLE Output › Properties › Advanced: 2 channel, 48000 Hz. Set the same format on the playback side (CABLE Input / Speakers). Most stereo problems come from that default format.

### Changing the mic while in a room

Settings or the setup wizard go through `applyMicDevice`: while an Agora speaker, same capture profile uses `setDevice`; virtual↔physical (or AEC) changes use `republish`. No second `getUserMedia` while Agora owns the track.

Clubdeck uses one input (mix outside the app). Clubbox keeps Setup 1 (real mic + External). Quality (Normal/High/Music) lives only in Room details › Audio.

### VB-Cable guided check (30.7)

Music & external audio setup › step 4 › **Run VB-Cable check** walks five pass/fail steps (cable found / signal / format / loop / send path). A local tone is played into Speakers (N- VB-Cable) only — never into the room. Last result (pass/fail per step, no device ids) is saved and shown under Live details › My audio. This replaces the old 26.7 manual matrix; the owner still confirms on the phone that music is heard, ducking works, and stereo is preserved in Music.

### Dual publish vs single-track mix (30.6 — open until owner measures)

Clubbox still publishes **two** Agora tracks when External / soundboard is active: mic + extras, each with the selected level’s encoder. The SDK mixes published tracks server-side; which encoder the mix follows is **not yet measured** live.

- While publishing, with Agora debug on, Clubbox logs `getLocalAudioStats()` every 5s (`bitrateKbps`, stereo, channel count, track count).
- Cockpit shows a send-quality chip; Live details › My audio shows bitrate / stereo when sampled.
- **Do not** collapse to a single Web Audio mixed custom track until the owner compares normal vs music with an external stereo file (phone as listener) and records the result here. If the mix follows the mic encoder, then switch to one custom track (also fixes the 25.2 mute-signal case).
