import { Before } from '@cucumber/cucumber';
import { FakeAgora } from './fakeAgora.ts';
import type { ClubboxWorld } from './world.ts';

Before(function (this: ClubboxWorld) {
  this.transport.clearRequests();
  this.agora = new FakeAgora();
  this.apiHealth = [];
  this.routeOverrides.clear();
  this.uiMessages = [];
  this.clipboard = '';
  this.redactedLog = [];
  this.lastError = null;
  this.pendingExperimental = null;
  this.presenceTimer = null;
  this.chapterLines = [];
  this.chaptersSaved = false;
  this.recording = false;
  this.setVisibility('visible');
});
