import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyD7e5IABsPQm_zVrhvWzEkZ9qWk8zO8MvA",
  authDomain: "a11-crm-notification.firebaseapp.com",
  projectId: "a11-crm-notification",
  storageBucket: "a11-crm-notification.firebasestorage.app",
  messagingSenderId: "928056231230",
  appId: "1:928056231230:web:735c2d20e29df63d90186f",
  measurementId: "G-STGN4GJ17Y"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Inicializa o Cloud Messaging (Apenas em ambiente Web/Navegador)
let messaging;
if (typeof window !== "undefined") {
  messaging = getMessaging(app);
}

export { messaging, getToken, onMessage };