# Clubhouse web client — API methods

Extracted from the API module of the public clubhouse.com web bundle (`api-captures/bundle-src/`, downloaded by the bundle crawler). This is the web client's own request code, so every row is evidence level **bundle** with an exact method, path and body. Values are never stored here — only key names.

Body keys separated by "|" are alternatives (the client sends one or the other). `{param}` is a URL path segment, not a body key. "(none)" means the client sends no body (use `{}` for POST).

| Client method | HTTP | Path | Path params | Body keys |
| --- | --- | --- | ---: | --- |
| rsvpSocialClubEventFromInvite | POST | `?` |  | invite_code, rsvp_status |
| addWebGuestSegment | POST | `/add_web_guest_segment` |  | invite_code, conversation_id, audio_format_type, audio_file, client_segment_id, name, duration |
| joinSocialClubFromInvite | POST | `/join_social_club_from_invite` |  | phone_number, invite_code |
| joinBetaInvite | POST | `/redeem_invite_link` |  | invite_code, phone_number, platform, email, source |
| activePing | POST | `/web_api/active_ping` |  | channel |
| addAsyncConversationSegment | POST | `/web_api/add_conversation_segment` |  | conversation_id, audio_file, audio_format_type, client_segment_id, segment_batch_id, duration, attached_url |
| askQuestionAboutConversation | POST | `/web_api/ask_question_about_conversation` |  | conversation_id, prompt |
| raiseHand | POST | `/web_api/audience_reply` |  | channel, raise_hands, unraise_hands |
| becomeSpeaker | POST | `/web_api/become_speaker` |  | channel |
| createConversation | POST | `/web_api/create_conversation` |  | privacy_level, social_club_id, is_private, user_ids, source |
| deleteConversation | POST | `/web_api/delete_conversation` |  | conversation_id |
| emojiReaction | POST | `/web_api/emoji_reaction` |  | channel, emoji |
| follow | POST | `/web_api/follow` |  | user_id, source |
| getChannelMessages | GET | `/web_api/get_channel_messages` |  | channel |
| getAsyncConversation | POST | `/web_api/get_conversation` |  | conversation_id |
| getAsyncConversations | POST | `/web_api/get_conversations` |  | is_private_only, next_cursor |
| getCreateChannelTargets | POST | `/web_api/get_create_channel_targets` |  | (none) |
| getEdgeStories | GET | `/web_api/get_edge_stories` |  | next_cursor |
| getFeed | POST | `/web_api/get_feed_v3` |  | next_cursor |
| getFOFMatch | POST | `/web_api/get_friend_zone_match` |  | user_id |
| getGroupSuggestedInvites | POST | `/web_api/get_group_suggested_invites` |  | query, social_club_id |
| getHighlight | GET | `/web_api/get_highlight/{param}/` | 1 | (none) |
| getInviteConversation | POST | `/web_api/get_invite_conversation` |  | invite_code |
| getProfile | POST | `/web_api/get_profile` |  | username | user_id |
| getReplayChannelChunk | GET | `/web_api/get_replay_channel_chunk/{param}/{param}` | 2 | (none) |
| getReplayChannel | GET | `/web_api/get_replay_channel/{param}` | 1 | (none) |
| house | POST | `/web_api/get_social_club` |  | social_club_slug | social_club_id, is_for_social_club_open |
| houseMessageThread | POST | `/web_api/get_social_club_message_thread` |  | social_club_id, message_id_str |
| houseMessages | POST | `/web_api/get_social_club_messages` |  | social_club_id, social_club_slug |
| gifReaction | POST | `/web_api/gif_reaction` |  | channel, giphy_id |
| oneTapActivePing | POST | `/web_api/guest_active_ping/{param}/{param}/{param}/{param}` | 4 | (none) |
| oneTapJoinChannel | POST | `/web_api/guest_join_channel/${[e,t,r].filter(e=>!!e).join("/")}` | 3 | (none) |
| oneTapLeaveChannel | POST | `/web_api/guest_leave_channel/{param}/{param}/{param}/{param}` | 4 | (none) |
| joinChannel | POST | `/web_api/join_channel` |  | channel |
| leaveChannel | POST | `/web_api/leave_channel` |  | channel |
| markConversationSegmentListened | POST | `/web_api/mark_conversation_segment_listened` |  | conversation_id, segment_id |
| me | POST | `/web_api/me` |  | (passed through) |
| recordActionTrails | POST | `/web_api/record_action_trails` |  | action_trails |
| oneTapWebRecordActionTrails | POST | `/web_api/record_guest_action_trails` |  | action_trails, guest_user_id |
| search | POST | `/web_api/search` |  | query, limit_to_object_types |
| sendChannelMessage | POST | `/web_api/send_channel_message` |  | channel, message |
| sendConversationEmojiReaction | POST | `/web_api/send_conversation_emoji_reaction` |  | conversation_id, segment_id, emoji |
| sendHouseMessage | POST | `/web_api/send_social_club_message` |  | social_club_id, message |
| houseMessageReaction | POST | `/web_api/send_social_club_message_emoji_reaction` |  | social_club_id, message_id, add_reaction, emoji_id |
| sendHouseThreadedMessage | POST | `/web_api/send_social_club_threaded_message` |  | social_club_id, message_id_str, message |
| updateChannelTitle | POST | `/web_api/set_channel_title` |  | channel, title |
| getTalkAdvisorStatus | POST | `/web_api/talk/get_advisor_status` |  | advisor_user_profile_id |
| getTalkConfig | POST | `/web_api/talk/get_config` |  | (none) |
| saveTalkPaymentMethod | POST | `/web_api/talk/save_payment_method` |  | payment_method_id |
| setTalkWebCallExperiment | POST | `/web_api/talk/set_web_call_experiment` |  | advisor_phone_number, exp |
| setupTalkPayment | POST | `/web_api/talk/setup_payment` |  | (none) |
| startTalkWebCall | POST | `/web_api/talk/start_web_call` |  | advisor_user_profile_id |
| startUnauthedTalkWebCall | POST | `/web_api/talk/start_web_call` |  | advisor_user_profile_id, caller_phone_number |
| updateName | POST | `/web_api/talk/update_name` |  | name |
| updateUsername | POST | `/web_api/talk/update_username` |  | username |
| updateConversationTitle | POST | `/web_api/update_conversation_title` |  | conversation_id, title |
| updateLastReadSocialClubMessage | POST | `/web_api/update_last_read_social_club_message` |  | message_id, social_club_id |
| webListenerActivePing | POST | `/web_api/web_listener_active_ping/` |  | session_id, staff_token |
| joinWebListenerChannel | POST | `/web_api/web_listener_join/` |  | invite_code, name, recaptcha_token, session_id, staff_token |
| webListenerLeaveChannel | POST | `/web_api/web_listener_leave/` |  | session_id, staff_token |

## Not in the web client

These names do not appear anywhere in the downloaded web bundle. The web client cannot do them; treat them as `community` (experimental) or `unsupported`, and do not wait for a capture:

- `unfollow`, `end_channel`, `invite_speaker`, `uninvite_speaker`, `mute_speaker`, `make_moderator`, `block_from_channel`, `change_handraise_settings`, `hide_channel`, `get_online_friends`, `get_events`, `get_notifications`, `get_channel`.
- `get_feed_v3` takes only `next_cursor`: the web client has **no server-side topic filter**. Topic chips filter locally — that is the final behaviour, not a gap.

## Notes for binding

- `create_channel` also accepts `social_club_id` (house rooms), `handraise_permission` (hand-raise setting at creation) and `link` (pinned link at creation).
- `get_profile` accepts `{user_id}` or `{username}`.
- Replays and highlights use path params: `GET /web_api/get_replay_channel/{channel}`, `GET /web_api/get_replay_channel_chunk/{channel}/{chunk}`, `GET /web_api/get_highlight/{id}/`.
- Web listening join uses a path form `/web_api/join_channel/{channel}/` with a reCAPTCHA token — out of scope (Clubbox never runs reCAPTCHA).
