import { createFirebaseServices, type FirebaseServices } from './firebase.base'

const stagingConfig = {
  projectId: 'fishlle-stock-mogya-staging',
  apiKey: 'AIzaSyDRD2dnU0ePHgjQWR3zdt7GW2oTqo0ps3s',
  authDomain: 'fishlle-stock-mogya-staging.firebaseapp.com',
  storageBucket: 'fishlle-stock-mogya-staging.firebasestorage.app',
  messagingSenderId: '318634661088',
  appId: '1:318634661088:web:dbb67db2e2d1ed789cac85',
}

export function initializeStagingFirebase(): FirebaseServices {
  return createFirebaseServices(stagingConfig)
}
