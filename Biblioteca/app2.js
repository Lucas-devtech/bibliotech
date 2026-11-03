const notifier = require('node-notifier');

// A mágica acontece aqui:
notifier.notify({
  title: 'Node.js Avisa:',
  message: 'Hellow World! 🚀 Olha eu fora do console!',
  sound: true, // Quer um barulhinho? Deixa true.
  wait: true   // Espera você interagir com a notificação
});

console.log("Dá um check nas notificações do seu PC! 😉");