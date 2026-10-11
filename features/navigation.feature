# NAVIGATION.md §3–§4 — information architecture and navigation behaviour
Feature: Navigation
  As any Clubbox user
  I want one clear place for everything and a way back from everywhere
  So that I always know where I am and never get stuck

  Background:
    Given I am signed in with a web session

  @pending @NAV-1
  Scenario: The sidebar has only the agreed sections
    Then the sidebar shows exactly "Hallway", "Discover", "Messages", "Activity", "Soundboard" and "Recordings" in that order
    And the sidebar has no "Friends", "Houses", "Events", "Live Stage", "Start a Room" or "API & Config" item

  @pending @NAV-2
  Scenario Outline: Former places live where Clubhouse users expect them
    When I open "<old place>"
    Then I am on "<new place>"

    Examples:
      | old place           | new place               |
      | Friends             | Discover › People       |
      | Houses              | Discover › Houses       |
      | Events              | Activity › Events       |
      | API & Config        | Settings › Advanced     |

  @pending @NAV-3
  Scenario: One way to start a room
    Then there is exactly one "Start a room" button and it is in the top bar
    And pressing Ctrl+N opens the room composer

  @pending @NAV-4
  Scenario: Being in a room does not change the page header
    Given I am in the room "Tech Talk"
    When I open Messages
    Then the header says "Messages"
    And the cockpit shows "Tech Talk" with Leave
    And the sidebar shows a "Now in: Tech Talk" card

  @pending @NAV-5
  Scenario: Minimize returns to where I was
    Given I opened Messages
    And I joined the room "Tech Talk" from a link in a conversation
    When I minimize the room
    Then I am on "Messages"

  @pending @NAV-6
  Scenario: Back and forward work everywhere
    Given I opened Discover › Houses › "Builders" › Members
    When I press Alt+Left
    Then I am on "Builders"
    And the breadcrumb shows "Discover › Houses › Builders"
    When I press Alt+Left
    Then I am on "Discover › Houses"
    When I press Alt+Right
    Then I am on "Builders"

  @pending @NAV-6
  Scenario: Esc closes the topmost layer first
    Given I opened Hallway
    And a profile sheet is open over it
    When I press Esc
    Then the profile sheet is closed
    And I am still on "Hallway"

  @pending @NAV-7
  Scenario: Exactly one active indicator
    When I open my profile
    Then the avatar is marked active
    And no sidebar section is marked active

  @pending @NAV-8
  Scenario: Section state is kept
    Given I scrolled the hallway down and opened Discover › Houses
    When I go back to Hallway
    Then the hallway scroll position is restored
    And returning to Discover shows the "Houses" tab

  @pending @NAV-9
  Scenario: Badges only signal attention
    Given I have 3 unread conversations and unread activity
    Then "Messages" shows the badge "3"
    And "Activity" shows a dot
    And "Hallway" and "Soundboard" show no badge

  @pending @NAV-10
  Scenario: Settings are split from developer tools
    When I open Settings
    Then I see the sections "General", "Audio", "Shortcuts", "Account", "Privacy & recording" and "Advanced"
    And runtime mode, request headers, API Health and experimental actions are only under "Advanced"

  @pending @NAV-11
  Scenario Outline: Global search and paste-to-open
    When I press Ctrl+K and enter "<input>"
    Then <result>

    Examples:
      | input                                   | result                                   |
      | jazz                                    | I see people, rooms and houses for "jazz" |
      | https://www.clubhouse.com/room/PG2LoOww | the room "PG2LoOww" opens                 |
      | https://www.clubhouse.com/@someone      | the profile sheet of "someone" opens      |

  @pending @NAV-12
  Scenario Outline: Section shortcuts
    When I press <keys>
    Then I am on "<place>"

    Examples:
      | keys   | place      |
      | Ctrl+1 | Hallway    |
      | Ctrl+2 | Discover   |
      | Ctrl+3 | Messages   |
      | Ctrl+4 | Activity   |
      | Ctrl+5 | Soundboard |
      | Ctrl+, | Settings   |

  @pending @NAV-13
  Scenario: No page repeats its title
    When I open each section
    Then the page content never repeats the header title as a heading

  @pending @NAV-14
  Scenario: Toasts never show placeholder icons
    Then no toast in the app uses "??" as its icon
