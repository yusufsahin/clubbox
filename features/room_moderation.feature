# PRD: RH-6, RH-8, RH-9, RH-10, RH-12, DX-11 — controls driven by user_capabilities
Feature: Moderation extras
  As a moderator
  I want every room-management tool the Clubhouse app has
  So that I never need my phone to run a room

  Background:
    Given I am signed in with a web session
    And experimental actions are on
    And I host the room "Morning show"

  @RH-6
  Scenario: Controls follow user_capabilities
    Given my user_capabilities have "can_mute_speakers" false
    Then I do not see "Mute" on speaker cards
    Given my user_capabilities have "can_end_room" false
    Then I do not see "End room"

  @community @RH-6
  Scenario Outline: Speaker actions
    Given "Ayse" is on stage
    When I choose "<action>" for "Ayse"
    Then a "POST /web_api/<endpoint>" request is sent with body keys "channel, user_id"

    Examples:
      | action             | endpoint          |
      | Make moderator     | make_moderator    |
      | Move to audience   | uninvite_speaker  |
      | Block from room    | block_from_channel |

  @community @RH-6
  Scenario: Blocking asks for confirmation
    Given "Ayse" is on stage
    When I start blocking "Ayse"
    Then I see a confirmation before any request is sent

  @pending @bundle @RH-8
  Scenario: Turn room chat off
    Given my user_capabilities have "can_disable_room_chat" true
    When I turn room chat off
    Then the chat input is disabled for everyone in the room view
    And the request used is the one documented in docs/api/bundle-callsites.md for chat settings, or the control is hidden when none is documented

  @pending @RH-8
  Scenario: Delete a chat message
    Given the chat shows a message from "Ali"
    When I delete that message
    Then the request used is the one documented for message deletion, or "Delete" is hidden when none is documented

  @community @RH-9
  Scenario: Ping several people into the room
    When I open "Invite people" and search "market"
    Then suggestions come from "get_group_suggested_invites" and "search"
    When I select "Ayse" and "Ali" and click "Ping"
    Then 2 "POST /web_api/invite_to_existing_channel" requests are sent with body keys "channel, user_id"

  @pending @community @RH-10
  Scenario Outline: Change room visibility
    When I change the room visibility to "<visibility>"
    Then a "POST /web_api/<endpoint>" request is sent with body keys "channel, channel_id"

    Examples:
      | visibility | endpoint            |
      | open       | make_channel_public |
      | social     | make_channel_social |

  @pending @RH-12 @DX-2
  Scenario: Pinned link
    Given my user_capabilities have "can_edit_pinned_links" true
    When I pin "https://example.com/agenda"
    Then the request used is the one documented for pinned links, or the control is hidden when none is documented
    And the pinned link is shown at the top of the stage as a safe https link

  @pending @DX-11
  Scenario: Web listening toggle
    Given my user_capabilities have "can_change_enable_web_listening" true
    Then the room settings show "Allow web listeners" reflecting "is_web_listening_enabled"
