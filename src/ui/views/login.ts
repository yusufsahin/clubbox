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
    <div style="max-width:460px; margin:40px auto;">
      <h2 style="font-size:22px; font-weight:700; margin-bottom:4px;">${t('signInTitle')}</h2>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:24px;">${state.desktop ? t('signInHelp') : t('signInHelperDesktop')}</p>
      ${state.notice ? html`<div class="login-notice">${state.notice}</div>` : ''}
      ${state.desktop ? html`
        <button class="btn btn-primary" data-action="open-official-signin" ${busy}>${t('openWebSignIn')}</button>
      ` : ''}
    </div>
  `;
}
