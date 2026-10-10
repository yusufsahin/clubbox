import { t } from '../../i18n';
import { html, type SafeHtml } from '../html';

export interface LoginState {
  busy: boolean;
  notice: string;
  step: 'phone' | 'code';
  phone: string;
  code: string;
  showWebSignIn: boolean;
}

export function loginView(state: LoginState): SafeHtml {
  const busy = state.busy ? 'disabled' : '';
  return html`
    <div style="max-width:460px; margin:40px auto;">
      <h2 style="font-size:22px; font-weight:700; margin-bottom:4px;">${t('signInTitle')}</h2>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:24px;">${t('signInHelp')}</p>
      ${state.notice ? html`<div class="login-notice">${state.notice}</div>` : ''}
      ${state.step === 'phone' ? html`
        <div class="form-group">
          <label class="form-label" for="login-phone">${t('phoneNumber')}</label>
          <input class="form-input" id="login-phone" inputmode="tel" autocomplete="tel" placeholder="+1 555 0100" value="${state.phone}" ${busy} />
        </div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-primary" data-action="login-send" ${busy}>${t('sendCode')}</button>
          ${state.showWebSignIn ? html`<button class="btn btn-secondary" data-action="login-web" ${busy}>${t('openWebSignIn')}</button>` : ''}
        </div>
      ` : html`
        <div class="form-group">
            <label class="form-label" for="login-code">${t('verificationCode')}</label>
          <input class="form-input" id="login-code" inputmode="numeric" autocomplete="one-time-code" placeholder="1234" value="${state.code}" ${busy} />
        </div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="btn btn-primary" data-action="login-verify" ${busy}>${t('verify')}</button>
            <button class="btn btn-secondary" data-action="login-resend" ${busy}>${t('resendCode')}</button>
            <button class="btn btn-secondary" data-action="login-back" ${busy}>${t('changeNumber')}</button>
        </div>
      `}
    </div>
  `;
}
