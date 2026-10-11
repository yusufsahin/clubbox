# PRD: SO-6, HAL-8, RL-12, DX-14
Feature: Houses, events and replays
  As a community member
  I want my houses, upcoming events and replays in one place
  So that I can plan and catch up from my desktop

  Background:
    Given I am signed in with a web session

  @pending @bundle @SO-6
  Scenario: My houses and a house page
    When I open Houses
    Then a "POST /web_api/get_user_social_clubs" request is sent with the documented body keys
    When I open the house "h1"
    Then a "POST /web_api/get_social_club" request is sent with the documented body keys
    And I see its description, members count and live rooms

  @pending @bundle @SO-6
  Scenario: House members
    When I open the members of the house "h1"
    Then a "POST /web_api/get_social_club_members" request is sent with the documented body keys

  @pending @bundle @SO-6
  Scenario: House chat read and post
    When I open the chat of the house "h1"
    Then a "POST /web_api/get_social_club_messages" request is sent with the documented body keys
    When I post "hello" and I am allowed to post
    Then a "POST /web_api/send_social_club_message" request is sent with the documented body keys
    And when I am not allowed to post the input says "Only admins and leaders can post"

  @pending @observed @SO-6
  Scenario: Host a room in a house
    Given I am an admin of the house "h1"
    When I start a room for the house "h1"
    Then a "POST /web_api/create_channel" request is sent with privacy level "club" and the documented house id key

  @pending @community @HAL-8
  Scenario: Upcoming events
    Given experimental actions are on
    When I open Events
    Then a "GET /web_api/get_events" request is sent with query keys "is_filtered, page_size, page"
    And each event has "Copy link" and "Add to calendar"
    When I click "Add to calendar"
    Then an .ics file is saved with the event title and time

  @pending @bundle @RL-12
  Scenario: Play a saved replay
    When I open a saved replay
    Then a "POST /web_api/get_replay_channel" request is sent with the documented body keys
    And I can play at 1x, 1.5x and 2x and skip 15 seconds

  @pending @bundle @DX-14
  Scenario: Highlights play like replays
    When I open a highlight
    Then a "POST /web_api/get_highlight" request is sent with the documented body keys
