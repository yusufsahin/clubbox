# PRD: RL-1 … RL-7 (Release R1 "Listen & Host")
Feature: Be a listener in a live room
  As a power listener
  I want to join, stay in and leave Clubhouse rooms from my desktop
  So that I can follow conversations without my phone

  Background:
    Given I am signed in with a web session
    And the hallway shows the room "Tech Talk" with channel "abc123"

  @pending @bundle @RL-1
  Scenario: Join a room from the hallway
    When I click "Join" on "Tech Talk"
    Then a "POST /web_api/join_channel" request is sent with body keys "channel"
    And the body field "channel" is "abc123"
    And I see the stage with speakers and the audience
    And Agora joins as "audience" with the token from the join response

  @pending @bundle @RL-1
  Scenario: Join fails with a 404 because the route does not exist on web
    Given "join_channel" will answer 404
    When I click "Join" on "Tech Talk"
    Then I see the message "Joining rooms is not available on Clubhouse web yet"
    And "join_channel" is marked "unsupported" in API Health
    And the "Join" buttons show "Available in the Clubhouse app"

  @pending @bundle @RL-3
  Scenario: Presence ping keeps me in the room
    Given I am in the room "abc123"
    When 30 seconds pass
    Then a "POST /web_api/active_ping" request is sent with body keys "channel"

  @pending @bundle @RL-3
  Scenario: Presence ping keeps running while the window is hidden
    Given I am in the room "abc123"
    And the window has been hidden for 5 minutes
    Then "active_ping" requests continue every 30 seconds
    And no other timer sends requests

  @pending @bundle @RL-2
  Scenario: Leave quietly
    Given I am in the room "abc123"
    When I click "Leave quietly"
    Then a "POST /web_api/leave_channel" request is sent with body keys "channel"
    And Agora leaves the channel
    And presence pings stop
    And an active recording is stopped and saved

  @pending @bundle @RL-6
  Scenario Outline: Raise and lower my hand
    Given I am in the room "abc123" as audience
    When I <action> my hand
    Then a "POST /web_api/audience_reply" request is sent with body keys "channel, raise_hands, unraise_hands"
    And the body field "raise_hands" is <raise>
    And the body field "unraise_hands" is <unraise>

    Examples:
      | action | raise | unraise |
      | raise  | true  | false   |
      | lower  | false | true    |

  @pending @bundle @RL-7
  Scenario: Accept an invitation to speak
    Given I am in the room "abc123" as audience
    And a moderator invited me to speak
    When I click "Accept"
    Then a "POST /web_api/become_speaker" request is sent with body keys "channel"
    And Agora switches to "host" and publishes my broadcast mix
    And my microphone starts muted

  @pending @community @RL-7
  Scenario: Decline an invitation to speak
    Given experimental actions are on
    And I am in the room "abc123" as audience
    And a moderator invited me to speak
    When I click "Decline"
    Then a "POST /web_api/reject_speaker_invite" request is sent with body keys "channel, user_id"

  @pending @bundle @RL-5
  Scenario: Read and send room chat
    Given I am in the room "abc123"
    And the chat panel is open
    When I send the chat message "hello <b>world</b>"
    Then a "POST /web_api/send_channel_message" request is sent with body keys "channel, message"
    And the message is shown as plain text "hello <b>world</b>"

  @pending @bundle @RL-5
  Scenario: Chat is not polled while the panel is closed
    Given I am in the room "abc123"
    And the chat panel is closed
    When 60 seconds pass
    Then no "get_channel_messages" request is sent
