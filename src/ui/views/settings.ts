import { t } from '../../i18n';
import type { AppPrefs } from '../../app/appPrefs';
import type { ClubhouseConfig } from '../../api/client';
import type { MeSettings, SoundEffectItem } from '../../api/types';
import { SHORTCUT_ACTIONS, type ShortcutAction, type ShortcutMap } from '../../shortcuts';
import { html, type SafeHtml } from '../html';

export interface AccountReadout {
  settings: MeSettings | null;
  notificationsEnabled: boolean | null;
  soundEffectsEnabled: boolean | null;
  anonymousEnabled: boolean | null;
  blockedCount: number | null;
  isAdmin: boolean;
}

function accountSection(account: AccountReadout | null): SafeHtml {
  if (!account) return html``;
  const settings = account.settings;
  return html`
    <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
      <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">${t('accountSection')}</h3>
      <div class="profile-settings">
        ${settings ? settingRow(t('followerRequests'), settings.follower_requests_enabled) : ''}
        ${settings ? settingRow(t('privateConversations'), settings.private_conversations_enabled) : ''}
        ${settings ? settingRow(t('contactUpload'), settings.contact_upload_enabled) : ''}
        ${account.notificationsEnabled == null ? '' : settingRow(t('notifications'), account.notificationsEnabled)}
        ${account.soundEffectsEnabled == null ? '' : settingRow(t('soundEffectsSetting'), account.soundEffectsEnabled)}
        ${account.anonymousEnabled == null ? '' : settingRow(t('anonymousMode'), account.anonymousEnabled)}
        ${account.isAdmin ? html`<div class="profile-setting-row"><span>${t('accountAdmin')}</span><span>${t('settingOn')}</span></div>` : ''}
        ${account.blockedCount && account.blockedCount > 0 ? html`<div class="profile-setting-row"><span>${t('blocked')}</span><span>${account.blockedCount}</span></div>` : ''}
      </div>
    </div>
  `;
}

function settingRow(label: string, enabled: boolean): SafeHtml {
  return html`<div class="profile-setting-row"><span>${label}</span><span>${enabled ? t('settingOn') : t('settingOff')}</span></div>`;
}

function shortcutLabel(action: ShortcutAction): string {
  if (action === 'mute') return t('shortcutMute');
  if (action === 'clip') return t('shortcutClip');
  if (action === 'raiseHand') return t('shortcutRaiseHand');
  if (action === 'acceptInvite') return t('shortcutAcceptInvite');
  if (action === 'declineInvite') return t('shortcutDeclineInvite');
  return t('shortcutPad', { n: action.slice(3) });
}

export type ApiHealthRow = {
  endpoint: string;
  method: string;
  status: number;
  message: string;
  time: string;
};

export type ConnectionStatusReadout = {
  webSession: boolean;
  realtimeKeys: boolean;
  pubnubConnected: boolean;
  agoraJoined: boolean;
  agoraResult: string | null;
  verboseVoiceLog: boolean;
};

