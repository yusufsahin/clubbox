import { html, type SafeHtml } from '../html';

export function placeholderView(title: string, body: string): SafeHtml {
  return html`
    <div class="section-placeholder">
      <h2>${title}</h2>
      <p>${body}</p>
    </div>
  `;
}
