import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { createFirebaseServices, type FirebaseServices } from './firebase.base'

const developmentConfig = {
  projectId: 'fishlle-stock-mogya',
  apiKey: 'demo-key',
  authDomain: 'localhost',
}

export function initializeDevelopmentFirebase(): FirebaseServices {
  const services = createFirebaseServices(developmentConfig)

  connectAuthEmulator(services.auth, 'http://127.0.0.1:9099')
  connectFirestoreEmulator(services.firestore, '127.0.0.1', 8080)

  return services
}
