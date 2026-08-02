import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

export interface FirebaseConfig {
  projectId: string
  apiKey?: string
  authDomain?: string
  storageBucket?: string
  messagingSenderId?: string
  appId?: string
  measurementId?: string
}

export interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  firestore: Firestore
}

export function createFirebaseServices(config: FirebaseConfig): FirebaseServices {
  const app = initializeApp({
    projectId: config.projectId,
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    measurementId: config.measurementId,
  })

  const auth = getAuth(app)
  const firestore = getFirestore(app)

  return { app, auth, firestore }
}
