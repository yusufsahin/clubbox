# Ses yönlendirme / Audio routing

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
