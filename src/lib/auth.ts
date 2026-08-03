import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { getFirebaseServices } from '../config/firebase'

export type { User }

const googleProvider = new GoogleAuthProvider()

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  const { auth } = getFirebaseServices()
  return onAuthStateChanged(auth, callback)
}

export async function signInWithGoogle(): Promise<void> {
  const { auth } = getFirebaseServices()
  await signInWithPopup(auth, googleProvider)
}

export async function signOutUser(): Promise<void> {
  const { auth } = getFirebaseServices()
  await signOut(auth)
}
