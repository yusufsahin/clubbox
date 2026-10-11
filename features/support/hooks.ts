import { Before } from '@cucumber/cucumber';
import { RoomSessionController } from '../../src/api/roomSession.ts';
import { FakeAgora } from './fakeAgora.ts';
import { defaultHallwayPrefs } from '../../src/hallway/hallwayPrefs.ts';
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
  this.userCapabilityOverrides = {};
  this.speakerMuteVisible = true;
  this.pendingBlockConfirm = false;
  this.onStageUsers = [];
  this.invitedToSpeak = false;
  this.chatPanelOpen = false;
  this.micMuted = false;
  this.currentRoom = null;
  this.role = null;
  this.hallwayRoom = null;
  this.hallwayRooms = [];
  this.hallwayPrefs = defaultHallwayPrefs();
  this.hallwayDisplayRooms = [];
  this.hallwayTopics = [];
  this.selectedTopic = null;
  this.searchTabs.clear();
  this.sidebarName = null;
  this.openedSignInUrl = null;
  this.calledRecaptcha = false;
  this.guidelinesAcceptedFlag = true;
  this.guidelinesGateOpen = false;
  this.liveModeBlocked = false;
  this.profileOpen = null;
  this.profileFollowing = false;
  this.musicMode = false;
  this.speaking = false;
  this.lastMicConstraints = null;
  this.monitorEnabled = false;
  this.hearOwnMic = false;
  this.inputDeviceLabel = '';
  this.outputDeviceLabel = '';
  this.micGainPercent = 100;
  this.studioPads = [{ name: 'Applause', hotkey: '1', playing: false }];
  this.soundboardVolume = 0.8;
  this.soundboardVolumeBeforeDuck = null;
  this.setLang('en');
  this.agora.republishCount = 0;
  this.agora.lastEncoder = null;
  this.setVisibility('visible');
});
