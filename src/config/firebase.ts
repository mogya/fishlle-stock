import { initializeDevelopmentFirebase } from './firebase.development'
import { initializeProductionFirebase } from './firebase.production'

const isDevelopment = import.meta.env.DEV

export function initializeFirebase() {
  if (isDevelopment) {
    return initializeDevelopmentFirebase()
  }

  return initializeProductionFirebase()
}
