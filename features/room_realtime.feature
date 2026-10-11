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
    When the realtime hub receives a "<type>" event for "Ayse"
    Then <result>

    Examples:
      | type             | result                                     |
      | user_joined      | "Ayse" appears in the audience             |
      | user_left        | "Ayse" disappears from the room            |
      | hand_raised      | "Ayse" appears in the raised hands list    |
      | speaker_added    | "Ayse" moves to the stage                  |
      | speaker_removed  | "Ayse" moves to the audience               |
      | moderator_added  | "Ayse" shows the moderator badge           |

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
