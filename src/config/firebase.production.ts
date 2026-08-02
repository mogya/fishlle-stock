import { createFirebaseServices, type FirebaseServices } from './firebase.base'

const productionConfig = {
  projectId: 'fishlle-stock-mogya',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export function initializeProductionFirebase(): FirebaseServices {
  return createFirebaseServices(productionConfig)
}
