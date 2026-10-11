# PRD: HAL-1 … HAL-6, SO-3
Feature: Hallway and discovery
  As a power listener
  I want a hallway I can filter, search and act on quickly
  So that I find the right rooms without scrolling on my phone

  Background:
    Given I am signed in with a web session

  @pending @observed @HAL-1
  Scenario: Hallway loads on open and on refresh only
    When I open the hallway
    Then a "POST /web_api/get_feed_v3" request is sent
    And I see topic chips from "available_topics"
    When 5 minutes pass without interaction
    Then no further "get_feed_v3" request is sent
    When I click "Refresh"
    Then a "POST /web_api/get_feed_v3" request is sent

  @pending @observed @HAL-1
  Scenario: Selecting a topic chip filters the hallway
    Given the hallway has topics "tech" and "music"
    When I select the topic chip "tech"
    Then only rooms for "tech" are shown

  @pending @observed @HAL-2
  Scenario: Room card shows everything needed to decide
    Given the hallway shows the room "Tech Talk" with channel "abc123"
    Then its card shows the title, the house name, replays on/off, clips on/off, how long it has been running, the listener count and the speaker count
    When I click "Copy link" on "Tech Talk"
    Then the clipboard contains "https://www.clubhouse.com/room/abc123"

  @pending @community @HAL-3
  Scenario: Hide a room from the hallway
    Given experimental actions are on
    And the hallway shows the room "Tech Talk" with channel "abc123"
    When I click "Hide" on "Tech Talk"
    Then a "POST /web_api/hide_channel" request is sent with body keys "channel, hide"
    And "Tech Talk" disappears from the hallway

  @pending @local @HAL-4
  Scenario: Keyword highlight and friends first
    Given I added the hallway keyword "tech"
    And "Ayse" is my friend and speaks in "Music Night"
    When the hallway loads
    Then "Music Night" is listed first with a star next to "Ayse"
    And the word "tech" is highlighted in matching room titles
    And no new request is sent for filtering

  @pending @local @HAL-4
  Scenario: NSFW rooms are hidden by default
    Given the hallway contains a room marked NSFW
    Then that room is not shown
    When I turn on "Show NSFW rooms"
    Then that room is shown

  @pending @observed @HAL-5
  Scenario: Search with result tabs
    When I search for "jazz"
    Then a "POST /web_api/search" request is sent with body keys "query, limit_to_object_types"
    And I can switch between the tabs "Top", "People", "Rooms" and "Houses"

  @pending @observed @HAL-6
  Scenario: Saved search columns refresh slowly and pause when hidden
    Given I saved the search column "jazz"
    When 60 seconds pass
    Then one "search" request is sent for "jazz"
    When the window has been hidden for 5 minutes
    Then no "search" request is sent
    And the saved column "jazz" is still there after restart

  @pending @community @SO-3
  Scenario: Online friends and joining their room
    Given experimental actions are on
    When I open the online friends panel
    Then a "POST /web_api/get_online_friends" request is sent
    And friends in a room show the room title and a "Join" button
    When I click "Join" next to "Ayse"
    Then the room join flow starts for her room
