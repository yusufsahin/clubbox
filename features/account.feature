# PRD: ACC-1 … ACC-8
Feature: Account, first run and app preferences
  As any Clubbox user
  I want a safe sign-in and app-level preferences
  So that I can use Clubbox comfortably without risking my account

  @observed @ACC-1
  Scenario: Sign in happens on a visible Clubhouse sign-in surface
    Given I am signed out
    When I click "Sign in"
    Then a visible Clubhouse sign-in surface opens "https://www.clubhouse.com/signin"
    And Clubbox never calls reCAPTCHA itself
    And after the window reports a session, a "POST /web_api/me" request is sent
    And I see my name in the sidebar

  @ACC-7
  Scenario: One-device warning before sign-in
    Given I am signed out
    When I click "Sign in"
    Then I see "Clubhouse allows one active device. Signing in here may sign you out on your phone."

  @ACC-2
  Scenario: Live mode stays blocked until the first-run notice is accepted
    Given I have never accepted the first-run notice
    When I try to switch to live mode
    Then I see the unofficial-client notice with "I understand" and "Cancel"
    And no "web_api" request is sent until I click "I understand"

  @ACC-3
  Scenario: Log out clears the session
    Given I am signed in with a web session
    And I am in the room "abc123"
    When I click "Log out" and confirm
    Then a "POST /web_api/leave_channel" request is sent with body keys "channel"
    And clubhouse.com cookies for the app session are cleared
    And no timer sends requests afterwards
    And I see the sign-in screen

  @ACC-4
  Scenario Outline: Theme follows my choice
    When I choose the theme "<theme>"
    Then the app uses the <result> colors
    And the choice is kept after restart

    Examples:
      | theme  | result              |
      | light  | light               |
      | dark   | dark                |
      | system | operating system's  |

  @ACC-5
  Scenario: Zoom with keyboard shortcuts
    When I press Ctrl+= twice
    Then the zoom level is 120 percent
    When I press Ctrl+0
    Then the zoom level is 100 percent

  @ACC-6
  Scenario: Language switch covers every visible string
    When I switch the language to "tr"
    Then every string on every view comes from src/i18n/tr.ts
    And no English fallback text is visible

  @community @ACC-8
  Scenario: Desktop notification when pinged into a live room
    Given desktop notifications are on
    And the window is minimized
    When an activity item "pinged you into <room>" arrives for a live room
    Then a desktop notification shows the room title
    And clicking it opens Clubbox and joins the room
