# NAVIGATION.md v2 — five places, one action, one room bar, one way back
Feature: Navigation
  As any Clubbox user
  I want few places, one way to do each thing and a way back from everywhere
  So that I always know where I am

  Background:
    Given I am signed in with a web session

  @pending @NAV-1
  Scenario: Five places in the sidebar
    Then the sidebar shows exactly "Hallway", "Discover", "Messages", "Activity" and "Soundboard" in that order
    And the sidebar ends with my profile card and a settings button

  @pending @NAV-2
  Scenario Outline: Former places live in the merged pages
    When I look for "<old place>"
    Then I find it on "<new place>"

    Examples:
      | old place    | new place |
      | Friends      | Discover  |
      | Houses       | Discover  |
      | Events       | Activity  |
      | API & Config | Settings  |

  @pending @NAV-3
  Scenario: One way to start a room
    Then there is exactly one "Start a room" button and it is in the top bar
    And pressing Ctrl+N opens the room composer

  @pending @NAV-4
  Scenario: The room is a bottom bar, not a header takeover
    Given I am in the room "Tech Talk"
    When I open Messages
    Then the top bar title is "Messages"
    And the bottom bar shows "Tech Talk" with Leave
    When I click "Tech Talk" in the bottom bar
    Then the room page opens

  @pending @NAV-5
  Scenario: Minimize and Leave return to where I was
    Given I am on Messages
    And I open the room "Tech Talk"
    When I minimize the room
    Then I am on "Messages"
    When I open the room "Tech Talk" and leave it
    Then I am on "Messages"

  @pending @NAV-6
  Scenario: One way back from every sub-page
    Given I am on Discover
    When I open the house "Builders"
    Then the top bar shows a back arrow
    When I press Esc
    Then I am on "Discover"

  @pending @NAV-7
  Scenario: Exactly one highlighted item
    When I open my profile
    Then my profile card is highlighted
    And no sidebar place is highlighted

  @pending @NAV-9
  Scenario: Badges only signal attention
    Given I have 3 unread conversations and unread activity
    Then "Messages" shows the badge "3"
    And "Activity" shows a dot
    And "Hallway", "Discover" and "Soundboard" show no badge

  @pending @NAV-10
  Scenario: Settings for users, Advanced for developers
    When I open Settings
    Then I see "General", "Audio" and "Account"
    And runtime mode, request headers, API Health and experimental actions are inside a collapsed "Advanced" section

  @pending @NAV-13
  Scenario: No page repeats its title
    When I open each place
    Then the page content never repeats the top bar title as a heading

  @pending @NAV-14
  Scenario: Toasts never show placeholder icons
    Then no toast in the app uses "??" as its icon
