# PRD: RL-4, RL-5 (realtime), RL-8 — DESIGN §5
Feature: Live room updates through realtime
  As anyone in a room
  I want the stage, hands, chat and reactions to update by themselves
  So that the room feels live without refreshing

  Background:
    Given I am signed in with a web session
    And I am in the room "abc123" with realtime credentials from the join response

  @bundle @RL-4
  Scenario: Subscribe to realtime after entering a room
    Then the realtime hub subscribes with origin "clubhouse.pubnubapi.com"
    And it uses the pubnub token and heartbeat values from the join response
    And no "get_channel" request is ever sent

  @community @RL-4
  Scenario Outline: Stage events update the room
    # Real Clubhouse PubNub payloads: the type is in "action", users are identified by user_id.
    # Sources: grishka/Houseclub VoiceService.java, seovchinnikov/clubhouse-web JoinChannel.vue.
    Given "Ayse" is <before> in the room
    When the realtime hub receives the Clubhouse action "<action>" for "Ayse"
    Then <result>

    Examples:
      | before                | action              | result                                     |
      | not                   | join_channel        | "Ayse" appears in the audience             |
      | listening             | leave_channel       | "Ayse" disappears from the room            |
      | listening             | remove_from_channel | "Ayse" disappears from the room            |
      | listening             | raise_hands         | "Ayse" appears in the raised hands list    |
      | raising her hand      | unraise_hands       | "Ayse" is no longer in the raised hands list |
      | raising her hand      | add_speaker         | "Ayse" moves to the stage                  |
      | speaking              | remove_speaker      | "Ayse" moves to the audience               |
      | speaking              | make_moderator      | "Ayse" shows the moderator badge           |

  @community @RL-4
  Scenario: Actions for another room are ignored
    Given "Ayse" is listening in the room
    When the realtime hub receives the Clubhouse action "leave_channel" for "Ayse" in room "otherRoom"
    Then "Ayse" appears in the audience

  @community @RL-7
  Scenario: Being invited to speak arrives through realtime
    When the realtime hub receives an invite to speak for me
    Then I see "Accept" and "Decline"

  @community @RL-4
  Scenario: Room ended by the host
    When the realtime hub receives "room ended"
    Then Agora leaves the channel
    And presence pings stop
    And I see "The room has ended"

  @bundle @RL-5
  Scenario: Chat messages arrive through realtime
    When the realtime hub receives a "channel_message" from "Ayse" with "hi <img src=x>"
    Then the chat shows "hi <img src=x>" as plain text from "Ayse"
    And no "get_channel_messages" request is sent

  @bundle @RL-5
  Scenario: Chat falls back to polling only when realtime is down
    Given the realtime hub is disconnected
    And the chat panel is open
    When 15 seconds pass
    Then a "GET /web_api/get_channel_messages" request is sent

  @bundle @RL-8
  Scenario: Send a reaction to a speaker
    Given "Ayse" is on stage
    When I send the reaction "❤️" to "Ayse"
    Then a "POST /web_api/emoji_reaction" request is sent with body keys "channel, emoji"

  @bundle @RL-8
  Scenario: Send a GIF reaction by pasted Giphy id
    When I send a GIF reaction with "https://giphy.com/gifs/funny-3oEjI6SIIHBdRxXI40"
    Then a "POST /web_api/gif_reaction" request is sent with the documented body keys
    And the GIF reaction body uses giphy_id "3oEjI6SIIHBdRxXI40"

  @bundle @RL-8
  Scenario: Incoming reactions are shown on the target speaker
    When the realtime hub receives a "channel_reaction" "👏" from "Ali" to "Ayse"
    Then a short "👏" animation is shown on "Ayse"

  @RL-4
  Scenario: Unknown realtime message types are logged by shape only
    When the realtime hub receives an unknown type "mystery" with keys "a, b"
    Then API Health lists realtime type "mystery" with keys "a, b"
    And no message values are stored

  @RL-4
  Scenario: Manual refresh
    When I press Ctrl+P
    Then the realtime hub resubscribes
    And the chat is read again

  @RL-4
  Scenario: Realtime reconnects with backoff
    Given the realtime hub loses its connection
    Then it reconnects after 1, 2, 4 seconds up to 60 seconds
    And the stage shows "Reconnecting…" until it succeeds
