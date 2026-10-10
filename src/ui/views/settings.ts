import { t } from '../../i18n';
import type { ClubhouseConfig } from '../../api/client';
import { SHORTCUT_ACTIONS, type ShortcutAction, type ShortcutMap } from '../../shortcuts';
import { html, type SafeHtml } from '../html';

function shortcutLabel(action: ShortcutAction): string {
  if (action === 'mute') return t('shortcutMute');
  if (action === 'clip') return t('shortcutClip');
  return t('shortcutPad', { n: action.slice(3) });
}

export function settingsView(config: ClubhouseConfig, isElectron: boolean, shortcuts: ShortcutMap, recording: ShortcutAction | null): SafeHtml {
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
            <button class="btn btn-primary" data-action="capture-token">
              ${isElectron ? t('openWebSignIn') : t('signInHelperDesktop')}
            </button>
            <button class="btn btn-secondary" data-action="open-login">${t('phoneSignIn')}</button>
          </div>
        </div>
      </div>

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
        <label style="display:flex; align-items:flex-start; gap:8px; margin-top:16px; cursor:pointer;">
          <input type="checkbox" id="cfg-allow-unverified" ${config.allowUnverified ? 'checked' : ''} />
          <span><strong>${t('allowUnverified')}</strong><br />${t('allowUnverifiedHelp')}</span>
        </label>
      </div>

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

        <div class="form-group">
          <label class="form-label">${t('baseUrl')}</label>
          <input class="form-input" id="cfg-base-url" value="${config.baseUrl}" />
        </div>

        <div class="form-group">
          <label class="form-label">${t('corsProxy')}</label>
          <input class="form-input" id="cfg-cors-proxy" placeholder="e.g. https://cors-anywhere.herokuapp.com" value="${config.corsProxy}" />
        </div>

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
          <label class="form-label">${t('authToken')}</label>
          <div style="display:flex; gap:8px;">
            <input class="form-input" id="cfg-auth-token" type="password" autocomplete="off" placeholder="${isElectron && config.hasSecureToken ? t('tokenStoredSecurely') : 'Token e.g. 5f9e8a7b...'}" value="${isElectron ? '' : (config.authToken || '')}" />
            <button class="btn btn-secondary" type="button" data-action="toggle-token">${t('show')}</button>
          </div>
          ${isElectron && config.hasSecureToken ? html`<button class="btn btn-secondary" type="button" data-action="clear-token">${t('clearToken')}</button>` : ''}
        </div>

        <div class="form-group">
          <label class="form-label">${t('agoraAppId')}</label>
          <input class="form-input" id="cfg-agora-app-id" placeholder="Agora project App ID" value="${config.agoraAppId}" />
        </div>

        <button class="btn btn-primary" data-action="save-settings" style="margin-top:8px;">${t('saveSettings')}</button>
      </div>

      <p style="font-size:12px; color:var(--text-dim); text-align:center; margin-top:8px;">${t('unofficial')}</p>
    </div>
  `;
}
