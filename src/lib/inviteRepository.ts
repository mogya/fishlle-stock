import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { getFirebaseServices } from '../config/firebase'
import type { User } from './auth'

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_CODE_LENGTH = 8
const INVITE_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000
const MAX_RETRIES = 5

function generateRandomCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_LENGTH)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
      bytes[i] = Math.floor(Math.random() * INVITE_CODE_CHARS.length)
    }
  }
  return Array.from(bytes)
    .map((byte) => INVITE_CODE_CHARS[byte % INVITE_CODE_CHARS.length])
    .join('')
}

async function generateUniqueCode(firestore: ReturnType<typeof getFirebaseServices>['firestore']): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateRandomCode()
    const existing = await getDoc(doc(firestore, 'householdInvites', code))
    if (!existing.exists()) {
      return code
    }
  }
  throw new Error('招待コードの生成に失敗しました。しばらく経ってからお試しください')
}

export async function createInvite(householdId: string, user: User): Promise<string> {
  const { firestore } = getFirebaseServices()
  const code = await generateUniqueCode(firestore)
  const inviteRef = doc(firestore, 'householdInvites', code)
  await setDoc(inviteRef, {
    householdId,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + INVITE_EXPIRES_MS),
  })
  return code
}
