import assert from 'node:assert/strict';
import test from 'node:test';
import { clubhouseClient } from '../src/api/client.ts';
import { loadEvents } from '../src/app/activityCtl.ts';
import type { ClubboxApp } from '../src/app/clubboxApp.ts';

test('loadEvents re-renders when Events are shown under the Activity tab', async () => {
  const prev = clubhouseClient.getConfig();
  await clubhouseClient.updateConfig({ useSandbox: true, experimentalActions: true });

  let renders = 0;
  const app = {
    currentTab: 'activity' as const,
    eventsList: null as unknown[] | null,
    render() {
      renders += 1;
    },
    reportApiError() {
      // ignore
    },
  };

  try {
    await loadEvents.call(app as unknown as ClubboxApp);
    assert.ok(Array.isArray(app.eventsList));
    assert.ok(renders >= 1, 'Activity tab must re-render after events load finishes');
  } finally {
    await clubhouseClient.updateConfig({
      useSandbox: prev.useSandbox,
      experimentalActions: prev.experimentalActions,
    });
  }
});

test('loadEvents clears the loading state after a failed live call on Activity', async () => {
  const prev = clubhouseClient.getConfig();
  // Community route with experimental off → supports() false → empty list + render.
  await clubhouseClient.updateConfig({ useSandbox: false, webSession: true, experimentalActions: false });

  let renders = 0;
  const app = {
    currentTab: 'activity' as const,
    eventsList: null as unknown[] | null,
    render() {
      renders += 1;
    },
    reportApiError() {
      // ignore
    },
  };

  try {
    await loadEvents.call(app as unknown as ClubboxApp);
    assert.deepEqual(app.eventsList, []);
    assert.ok(renders >= 1);
  } finally {
    await clubhouseClient.updateConfig({
      useSandbox: prev.useSandbox,
      webSession: prev.webSession,
      experimentalActions: prev.experimentalActions,
    });
  }
});
