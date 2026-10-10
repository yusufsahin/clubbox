export function showToast(message: string, icon = '✨'): void {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = 'toast';
  const iconEl = document.createElement('span');
  iconEl.textContent = icon;
  const textEl = document.createElement('span');
  textEl.textContent = message;
  toast.append(iconEl, document.createTextNode(' '), textEl);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

function createToastContainer(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'toast-container';
  el.className = 'toast-container';
  document.body.appendChild(el);
  return el;
}
