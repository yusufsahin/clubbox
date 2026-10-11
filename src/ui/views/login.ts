import { t } from '../../i18n';
import { html, type SafeHtml } from '../html';

export interface LoginState {
  busy: boolean;
  notice: string;
  desktop: boolean;
}

export function loginView(state: LoginState): SafeHtml {
  const busy = state.busy ? 'disabled' : '';
  return html`
    <div class="login-shell">
      <h2 class="login-title">${t('signInTitle')}</h2>
      <p class="login-help">${state.desktop ? t('signInHelp') : t('signInHelperDesktop')}</p>
      <p class="list-note login-one-device">${t('oneDeviceWarning')}</p>
      ${state.notice ? html`<div class="login-notice">${state.notice}</div>` : ''}
      ${state.desktop ? html`
        <div class="login-actions">
          <button class="btn btn-primary" type="button" data-action="open-official-signin" ${busy}>${t('openWebSignIn')}</button>
          <button class="btn btn-secondary" type="button" data-action="retry-adopt-session" ${busy}>${t('signInRetry')}</button>
        </div>
      ` : html`
        <p class="list-note">${t('embeddedSignInUnavailable')}</p>
      `}
      <div class="login-sandbox">
        <p class="list-note">${t('continueInSandboxHelp')}</p>
        <button class="btn btn-secondary" type="button" data-action="continue-sandbox" ${busy}>${t('continueInSandbox')}</button>
      </div>
    </div>
  `;
}
