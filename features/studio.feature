# PRD: ST-4, ST-5, HAL-7, RL-10 (Clubdeck-inspired, no API needed)
Feature: Studio tools that work without new endpoints
  As a podcaster or host
  I want recording chapters, link opening and audience search
  So that Clubbox is better than the phone for producing shows

  @local @ST-5
  Scenario: Add chapters while recording
    Given I am in a room where replays are on
    And local recording is allowed in Settings
    And I started recording at "00:00:00"
    When I press Ctrl+T at "00:05:57" and type "Talking about stuff"
    And I stop recording at "00:10:00"
    Then a chapters file is saved next to the recording
    And it contains the line "00:00:00 Intro"
    And it contains the line "00:05:57 Talking about stuff"
    And it contains the line "(00:05:57) Talking about stuff"

  @local @ST-4
  Scenario: Recording is refused in a room without replays
    Given I am in a room where replays are off
    When I press R
    Then recording does not start
    And I see "Recording is only available in rooms with replays on"

  @local @HAL-7
  Scenario Outline: Paste a Clubhouse link to open it
    When I paste "<link>" into search and press Enter
    Then Clubbox opens the <target>

    Examples:
      | link                                         | target         |
      | https://www.clubhouse.com/room/PG2LoOww      | room "PG2LoOww" |
      | https://www.clubhouse.com/@someone           | profile of "someone" |
      | https://evil.example.com/room/PG2LoOww        | nothing and shows "Only clubhouse.com links" |

  @local @RL-10
  Scenario: Search the audience by name or bio
    Given I am in a room with 40 listeners
    When I press Ctrl+S and type "marketing"
    Then only listeners whose name or bio contains "marketing" are shown
    And no new request is sent
