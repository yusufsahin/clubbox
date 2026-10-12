# PRD §2 Evidence policy, §8 Live verification loop
Feature: Evidence levels, circuit breaker and API Health
  As the owner
  I want guessed endpoints to fail safely and visibly
  So that I can fix them quickly without risking my account

  Background:
    Given I am signed in with a web session

  Scenario Outline: Which evidence levels are callable
    Given the route "<endpoint>" has evidence "<level>"
    And experimental actions are <experimental>
    Then calling "<endpoint>" is <callable>

    Examples:
      | endpoint        | level       | experimental | callable |
      | get_feed_v3     | observed    | off          | allowed  |
      | join_channel    | bundle      | off          | allowed  |
      | invite_speaker  | community   | off          | allowed  |
      | get_events      | community   | off          | blocked  |
      | get_events      | community   | on           | allowed  |
      | get_followers   | unsupported | on           | blocked  |

  Scenario: A 404 marks the route unsupported
    Given "set_channel_title" will answer 404
    When the app calls "set_channel_title"
    Then "set_channel_title" is "unsupported" for the rest of this install
    And API Health lists "set_channel_title" with status 404

  Scenario: Two consecutive 400 errors disable the route for the session
    Given "emoji_reaction" will answer 400 twice
    When the app calls "emoji_reaction" twice
    Then "emoji_reaction" is disabled until restart
    And the reaction button shows "Temporarily unavailable"

  Scenario: 429 backs off instead of retrying
    Given "get_feed_v3" will answer 429
    When the app calls "get_feed_v3"
    Then no "get_feed_v3" request is sent for 1 minute
    And the next failure doubles the wait, up to 30 minutes

  Scenario: 401 ends the session but 403 does not
    Given "me" will answer 401
    When the app calls "me"
    Then I am sent to the sign-in screen

  Scenario: A successful call promotes a guessed route
    Given the route "end_channel" has evidence "community"
    And request logging is on
    When "end_channel" answers 200
    Then the redacted request log contains "end_channel" with status 200
    And "npm run api:docs" promotes "end_channel" to "observed"

  Scenario: Copy a redacted failure report
    Given API Health lists a failure for "invite_speaker"
    When I click "Copy report"
    Then the clipboard contains the endpoint, method, status, body keys and error message
    And the clipboard contains no token, cookie, phone number, email or user name

  Scenario: Every route has a correct mutation flag
    Then every route whose name starts with "send_", "create_", "delete_", "update_", "set_", "join", "leave", "mark_", "follow", "unfollow", "mute_", "invite_", "uninvite_", "make_", "block_", "end_", "change_", "hide_", "accept_", "reject_", "become_", "add_", "talk", "emoji_reaction", "gif_reaction" or "audience_reply" or ending in "_ping" has mutation true
