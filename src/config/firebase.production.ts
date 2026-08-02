import { createFirebaseServices, type FirebaseServices } from './firebase.base'

const productionConfig = {
  projectId: 'fishlle-stock-mogya',
  apiKey: 'AIzaSyAaO6Urc8XCJWN5bNwYHUXvWruYD4VovZA',
  authDomain: 'fishlle-stock-mogya.firebaseapp.com',
  storageBucket: 'fishlle-stock-mogya.firebasestorage.app',
  messagingSenderId: '446445036597',
  appId: '1:446445036597:web:6e4204f695328d21253d7c',
}

export function initializeProductionFirebase(): FirebaseServices {
  return createFirebaseServices(productionConfig)
}
