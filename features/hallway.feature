# PRD: HAL-1 … HAL-6, SO-3
Feature: Hallway and discovery
  As a power listener
  I want a hallway I can filter, search and act on quickly
  So that I find the right rooms without scrolling on my phone

  Background:
    Given I am signed in with a web session

  @observed @HAL-1
  Scenario: Hallway loads on open and on refresh only
    When I open the hallway
    Then a "POST /web_api/get_feed_v3" request is sent
    And I see topic chips from "available_topics"
    When 5 minutes pass without interaction
    Then no further "get_feed_v3" request is sent
    When I click "Refresh"
    Then a "POST /web_api/get_feed_v3" request is sent

  @observed @HAL-1
  Scenario: Selecting a topic chip filters the hallway
    Given the hallway has topics "tech" and "music"
    When I select the topic chip "tech"
    Then only rooms for "tech" are shown

  @observed @HAL-2
  Scenario: Room card shows everything needed to decide
    Given the hallway shows the room "Tech Talk" with channel "abc123"
    Then its card shows the title, the house name, replays on/off, clips on/off, how long it has been running, the listener count and the speaker count
    When I click "Copy link" on "Tech Talk"
    Then the clipboard contains "https://www.clubhouse.com/room/abc123"

  @community @HAL-3
  Scenario: Hide a room from the hallway
    Given experimental actions are on
    And the hallway shows the room "Tech Talk" with channel "abc123"
    When I click "Hide" on "Tech Talk"
    Then a "POST /web_api/hide_channel" request is sent with body keys "channel, hide"
    And "Tech Talk" disappears from the hallway

  @local @HAL-4
  Scenario: Keyword highlight and friends first
    Given I added the hallway keyword "tech"
    And "Ayse" is my friend and speaks in "Music Night"
    When the hallway loads
    Then "Music Night" is listed first with a star next to "Ayse"
    And the word "tech" is highlighted in matching room titles
    And no new request is sent for filtering

  @local @HAL-4
  Scenario: NSFW rooms are hidden by default
    Given the hallway contains a room marked NSFW
    Then that room is not shown
    When I turn on "Show NSFW rooms" for the hallway
    Then that room is shown

  @observed @HAL-5
  Scenario: Search with result tabs
    When I search for "jazz"
    Then a "POST /web_api/search" request is sent with body keys "query, limit_to_object_types"
    And I can switch between the tabs "Top", "People", "Rooms" and "Houses"

  @observed @HAL-6
  Scenario: Saved search columns refresh slowly and pause when hidden
    Given I saved the search column "jazz"
    When 60 seconds pass
    Then one "search" request is sent for "jazz"
    When the window has been hidden for 5 minutes
    Then no "search" request is sent
    And the saved column "jazz" is still there after restart

  @community @SO-3
  Scenario: Online friends and joining their room
    Given experimental actions are on
    When I open the online friends panel
    Then a "POST /web_api/get_online_friends" request is sent
    And friends in a room show the room title and a "Join" button
    When I click "Join" next to "Ayse"
    Then the room join flow starts for her room

  @bundle @HAL-1
  Scenario: Load more rooms
    Given the hallway returned a next_cursor
    When I scroll to the end of the hallway
    Then a "POST /web_api/get_feed_v3" request is sent with body keys "next_cursor"

  @bundle @HAL-7
  Scenario: Open a profile from a pasted @username link
    When I paste "https://www.clubhouse.com/@someone" into search and press Enter
    Then a "POST /web_api/get_profile" request is sent with body keys "username"

  @local @HAL-1
  Scenario: Topic chips are hidden when live rooms carry no topic
    Given the live hallway has the rooms "Tech Talk" and "Music Night" without topic tags
    And the feed offers the topics "tech" and "music"
    Then no topic chips are shown
    And selecting the topic "tech" still lists 2 rooms

  @local @HAL-4
  Scenario: Only show rooms matching my keywords
    Given the live hallway has the rooms "Tech Talk Live" and "Morning coffee" without topic tags
    And my hallway keyword is "tech"
    When I switch on the hallway option "Only show rooms matching my keywords"
    Then the hallway lists only "Tech Talk Live"
    When I switch the hallway option off
    Then the hallway lists "Tech Talk Live" before "Morning coffee"

  # Live get_feed_v3 (52 first pages): house 86 %, public 13 %, friend_of_friend 1.6 %, friend 0.
  # Web ChannelPrivacyLevel enum: dm, friend, friend_of_friend, house; the feed also sends public.
  @local @HAL-9
  Scenario: Room type chips show what the feed holds
    Given the live hallway has 10 house rooms, 2 public rooms and 1 friends-of-friends room
    Then I see the room type chips "All 13", "Public 2", "Friends of friends 1" and "Houses 10"
    And there is no "Friends" chip because no friends room is listed
    When I select the room type "Public"
    Then the hallway lists only the 2 public rooms

  @local @HAL-9
  Scenario: A sparse room type loads more of the feed
    Given the live hallway first page has 1 public room and more pages are available
    When I select the room type "Public"
    Then Clubbox loads further feed pages until at least 5 public rooms are listed or 8 pages are loaded
    And the hallway says how many pages were checked

  @local @HAL-9
  Scenario: Every card shows its room type
    Given the live hallway has a public room "Open mic" and a friends-of-friends room "Late chat"
    Then the card "Open mic" shows the badge "Public"
    And the card "Late chat" shows the badge "Friends of friends"

  @local @HAL-9
  Scenario: Empty room type explains why
    Given the live hallway has no friends rooms after 8 pages
    When I select the room type "Friends"
    Then I see "Clubhouse web does not list rooms only for friends. Rooms your friends start for you appear in Activity or as an invite."