export function settingsView(
  config: ClubhouseConfig,
  shortcuts: ShortcutMap,
  recording: ShortcutAction | null,
  liveOnly: boolean,
  account: AccountReadout | null,
  apiHealth: ApiHealthRow[] = [],
  appPrefs: AppPrefs | null = null,
  soundEffects: SoundEffectItem[] = [],
  editingSoundId: string | null = null,
  connectionStatus: ConnectionStatusReadout | null = null,
): SafeHtml {
  return html`
    <div style="max-width:780px; margin:0 auto;" data-page="settings" data-nav-contains="api-config">
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:28px;">${t('settingsHelp')}</p>

      <section data-settings-section="general">
        <h3 class="settings-section-title">${t('settingsGeneral')}</h3>
        ${appPrefs ? html`
        <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
          <div class="form-group">
            <label class="form-label" for="cfg-language">${t('language')}</label>
            <select class="form-input" id="cfg-language">
              <option value="en" ${config.language === 'en' ? 'selected' : ''}>English</option>
              <option value="tr" ${config.language === 'tr' ? 'selected' : ''}>Türkçe</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="cfg-theme">${t('themeLabel')}</label>
            <select class="form-input" id="cfg-theme">
              <option value="light" ${appPrefs.theme === 'light' ? 'selected' : ''}>${t('themeLight')}</option>
              <option value="dark" ${appPrefs.theme === 'dark' ? 'selected' : ''}>${t('themeDark')}</option>
              <option value="system" ${appPrefs.theme === 'system' ? 'selected' : ''}>${t('themeSystem')}</option>
            </select>
          </div>
          <label style="display:flex; align-items:flex-start; gap:8px; margin-top:12px; cursor:pointer;">
            <input type="checkbox" id="cfg-desktop-notifications" ${appPrefs.desktopNotifications ? 'checked' : ''} />
            <span><strong>${t('desktopNotifications')}</strong><br />${t('desktopNotificationsHelp')}</span>
          </label>
          <p style="font-size:12px; color:var(--text-muted); margin-top:12px;">${t('zoomLevel')}: ${appPrefs.zoomPercent}% (Ctrl+= / Ctrl+- / Ctrl+0)</p>
        </div>
        ` : html`
        <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="cfg-language">${t('language')}</label>
            <select class="form-input" id="cfg-language">
              <option value="en" ${config.language === 'en' ? 'selected' : ''}>English</option>
              <option value="tr" ${config.language === 'tr' ? 'selected' : ''}>Türkçe</option>
            </select>
          </div>
        </div>
        `}
      </section>

      <section data-settings-section="audio">
        <h3 class="settings-section-title">${t('settingsAudio')}</h3>
      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">${t('audioDevices')}</h3>
        <div class="form-group">
          <label class="form-label" for="cfg-input-device">${t('inputDevice')}</label>
          <select class="form-input" id="cfg-input-device">
            <option value="">${t('systemDefault')}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="cfg-output-device">${t('outputDevice')}</label>
          <select class="form-input" id="cfg-output-device">
            <option value="">${t('systemDefault')}</option>
          </select>
          <p id="output-device-note" hidden style="font-size:12px; color:var(--text-dim); margin-top:8px;">${t('outputUnsupported')}</p>
        </div>
        <p class="list-note" style="margin-top:12px;">${t('recordingNeedsConsent')}</p>
        <div class="virtual-cable-guide" data-virtual-cable-guide style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border-subtle);">
          <h4 style="font-size:14px; font-weight:700; margin-bottom:6px;">${t('virtualCableGuideTitle')}</h4>
          <p class="list-note">${t('virtualCableGuideBody')}</p>
        </div>
      </div>

      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:6px;">${t('globalShortcuts')}</h3>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">${t('globalShortcutsHelp')}</p>
        ${SHORTCUT_ACTIONS.map((action) => html`
          <div class="shortcut-row">
            <span class="shortcut-label">${shortcutLabel(action)}</span>
            <span class="shortcut-combo">${shortcuts[action] || t('shortcutNone')}</span>
            <button class="btn btn-secondary" type="button" data-action="record-shortcut" data-shortcut="${action}">
              ${recording === action ? t('shortcutPress') : t('shortcutChange')}
            </button>
            <button class="btn btn-secondary" type="button" data-action="clear-shortcut" data-shortcut="${action}" ${shortcuts[action] ? '' : 'disabled'}>
              ${t('shortcutClear')}
            </button>
          </div>
        `)}
      </div>
      </section>

      <section data-settings-section="sounds">
        <h3 class="settings-section-title">${t('settingsSounds')}</h3>
        <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;" data-settings-sounds>
          <p class="list-note">${t('soundboardHelp')}</p>
          <label class="btn btn-primary" style="cursor:pointer; margin:12px 0; display:inline-flex;">
            ${t('uploadSound')}
            <input type="file" id="sound-upload-input" accept="audio/*" style="display:none;" />
          </label>
          <div class="soundboard-grid">
            ${(soundEffects ?? []).map((fx) => html`
              <div class="soundpad-tile ${fx.id === editingSoundId ? 'editing' : ''}">
                <button class="soundpad-play" type="button" data-action="preview-sound" data-fx-id="${fx.id}">
                  <span class="soundpad-hotkey">${fx.hotkey || t('noHotkey')}</span>
                  <span class="soundpad-icon">${fx.icon}</span>
                  <span class="soundpad-name">${fx.name}</span>
                </button>
                <button class="soundpad-edit-btn" type="button" data-action="edit-sound" data-fx-id="${fx.id}">${t('editSound')}</button>
              </div>
            `)}
          </div>
        </div>
      </section>

      <section data-settings-section="account">
        <h3 class="settings-section-title">${t('settingsAccount')}</h3>
        <div class="settings-signin-banner">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:18px;">⚡</span>
                <h3 class="settings-signin-title">${t('signInHelper')}</h3>
              </div>
              <p style="font-size:12px; color:var(--text-muted); margin-top:6px; line-height:1.5;">
                ${t('signInHelperHelp')}
              </p>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; flex-shrink:0;">
              <button class="btn btn-primary" data-action="open-official-signin">${t('openWebSignIn')}</button>
              ${account ? html`<button class="btn btn-secondary" data-action="log-out">${t('logOut')}</button>` : ''}
            </div>
          </div>
        </div>
        ${accountSection(account)}
      </section>

      <details class="settings-advanced" data-settings-section="advanced">
        <summary class="settings-section-title">${t('settingsAdvanced')}</summary>
      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">${t('runtimeMode')}</h3>
        ${liveOnly ? html`<p class="list-note">${t('desktopLiveOnly')}</p>` : html`
          <div style="display:flex; gap:16px; margin-bottom:16px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="radio" name="runtime-mode" value="sandbox" ${config.useSandbox ? 'checked' : ''} id="radio-sandbox" />
              <span><strong>${t('sandboxMode')}</strong> ${t('sandboxModeHelp')}</span>
            </label>
          </div>
          <div style="display:flex; gap:16px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="radio" name="runtime-mode" value="live" ${!config.useSandbox ? 'checked' : ''} id="radio-live" />
              <span><strong>${t('liveMode')}</strong> ${t('liveModeHelp')}</span>
            </label>
          </div>
        `}
        <label style="display:flex; align-items:flex-start; gap:8px; margin-top:16px; cursor:pointer;">
          <input type="checkbox" id="cfg-experimental-actions" ${config.experimentalActions ? 'checked' : ''} />
          <span><strong>${t('experimentalActions')}</strong><br />${t('experimentalActionsHelp')}</span>
        </label>
        <label style="display:flex; align-items:flex-start; gap:8px; margin-top:16px; cursor:pointer;">
          <input type="checkbox" id="cfg-request-logging" ${config.requestLogging ? 'checked' : ''} />
          <span><strong>${t('requestLogging')}</strong><br />${t('requestLoggingHelp')}</span>
        </label>
        <label style="display:flex; align-items:flex-start; gap:8px; margin-top:16px; cursor:pointer;">
          <input type="checkbox" id="cfg-allow-recording" ${config.allowLocalRecording ? 'checked' : ''} />
          <span><strong>${t('allowLocalRecording')}</strong><br />${t('allowLocalRecordingHelp')}</span>
        </label>
        <label style="display:flex; align-items:flex-start; gap:8px; margin-top:16px; cursor:pointer;">
          <input type="checkbox" id="cfg-verbose-voice-log" ${connectionStatus?.verboseVoiceLog ? 'checked' : ''} />
          <span><strong>${t('verboseVoiceLog')}</strong><br />${t('verboseVoiceLogHelp')}</span>
        </label>
      </div>

      ${connectionStatus ? html`
      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;" data-connection-status>
        <h3 style="font-size:16px; font-weight:700; margin-bottom:12px;">${t('connectionStatusTitle')}</h3>
        <div class="profile-settings">
          <div class="profile-setting-row"><span>${t('connectionStatusWeb')}</span><span>${connectionStatus.webSession ? t('connectionStatusOk') : t('connectionStatusBad')}</span></div>
          <div class="profile-setting-row"><span>${t('connectionStatusRealtime')}</span><span>${connectionStatus.realtimeKeys ? t('connectionStatusOk') : t('connectionStatusBad')}</span></div>
          <div class="profile-setting-row"><span>${t('connectionStatusPubNub')}</span><span>${connectionStatus.pubnubConnected ? t('connectionStatusOk') : t('connectionStatusBad')}</span></div>
          <div class="profile-setting-row"><span>${t('connectionStatusAgora')}</span><span>${connectionStatus.agoraJoined ? t('connectionStatusOk') : t('connectionStatusBad')}</span></div>
          <div class="profile-setting-row"><span>${t('connectionStatusAgoraResult')}</span><span>${connectionStatus.agoraResult || '—'}</span></div>
        </div>
      </div>
      ` : ''}

      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:6px;">${t('apiHealthTitle')}</h3>
        <p style="font-size:13px; font-weight:600; margin-bottom:8px;">${config.requestLogging ? t('evidenceLogOn') : t('evidenceLogOff')}</p>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">${t('apiHealthHelp')}</p>
        ${apiHealth.length === 0 ? html`<p class="list-note">${t('apiHealthEmpty')}</p>` : html`
          <div class="api-health-list" style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
            ${apiHealth.slice(-12).reverse().map((row) => html`
              <div style="font-size:12px; border:1px solid var(--border-subtle); border-radius:8px; padding:10px 12px;">
                <div style="font-weight:600;">${row.endpoint} · ${row.method} · ${row.status}</div>
                <div style="color:var(--text-muted); margin-top:4px;">${row.time}</div>
                <div style="margin-top:4px;">${row.message}</div>
              </div>
            `)}
          </div>
        `}
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary" type="button" data-action="copy-api-health-report" ${apiHealth.length ? '' : 'disabled'}>${t('apiHealthCopy')}</button>
          <button class="btn btn-secondary" type="button" data-action="reset-unsupported-routes">${t('apiHealthResetUnsupported')}</button>
        </div>
      </div>

      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">${t('headersTitle')}</h3>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
          <div class="form-group">
            <label class="form-label">${t('appBuild')}</label>
            <input class="form-input" id="cfg-app-build" value="${config.appBuild}" />
          </div>
          <div class="form-group">
            <label class="form-label">${t('appVersion')}</label>
            <input class="form-input" id="cfg-app-version" value="${config.appVersion}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${t('agoraAppId')}</label>
          <input class="form-input" id="cfg-agora-app-id" placeholder="${t('agoraAppIdPlaceholder')}" value="${config.agoraAppId}" />
        </div>

        <button class="btn btn-primary" data-action="save-settings" style="margin-top:8px;">${t('saveSettings')}</button>
      </div>
      </details>

      <p style="font-size:12px; color:var(--text-dim); text-align:center; margin-top:8px;">${t('unofficial')}</p>
    </div>
  `;
}
