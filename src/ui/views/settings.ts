import { t } from '../../i18n';
import type { AppPrefs } from '../../app/appPrefs';
import type { ClubhouseConfig } from '../../api/client';
import type { MeSettings } from '../../api/types';
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

export function settingsView(
  config: ClubhouseConfig,
  shortcuts: ShortcutMap,
  recording: ShortcutAction | null,
  liveOnly: boolean,
  account: AccountReadout | null,
  apiHealth: ApiHealthRow[] = [],
  appPrefs: AppPrefs | null = null,
  spatialAudio = false,
  voiceEffect: 'none' | 'radio' | 'deep' | 'robot' | 'echo' = 'none',
): SafeHtml {
  return html`
    <div style="max-width:780px; margin:0 auto;">
      <h2 style="font-size:22px; font-weight:700; margin-bottom:4px;">${t('settingsTitle')}</h2>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:28px;">${t('settingsHelp')}</p>

      <div style="background: linear-gradient(135deg, rgba(121, 82, 245, 0.18), rgba(16, 185, 129, 0.12)); border: 1px solid rgba(121, 82, 245, 0.4); border-radius: var(--radius-lg); padding: 22px; margin-bottom: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:18px;">⚡</span>
              <h3 style="font-size:15px; font-weight:700; color:#fff;">${t('signInHelper')}</h3>
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
        <label style="display:flex; align-items:flex-start; gap:8px; margin-top:16px; cursor:pointer;">
          <input type="checkbox" id="cfg-spatial-audio" ${spatialAudio ? 'checked' : ''} />
          <span><strong>${t('spatialAudio')}</strong><br />${t('spatialAudioHelp')}</span>
        </label>
        <div class="form-group" style="margin-top:16px;">
          <label class="form-label" for="cfg-voice-effect">${t('voiceEffects')}</label>
          <select class="form-input" id="cfg-voice-effect" data-action="pick-voice-effect">
            <option value="none" ${voiceEffect === 'none' ? 'selected' : ''}>${t('voiceEffectNone')}</option>
            <option value="radio" ${voiceEffect === 'radio' ? 'selected' : ''}>${t('voiceEffectRadio')}</option>
            <option value="deep" ${voiceEffect === 'deep' ? 'selected' : ''}>${t('voiceEffectDeep')}</option>
            <option value="robot" ${voiceEffect === 'robot' ? 'selected' : ''}>${t('voiceEffectRobot')}</option>
            <option value="echo" ${voiceEffect === 'echo' ? 'selected' : ''}>${t('voiceEffectEcho')}</option>
          </select>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <button class="btn btn-secondary" type="button" data-action="preview-voice-effect">${t('voiceEffectPreview')}</button>
            <button class="btn btn-primary" type="button" data-action="apply-voice-effect">${t('voiceEffectApply')}</button>
          </div>
          <p style="font-size:12px; color:var(--text-muted); margin-top:8px;">${t('voiceEffectsHelp')}</p>
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
      </div>

      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:6px;">${t('apiHealthTitle')}</h3>
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

      ${appPrefs ? html`
      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">${t('appearanceSection')}</h3>
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
      ` : ''}

      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="cfg-language">${t('language')}</label>
          <select class="form-input" id="cfg-language">
            <option value="en" ${config.language === 'en' ? 'selected' : ''}>English</option>
            <option value="tr" ${config.language === 'tr' ? 'selected' : ''}>Türkçe</option>
          </select>
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

      <p style="font-size:12px; color:var(--text-dim); text-align:center; margin-top:8px;">${t('unofficial')}</p>
    </div>
  `;
}
