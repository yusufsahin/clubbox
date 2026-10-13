# PRD: ST-11 — mix voice + external audio into the room without virtual cables (Clubdeck: "How to mix voice + external audio")
Feature: External audio into the room
  As a host, DJ or podcaster
  I want to add music or another audio source next to my voice
  So that the room hears both, balanced, without installing Voicemeeter or Loopback

  Background:
    Given I am signed in with a web session
    And I am in the room "Morning show" as a speaker

  @local @ST-11
  Scenario: Add a second input as "External audio"
    When I open Details › Audio and choose "VB-Audio Cable" as External audio
    Then the external source is mixed into the broadcast and the recording
    And it is opened without echo cancellation, noise suppression and auto gain
    And it is not played back on my own output unless I turn on "Monitor external"
    And it has its own volume, mute and level meter

  @local @ST-11
  Scenario: Mic mute does not mute the music
    Given External audio is playing
    When I mute my microphone
    Then the room still hears the external audio

  @local @ST-11
  Scenario: Cockpit Music mute stops external audio
    Given External audio is playing
    When I mute music from the cockpit
    Then the room no longer hears the external audio
    When I unmute music from the cockpit
    And I mute my microphone
    Then the room still hears the external audio

  @local @ST-11
  Scenario: Auto-duck music under my voice
    Given External audio is playing and "Duck under voice" is on
    When I speak
    Then the external audio is lowered by the duck amount within 100 ms
    And it returns to its level about 500 ms after I stop

  @local @ST-11
  Scenario: Music quality suggestion
    When I start External audio while audio quality is "Normal"
    Then I am offered to switch to "Music" quality with the headphones warning

  @local @ST-11
  Scenario: System audio capture (Windows) without echo
    When I choose "System audio" as External audio
    Then Clubbox asks me to set its own output to a different device first, because system audio would also capture the room and echo it back
    And System audio is only enabled when Clubbox's output device differs from the system default output

  @local @ST-11
  Scenario: The source is remembered and released
    Given I chose "VB-Audio Cable" as External audio
    When I leave the room
    Then the external device is released
    And it is offered again the next time I am a speaker

  @local @ST-11
  Scenario: Copyright reminder
    When I enable External audio for the first time
    Then I see a one-time reminder that broadcasting music you do not own may break Clubhouse's copyright rules
