import { initializeDevelopmentFirebase } from './firebase.development'
import { initializeStagingFirebase } from './firebase.staging'
import { initializeProductionFirebase } from './firebase.production'
import type { FirebaseServices } from './firebase.base'

let services: FirebaseServices | null = null

function resolveTarget(): 'development' | 'staging' | 'production' {
  if (import.meta.env.DEV) {
    return 'development'
  }
  if (import.meta.env.VITE_FIREBASE_ENV === 'staging') {
    return 'staging'
  }
  return 'production'
}

export function initializeFirebase(): FirebaseServices {
  if (services) {
    return services
  }

  switch (resolveTarget()) {
    case 'development':
      services = initializeDevelopmentFirebase()
      break
    case 'staging':
      services = initializeStagingFirebase()
      break
    default:
      services = initializeProductionFirebase()
  }
  return services
}

export function getFirebaseServices(): FirebaseServices {
  if (!services) {
    throw new Error('Firebase has not been initialized. Call initializeFirebase() first.')
  }
  return services
}
