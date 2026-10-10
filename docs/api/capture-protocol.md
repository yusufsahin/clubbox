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

### Oturum B — sen yönetirsin, arkadaşın dinler

Arkadaşın telefon uygulamasını kullanabilir. Yalnızca senin web tarafın kaydedilir (`--role=host`).

Herkese açık bir oda açarsın. Arkadaşın katılır ve el kaldırır. Onu davet edersin. Kabul eder. Onu sessize alırsın. Moderatör yaparsın. Dinleyiciye alırsın. Odayı bitirirsin.

### Oturum C — arkadaşın yönetir, sen dinlersin

Arkadaşın telefon uygulamasındadır. Sen web kaydını `--role=listener` ile açarsın.

Arkadaşın oda açar. Sen katılırsın, el kaldırırsın, indirirsin, yine kaldırırsın. Seni davet eder. Kabul edersin. Sahneden inersin. Seni moderatör yapar. Odadan çıkarsın.

### Oturum D — PubNub / anlık trafik

B ve C boyunca kaydı açık tut. El kaldırma, davet, konuşmacı değişimi ve sohbet için websocket veya PubNub karesi düşmeli. Düşmezse web istemcisinin onun yerine hangi yoklama isteğini kullandığını not et.
