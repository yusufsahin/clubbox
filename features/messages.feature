# PRD: SO-4 — DESIGN G-05
Feature: Messages (VMs and house chats)
  As a member
  I want to read and reply to voice and text messages on my desktop
  So that I can keep conversations going while I work

  Background:
    Given I am signed in with a web session

  @observed @SO-4
  Scenario: Conversation list
    When I open Messages
    Then a "POST /web_api/get_conversations" request is sent with body keys "is_private_only"
    And I can filter "All" and "DMs"

  @observed @SO-4
  Scenario: Open a thread in live mode
    When I open the conversation "c1"
    Then a "POST /web_api/get_conversation" request is sent
    And I see its segments with transcriptions and reactions
    And no sandbox data is used

  @observed @SO-4
  Scenario: Listening marks a voice segment as listened
    Given the conversation "c1" has an unheard voice segment
    When it finishes playing
    Then a "POST /web_api/mark_conversation_segment_listened" request is sent

  @observed @SO-4
  Scenario: Playback speed
    When I play a voice segment at 2x
    Then it plays at double speed with pitch preserved

  @bundle @SO-4
  Scenario Outline: Reply in a thread
    When I send a <kind> reply in the conversation "c1"
    Then a "POST /web_api/add_conversation_segment" request is sent with the documented body keys

    Examples:
      | kind  |
      | text  |
      | voice |

  @bundle @SO-4
  Scenario: Start a new VM with two friends
    When I start a new VM with "Ayse" and "Ali"
    Then a "POST /web_api/create_conversation" request is sent with the documented body keys

  @observed @SO-4
  Scenario: React to a segment
    When I react "❤️" to a segment in "c1"
    Then a "POST /web_api/send_conversation_emoji_reaction" request is sent with the documented body keys
    And a 400 answer is shown in API Health instead of failing silently

  @bundle @SO-4
  Scenario: Unread badge
    Then the Messages badge uses "get_conversation_unread_summary" when documented, otherwise "unread_conversations_count" from me

  @pending @bundle @SO-4
  Scenario: Rename and delete a conversation
    When I rename the conversation "c1" to "Weekend plans"
    Then a "POST /web_api/update_conversation_title" request is sent with body keys "conversation_id, title"
    When I delete the conversation "c1" and confirm
    Then a "POST /web_api/delete_conversation" request is sent with body keys "conversation_id"

  @pending @bundle @SO-4
  Scenario: Load older conversations
    Given the conversation list returned a next_cursor
    When I scroll to the end of the list
    Then a "POST /web_api/get_conversations" request is sent with body keys "is_private_only, next_cursor"
