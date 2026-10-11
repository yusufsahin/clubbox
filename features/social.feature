# PRD: SO-1, SO-2, SO-5, RL-9
Feature: Profiles, follows, activity and private chat
  As a Clubhouse member
  I want to see people and what happened while I was away
  So that I can stay connected from my desktop

  Background:
    Given I am signed in with a web session

  @pending @observed @SO-1
  Scenario: Open a profile
    When I open the profile of user "u1"
    Then a "POST /web_api/get_profile" request is sent with body keys "user_id"
    And I see the followers, following and friends counts as plain text
    And I see "Mutual: A, B and N others" from mutual_follows

  @pending @bundle @SO-1
  Scenario: Follow and unfollow
    When I click "Follow" on the profile of user "u1"
    Then a "POST /web_api/follow" request is sent with body keys "user_id"
    When I click "Following" on the profile of user "u1"
    Then the request used for unfollow is the documented one, or the button is a non-clickable "Following" when none is documented

  @pending @SO-2
  Scenario: Full follower lists are not offered on web
    When I open the profile of user "u1"
    Then I see "Full lists are not available on Clubhouse web."
    And no list request is sent

  @pending @observed @SO-5
  Scenario: Activity shows edge stories and notifications
    When I open Activity
    Then a "GET /web_api/get_edge_stories" request is sent
    And the unread dot follows "has_unread_notifications" from me

  @pending @community @SO-5
  Scenario: Notifications page (experimental)
    Given experimental actions are on
    When I open Activity
    Then a "GET /web_api/get_notifications" request is sent with query keys "page_size, page"
    And "pinged you into" items show "Join" while the room is live

  @pending @observed @RL-9
  Scenario: Private text chat with someone in the room
    Given I am in the room "abc123"
    When I open a private chat with "Ayse" from her card and send "hi"
    Then the message is sent through the documented conversation endpoint
    And I stay in the room without interrupting the audio
