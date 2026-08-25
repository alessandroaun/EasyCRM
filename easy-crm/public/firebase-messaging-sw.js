importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyD7e5IABsPQm_zVrhvWzEkZ9qWk8zO8MvA",
  authDomain: "a11-crm-notification.firebaseapp.com",
  projectId: "a11-crm-notification",
  storageBucket: "a11-crm-notification.firebasestorage.app",
  messagingSenderId: "928056231230",
  appId: "1:928056231230:web:735c2d20e29df63d90186f"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// O Firebase já exibe a notificação automaticamente se vier do Python com a chave "notification".
// Mantemos esta função apenas para registro ou caso queira tratar dados silenciosos no futuro.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Dados recebidos em background: ', payload);
  // A linha self.registration.showNotification foi REMOVIDA para matar a duplicidade!
});