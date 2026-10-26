# NAVIGATION.md §4 (v2.1) — everything you use in a room lives in the room
Feature: Room-centred controls
  As a host or speaker
  I want every in-room tool in the room bar or the Room details panel
  So that I never leave the room page to play a sound or change audio

  Background:
    Given I am signed in with a web session

  @RH-15
  Scenario: The room bar holds the in-room tools
    Given I am in the room "Tech Talk"
    Then the room bar shows, in order, the room title, "Mic", "Hand", "Reactions", "Sounds", "Record", "Chat", "Details" and "Leave"
    And the room bar has a "Music Mode" button and a "Hear myself" button

  @ST-3
  Scenario: Sounds panel in the room
    Given I am in the room "Tech Talk" as a speaker
    When I click "Sounds" in the room bar
    Then a panel shows all my sound pads with their hotkeys, the volume slider, "Stop all" and "Duck"
    When I click the pad "Applause"
    Then "Applause" plays into the broadcast mix
    And I am still on the room page

  @ST-3
  Scenario: Pads are only played into a room
    Given I am not in a room
    Then there is no "Soundboard" place in the sidebar
    And pressing "1" plays nothing

  @ST-10
  Scenario: Manage sound pads in Settings
    When I open Settings › Sounds
    Then I can upload, rename, set the hotkey and volume of, preview and delete pads
    And previewing a pad plays it on my output only, never into a room

  @RH-13
  Scenario: Audio settings live in Room details
    Given I am in the room "Tech Talk"
    When I open "Details"
    Then the "Audio" section has audio quality (Normal, High, Music), "Hear myself", voice effect and spatial audio
    And Settings has no voice effect or spatial audio controls

  @RH-15
  Scenario: The stage shows people, not tools
    Given I host the room "Morning show"
    Then the stage page shows speakers, audience and chat only
    And "Rename", "Visibility", "Hand raise", "Invite people", "Mute everyone" and "End room" are in Details › Moderation
    And reactions and GIFs are in the "Reactions" popover of the room bar

  @RH-15
  Scenario: Moderation section is only for moderators
    Given I am in the room "Tech Talk" as a listener
    When I open "Details"
    Then I do not see a "Moderation" section

  @RH-15
  Scenario Outline: Each room control exists exactly once
    Given I host the room "Morning show"
    Then "<control>" appears exactly once in the room UI

    Examples:
      | control       |
      | Mute everyone |
      | Audio quality |
      | Chat          |
      | Share room    |
