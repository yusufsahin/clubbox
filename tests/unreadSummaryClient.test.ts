import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient, ClubhouseApiError } from '../src/api/client.ts';

test('getConversationUnreadSummary refuses an empty conversation id before transport', async () => {
  const client = new ClubhouseApiClient();
  await client.updateConfig({ useSandbox: true });
  await assert.rejects(
    () => client.getConversationUnreadSummary(''),
    (err: unknown) => err instanceof ClubhouseApiError
      && err.endpoint === 'get_conversation_unread_summary'
      && /Conversation id is required/i.test(err.message),
  );
  await assert.rejects(
    () => client.getConversationUnreadSummary('   '),
    (err: unknown) => err instanceof ClubhouseApiError && err.endpoint === 'get_conversation_unread_summary',
  );
});
