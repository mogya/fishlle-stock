import { initializeDevelopmentFirebase } from './firebase.development'
import { initializeProductionFirebase } from './firebase.production'
import type { FirebaseServices } from './firebase.base'

let services: FirebaseServices | null = null
const isDevelopment = import.meta.env.DEV

export function initializeFirebase(): FirebaseServices {
  if (services) {
    return services
  }

  services = isDevelopment ? initializeDevelopmentFirebase() : initializeProductionFirebase()
  return services
}

export function getFirebaseServices(): FirebaseServices {
  if (!services) {
    throw new Error('Firebase has not been initialized. Call initializeFirebase() first.')
  }
  return services
}
