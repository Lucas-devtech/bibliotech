let eventoInstalacaoPWA = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  eventoInstalacaoPWA = event;
  const botao = document.getElementById('btn-instalar-pwa');
  if (botao) botao.hidden = false;
});
document.addEventListener('click', async event => {
  if (!event.target.closest('#btn-instalar-pwa') || !eventoInstalacaoPWA) return;
  eventoInstalacaoPWA.prompt();
  await eventoInstalacaoPWA.userChoice;
  eventoInstalacaoPWA = null;
  const botao = document.getElementById('btn-instalar-pwa');
  if (botao) botao.hidden = true;
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}

window.addEventListener('appinstalled', () => {
  eventoInstalacaoPWA = null;
  const botao = document.getElementById('btn-instalar-pwa');
  if (botao) botao.hidden = true;
});
