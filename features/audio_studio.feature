# PRD: ST-1, ST-2, ST-3, ST-6, ST-7, ST-8, ST-9, RL-11 — regression guard for existing studio features
Feature: Audio studio
  As a host, musician or podcaster
  I want professional audio control on my computer
  So that I sound better than on my phone

  @pending @local @ST-1
  Scenario: Devices and levels persist
    When I choose the input device "USB Mic" and the output device "Headphones"
    And I set the mic gain to 80 percent
    And I restart Clubbox
    Then "USB Mic", "Headphones" and 80 percent are still selected

  @pending @local @ST-1
  Scenario: Monitor is off by default
    Then I do not hear my own microphone
    When I turn on "Hear myself"
    Then my microphone is routed to the output

  @pending @local @ST-2
  Scenario: Music mode disables voice processing and warns about headphones
    When I turn on music mode
    Then the microphone is reopened without echo cancellation, noise suppression and auto gain
    And I see "Use headphones in music mode"
    And if I am speaking, Agora republishes with the high-quality stereo profile without leaving the room

  @pending @local @ST-3
  Scenario: Soundboard pads, hotkeys, stop all and duck
    Given the pad "Applause" has the hotkey "1"
    When I press "1"
    Then "Applause" plays into the broadcast mix
    When I press the "Stop all sounds" hotkey
    Then every playing sound stops
    When I hold the duck button
    Then the soundboard volume is 0 until I release it

  @pending @local @ST-3
  Scenario: Custom sounds survive a restart
    When I add the file "intro.mp3" as a pad named "Intro"
    And I restart Clubbox
    Then the pad "Intro" is still there and plays

  @pending @local @ST-6
  Scenario Outline: Clip only where clips are allowed
    Given I am in a room where replays are <replays> and the host <clips> clips
    And local recording is allowed in Settings
    Then the clip button is <state>

    Examples:
      | replays | clips      | state   |
      | on      | enabled    | shown   |
      | on      | disabled   | hidden  |
      | off     | enabled    | hidden  |

  @pending @local @ST-6
  Scenario: Clip length is between 5 and 55 seconds
    Given the clip button is shown
    When I save a clip of 3 seconds
    Then I see "A clip must be at least 5 seconds"
    When I save a clip of 40 seconds
    Then a WAV file of 40 seconds is saved locally and nothing is uploaded

  @pending @local @ST-7
  Scenario: Voice effects preview and apply
    When I pick the voice effect "Radio" and click "Preview"
    Then only I hear the effect
    When I click "Apply"
    Then the broadcast mix uses the effect
    When I pick "None"
    Then my original voice is broadcast

  @pending @local @ST-8
  Scenario Outline: Global shortcuts work when Clubbox is in the background
    Given Clubbox is not the focused window
    When I press the global shortcut for "<action>"
    Then <result>

    Examples:
      | action         | result                                 |
      | mute           | my microphone toggles                  |
      | raise hand     | my hand toggles                        |
      | accept invite  | a pending speaker invite is accepted   |
      | decline invite | a pending speaker invite is declined   |
      | pad 1          | soundboard pad 1 plays                 |

  @pending @local @RL-11
  Scenario: Spatial audio is a local filter
    When I turn on spatial audio
    Then remote speakers are panned across the stereo field on my output
    And the broadcast mix is unchanged

  @pending @local @ST-9 @deferred
  Scenario: Restream (P3, deferred)
    Then this feature is out of scope until the owner schedules it
