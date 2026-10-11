# PRD: RH-1, RH-2, RH-3, RH-4, RH-5, RH-7, RH-11
Feature: Host and moderate a room
  As a host
  I want to start a room and run the stage from Clubbox
  So that I can use my computer's audio setup and soundboard

  Background:
    Given I am signed in with a web session

  @observed @RH-1
  Scenario: Start a friends-of-friends room with replays and chat on
    When I start a room titled "Morning show" for "friends of friends" with replays on and chat on
    Then a "POST /web_api/create_channel" request is sent with body keys "is_chat_enabled, is_public_room, is_replay_enabled, is_private, is_social_mode, user_ids, topic_ids, source, topic, privacy_level"
    And the body field "privacy_level" is "friend_of_friend"
    And the body field "is_replay_enabled" is true
    And I am on stage as moderator without a join_channel request
    And Agora joins as "host" with the token from the create response

  @observed @RH-2
  Scenario: Soundboard reaches the stage while my mic is muted
    Given I host the room "Morning show"
    And my microphone is muted
    When I play the soundboard pad "Applause"
    Then the broadcast mix sent to Agora contains the soundboard signal
    And the broadcast mix does not contain my microphone

  @bundle @RH-3
  Scenario: Rename the room
    Given I host the room "Morning show"
    When I change the room title to "Evening show"
    Then a "POST /web_api/set_channel_title" request is sent with body keys "channel, title"

  @community @RH-4
  Scenario: Invite a listener with a raised hand
    Given experimental actions are on
    And I host the room "Morning show"
    And "Ayse" raised her hand
    When I click "Invite to stage" for "Ayse"
    Then a "POST /web_api/invite_speaker" request is sent with body keys "channel, user_id"

  @community @RH-4
  Scenario: First use of an experimental action asks for confirmation
    Given experimental actions are on
    And I have never used "invite_speaker"
    When I click "Invite to stage" for "Ayse"
    Then I see a confirmation that this action is experimental
    And no request is sent until I confirm

  @community @RH-5
  Scenario: Mute everyone except me
    Given experimental actions are on
    And I host the room "Morning show" with 3 other unmuted speakers
    When I click "Mute everyone"
    Then 3 "POST /web_api/mute_speaker" requests are sent with body keys "channel, user_id"
    And no request is sent for my own user id

  @community @RH-7
  Scenario: Restrict hand raises to friends of speakers
    Given experimental actions are on
    And I host the room "Morning show"
    When I set hand raise permission to "friends of speakers"
    Then a "POST /web_api/change_handraise_settings" request is sent with body keys "channel, is_enabled, handraise_permission"

  @community @RH-11
  Scenario: End the room
    Given experimental actions are on
    And I host the room "Morning show"
    When I click "End room" and confirm
    Then a "POST /web_api/end_channel" request is sent with body keys "channel, channel_id"
    And Agora leaves and presence pings stop

  @community
  Scenario: Experimental actions are hidden by default
    Given experimental actions are off
    And I host the room "Morning show"
    Then I do not see "Mute everyone", "End room" or "Invite to stage"
    And I see "Available in the Clubhouse app" where those controls would be

  @pending @DX-1
  Scenario: Room topics in the composer
    Given get_create_channel_targets says topics are available for "public"
    When I open the room composer and choose "public"
    Then I can pick topics when the topic list endpoint is documented
    And the picker is hidden when it is not documented
    And chosen topics are sent in "topic_ids"

  @pending @DX-3
  Scenario: Automatic speaker approval toggle
    Given get_create_channel_targets says automatic speaker approval is available for "friend_of_friend"
    When I open the room composer and choose "friends of friends"
    Then I see "Approve speakers automatically" only when its create body key is documented

  @pending @bundle @RH-7
  Scenario: Choose the hand-raise setting when starting a room
    When I start a room titled "Morning show" for "friends of friends" with hand raises limited to "friends of speakers"
    Then a "POST /web_api/create_channel" request is sent
    And the body field "handraise_permission" is set from the composer choice

  @pending @bundle @RH-12
  Scenario: Pin a link when starting a room
    When I start a room titled "Morning show" with the link "https://example.com/agenda"
    Then a "POST /web_api/create_channel" request is sent
    And the body field "link" is "https://example.com/agenda"

  @pending @bundle @SO-6
  Scenario: Start a room in a house
    Given I am an admin of the house "h1"
    When I start a room titled "House night" in the house "h1"
    Then a "POST /web_api/create_channel" request is sent
    And the body field "social_club_id" is "h1"
