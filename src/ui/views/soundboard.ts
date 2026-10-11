import { t } from '../../i18n';
import type { SoundEffectItem } from '../../api/types';
import { PAD_HOTKEYS } from '../../audio/soundLibrary';
import { html, type SafeHtml } from '../html';

export function soundboardView(effects: SoundEffectItem[], editingId: string | null, masterVolume: number): SafeHtml {
  const editing = effects.find((fx) => fx.id === editingId) ?? null;
  const percent = Math.round(masterVolume * 100);
  return html`
    <div style="max-width:1000px; margin:0 auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; gap:16px;">
        <div>
          <p style="color:var(--text-muted); font-size:13px; margin-top:4px;">${t('soundboardHelp')}</p>
        </div>
        <div style="display:flex; gap:8px; flex-shrink:0;">
          <button class="btn btn-secondary" type="button" data-action="stop-sounds" title="S">${t('stopSounds')}</button>
          <button
            class="btn btn-secondary"
            type="button"
            data-action="duck-sounds"
            title="${t('duckSounds')}"
          >${t('duckSounds')}</button>
          <label class="btn btn-primary" style="cursor:pointer;">
            📁 ${t('uploadSound')}
            <input type="file" id="sound-upload-input" accept="audio/*" style="display:none;" />
          </label>
        </div>
      </div>

      <div class="soundboard-grid">
        ${effects.map((fx) => html`
          <div class="soundpad-tile ${fx.id === editingId ? 'editing' : ''}">
            <button class="soundpad-play" type="button" data-action="play-sound" data-fx-id="${fx.id}">
              <span class="soundpad-hotkey">${fx.hotkey || t('noHotkey')}</span>
              <span class="soundpad-icon">${fx.icon}</span>
              <span class="soundpad-name">${fx.name}</span>
            </button>
            <button class="soundpad-edit-btn" type="button" data-action="edit-sound" data-fx-id="${fx.id}">${t('editSound')}</button>
          </div>
        `)}
      </div>

      ${editing ? html`
        <div class="sound-editor">
          <h3 style="font-size:15px; font-weight:700;">${t('editSound')}</h3>
          <div class="sound-editor-grid">
            <label class="form-group">
              <span class="form-label">${t('soundName')}</span>
              <input class="form-input" id="sound-name" data-fx-id="${editing.id}" maxlength="40" value="${editing.name}" />
            </label>
            <label class="form-group">
              <span class="form-label">${t('soundIcon')}</span>
              <input class="form-input" id="sound-icon" data-fx-id="${editing.id}" maxlength="8" value="${editing.icon}" />
            </label>
            <label class="form-group">
              <span class="form-label">${t('soundHotkey')}</span>
              <select class="form-input" id="sound-hotkey" data-fx-id="${editing.id}">
                ${editing.hotkey ? '' : html`<option value="">${t('noHotkey')}</option>`}
                ${PAD_HOTKEYS.map((key) => html`<option value="${key}" ${key === editing.hotkey ? 'selected' : ''}>${key}</option>`)}
              </select>
            </label>
            <label class="form-group">
              <span class="form-label">${t('padVolume')}</span>
              <input type="range" id="sound-volume" data-fx-id="${editing.id}" min="0" max="1" step="0.05" value="${editing.volume ?? 1}" />
            </label>
            ${editing.type === 'custom' ? html`
              <label class="form-group sound-loop">
                <input type="checkbox" id="sound-loop" data-fx-id="${editing.id}" ${editing.loop ? 'checked' : ''} />
                <span>${t('soundLoop')}</span>
              </label>
            ` : ''}
          </div>
          <button class="btn btn-secondary" type="button" data-action="delete-sound" data-fx-id="${editing.id}">${t('deleteSound')}</button>
        </div>
      ` : ''}

      <div style="margin-top:32px; background:var(--bg-card); padding:20px; border-radius:var(--radius-lg); border:1px solid var(--border-subtle);">
        <h3 style="font-size:15px; font-weight:700; margin-bottom:12px;">${t('soundpadVolume')}</h3>
        <div style="display:flex; align-items:center; gap:16px;">
          <span style="font-size:20px;">🔊</span>
          <input type="range" id="soundpad-vol-slider" min="0" max="1" step="0.05" value="${masterVolume}" style="flex:1; accent-color:var(--accent-purple);" />
          <span id="soundpad-vol-label" style="font-size:13px; font-weight:600; width:45px;">${percent}%</span>
        </div>
      </div>
    </div>
  `;
}
