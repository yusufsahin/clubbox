# PRD: SO-1, SO-2, SO-8, SO-9 — profiles as in the Clubhouse app, limited to what the web client provides
# Web profile fields (bundle parseUserProfile): bio, can_dm, can_wave, displayname, follow_status, follows_me,
# has_protected_profile, instagram, twitter, mutual_follows(+count), mutual_cofollows(+count), num_followers,
# num_following, num_cofollows, social_clubs, url, chatting_with. No polls, clips, replays or karma on web.
Feature: Profiles
  As a Clubhouse member
  I want to see who someone is, who we share, and act on it from their profile
  So that I do not need the phone app to message, talk or follow

  Background:
    Given I am signed in with a web session

  @pending @observed @SO-8
  Scenario: Actions on someone's profile
    When I open the profile of "Arzu" who can receive DMs and waves
    Then I see the actions "Message", "Talk live", the follow control and "Share"
    And "Message" is available whether or not I am in a room

  @pending @bundle @SO-8
  Scenario: Message from a profile starts or opens a DM
    When I click "Message" on the profile of "Arzu"
    Then the existing DM with "Arzu" opens, or a "POST /web_api/create_conversation" request is sent with body keys "privacy_level, social_club_id, is_private, user_ids, source"
    And I am on Messages with that conversation open

  @pending @observed @SO-8
  Scenario: Talk live from a profile
    When I click "Talk live" on the profile of "Arzu"
    Then a "POST /web_api/create_channel" request is sent
    And the body field "privacy_level" is "friend"
    And the body field "user_ids" contains the id of "Arzu"

  @pending @observed @SO-8
  Scenario: Actions follow what the profile allows
    When I open the profile of "Cem" who cannot receive DMs or waves
    Then I do not see "Message" or "Talk live"

  @pending @observed @SO-8
  Scenario Outline: Follow control shows the relationship
    When I open the profile of someone whose follow status is "<status>" and who <follows> me
    Then the follow control shows "<label>"

    Examples:
      | status        | follows      | label          |
      | not_following | follows      | Follow back    |
      | not_following | does not follow | Follow      |
      | following     | follows      | Friends        |
      | following     | does not follow | Following   |
      | requested     | does not follow | Requested   |

  @pending @observed @SO-9
  Scenario: Profile sections
    When I open the profile of "Arzu"
    Then I see her houses as cards that open the house page
    And I see "Recently chatting with" with up to 5 people that open their profiles
    And I see her X and Instagram links when present, opened in the browser
    And I see "In a room now: <title> · Join" when she is speaking or listening in a room I can see in the hallway

  @pending @observed @SO-9
  Scenario: Mutual people are clickable lists
    Given "Arzu" has 12 mutual friends and I receive 3 of them
    When I click "Mutual friends" on her profile
    Then a list shows the 3 people with avatars, each opening their profile
    And the list says "and 9 more not shown by Clubhouse web"

  @pending @observed @SO-2
  Scenario: Counts that cannot be listed say so
    When I open the profile of "Arzu"
    Then the followers, following and friends counts are shown
    And clicking them shows "Clubhouse web does not provide this list" instead of an empty page

  @pending @observed @SO-9
  Scenario: Private profiles
    When I open the profile of "Deniz" who has a protected profile and is not my friend
    Then I see "Private profile" and a "Request" follow control
    And houses and recently chatting are not shown

  @pending @bundle @SO-9
  Scenario: My own profile
    When I open my profile
    Then I see my counts, bio, my houses (from get_user_social_clubs), recently chatting, share profile and account settings
    And polls, clips, replays and karma are not shown because Clubhouse web does not provide them
