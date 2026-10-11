# Capture protocol

Clubbox does not join rooms or send messages for you. You click in the recorder window. A second account is only for a person who agreed to be in the session. The two recorder profiles do not share cookies.

Start a capture with `npm run api:record`. Add `-- --role=host` or `-- --role=listener`. A second window uses `npm run api:record -- --role=listener --profile=b`.

After each session: `npm run api:docs`. Read `docs/api/*.md` for anything that should not be committed, then commit the docs only. Do not commit `api-captures/`.

## English

### Session A — solo (1 person, web)

1. Home, a topic chip, search, a profile, follow, unfollow, a house page, activity, events, messages, a DM, send a text, a DM reaction.
2. Room smoke test: join a public room, listen for 30 seconds, read chat, send a chat message, send a reaction, leave.
3. Create a closed room alone, then end it.

Press Start on the matching checklist row before each step, then Done when that step is finished. Ctrl+Shift+M drops a timestamp marker.

### Session E — profile graph (1 person, web)

Record the request body the web client actually sends. Do not assume `/web_api/follow` or an unfollow path. `get_profile` is already observed. Add a route only after a body shows up in the capture.

1. Your own profile.
2. A public profile you do not know.
3. Someone only you have added.
4. Someone who has only added you.
5. Someone you have both added.
6. A private profile. Add them only if the web client offers it, then stop before they accept.
7. Open the followers list, the following list, and the friends list as three separate steps.
8. The web client's add, remove, withdraw, accept, and decline controls, each as its own step, and only when that control is on screen.

Write down every `follow_status` string you see. Buttons in Clubbox stay hidden until those strings are in the capture.

### Session B — you host, friend listens

Your friend may use the phone app. Only your web side is recorded (`--role=host`).

You create a public room. Your friend joins and raises a hand. You invite them. They accept. You mute them. You make them a moderator. You move them to the audience. You end the room.

### Session C — friend hosts, you listen

Your friend uses the phone app. You use the web recorder with `--role=listener`.

Your friend creates a room. You join, raise your hand, lower it, raise it again. They invite you. You accept. You leave the stage. They make you a moderator. You leave the room.

### Session D — PubNub / realtime

Leave the recorder open for all of sessions B and C. It should capture websocket or PubNub frames for hand raises, invites, speaker changes, and chat. If none appear, note which polling request the web client uses instead.

## Türkçe

### Oturum A — tek kişi (web)

1. Ana sayfa, bir konu seçimi, arama, bir profil, takip, takibi bırakma, bir kulüp sayfası, aktivite, etkinlikler, mesajlar, bir DM, metin gönderme, DM tepkisi.
2. Oda duman testi: herkese açık bir odaya gir, 30 saniye dinle, sohbeti oku, bir sohbet mesajı gönder, bir tepki gönder, çık.
3. Yalnızken kapalı bir oda aç, sonra bitir.

Her adımdan önce listedeki satırda Start’a, bitince Done’a bas. Ctrl+Shift+M bir zaman damgası bırakır.

### Oturum E — profil grafiği (tek kişi, web)

Web istemcisinin gerçekten gönderdiği gövdeyi kaydet. `/web_api/follow` veya bir takibi-bırak yolu varsayma. `get_profile` zaten görüldü. Bir gövde kayda düşmeden rota ekleme.

1. Kendi profilin.
2. Tanımadığın herkese açık bir profil.
3. Yalnızca senin eklediğin biri.
4. Yalnızca seni eklemiş biri.
5. İkinizin de eklediği biri.
6. Özel bir profil. Web istemcisi eklemeyi sunuyorsa ekle, kabulden önce dur.
7. Takipçi, takip ve arkadaş listelerini üç ayrı adımda aç.
8. Web’deki ekle, çıkar, geri çek, kabul ve ret kontrolleri. Her biri kendi adımı olsun ve yalnızca ekranda varsa.

Gördüğün her `follow_status` dizgesini yaz. Bu dizgeler kayda girmeden Clubbox düğme göstermez.

### Oturum B — sen yönetirsin, arkadaşın dinler

Arkadaşın telefon uygulamasını kullanabilir. Yalnızca senin web tarafın kaydedilir (`--role=host`).

Herkese açık bir oda açarsın. Arkadaşın katılır ve el kaldırır. Onu davet edersin. Kabul eder. Onu sessize alırsın. Moderatör yaparsın. Dinleyiciye alırsın. Odayı bitirirsin.

### Oturum C — arkadaşın yönetir, sen dinlersin

Arkadaşın telefon uygulamasındadır. Sen web kaydını `--role=listener` ile açarsın.

Arkadaşın oda açar. Sen katılırsın, el kaldırırsın, indirirsin, yine kaldırırsın. Seni davet eder. Kabul edersin. Sahneden inersin. Seni moderatör yapar. Odadan çıkarsın.

### Oturum D — PubNub / anlık trafik

B ve C boyunca kaydı açık tut. El kaldırma, davet, konuşmacı değişimi ve sohbet için websocket veya PubNub karesi düşmeli. Düşmezse web istemcisinin onun yerine hangi yoklama isteğini kullandığını not et.
