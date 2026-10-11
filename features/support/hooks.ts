import { Before } from '@cucumber/cucumber';
import { RoomSessionController } from '../../src/api/roomSession.ts';
import { FakeAgora } from './fakeAgora.ts';
import type { ClubboxWorld } from './world.ts';

Before(function (this: ClubboxWorld) {
  this.transport.clearRequests();
  this.agora = new FakeAgora();
  this.session = new RoomSessionController({
    client: this.client,
    agora: this.agora,
    myUserId: this.myUserId,
    setInterval: (fn, ms) => this.clock.setInterval(fn, ms),
    clearInterval: (id) => this.clock.clearInterval(id),
  });
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
  this.listeners = [];
  this.speakerUserIds = [];
  this.visibleControls.clear();
  this.invitedToSpeak = false;
  this.chatPanelOpen = false;
  this.micMuted = false;
  this.currentRoom = null;
  this.role = null;
  this.hallwayRoom = null;
  this.setVisibility('visible');
});
