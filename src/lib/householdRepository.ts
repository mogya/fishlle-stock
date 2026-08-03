import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { getFirebaseServices } from '../config/firebase'
import type { Household, HouseholdInvite, HouseholdMember } from '../types/household'
import type { User } from './auth'

export type { Household }

export interface UserHouseholdData {
  currentHouseholdId: string | null
  householdIds: string[]
}

export async function createHouseholdForUser(user: User, name = 'my household'): Promise<Household> {
  const { firestore } = getFirebaseServices()
  const householdRef = doc(collection(firestore, 'households'))
  const memberRef = doc(firestore, 'households', householdRef.id, 'members', user.uid)
  const userRef = doc(firestore, 'users', user.uid)

  const userSnap = await getDoc(userRef)
  const existingUserData = (userSnap.data() as UserHouseholdData | undefined) ?? { currentHouseholdId: null, householdIds: [] }
  const householdIds = existingUserData.householdIds.includes(householdRef.id)
    ? existingUserData.householdIds
    : [...existingUserData.householdIds, householdRef.id]

  const batch = writeBatch(firestore)
  batch.set(householdRef, {
    ownerUid: user.uid,
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(memberRef, {
    uid: user.uid,
    role: 'owner',
    displayName: user.displayName ?? '',
    email: user.email ?? '',
    joinedAt: serverTimestamp(),
  } as HouseholdMember)
  batch.set(
    userRef,
    {
      currentHouseholdId: householdRef.id,
      householdIds,
    } as UserHouseholdData,
    { merge: true },
  )
  await batch.commit()

  return {
    id: householdRef.id,
    ownerUid: user.uid,
    name,
  }
}

export async function joinHouseholdByInviteCode(user: User, code: string): Promise<Household> {
  const { firestore } = getFirebaseServices()
  const inviteRef = doc(firestore, 'householdInvites', code)
  const inviteSnap = await getDoc(inviteRef)
  if (!inviteSnap.exists()) {
    throw new Error('招待コードが見つかりません')
  }
  const invite = inviteSnap.data() as HouseholdInvite
  if (invite.expiresAt.toMillis() < Date.now()) {
    throw new Error('招待コードの有効期限が切れています')
  }

  const householdId = invite.householdId
  const userRef = doc(firestore, 'users', user.uid)
  const userSnap = await getDoc(userRef)
  const userData = (userSnap.data() as UserHouseholdData | undefined) ?? { currentHouseholdId: null, householdIds: [] }
  const householdIds = userData.householdIds.includes(householdId)
    ? userData.householdIds
    : [...userData.householdIds, householdId]

  const batch = writeBatch(firestore)
  const memberRef = doc(firestore, 'households', householdId, 'members', user.uid)
  batch.set(memberRef, {
    uid: user.uid,
    role: 'member',
    displayName: user.displayName ?? '',
    email: user.email ?? '',
    joinedAt: serverTimestamp(),
    invitedBy: invite.createdBy,
    inviteCode: code,
  } as HouseholdMember)
  batch.set(userRef, { currentHouseholdId: householdId, householdIds } as UserHouseholdData, { merge: true })
  await batch.commit()

  const householdSnap = await getDoc(doc(firestore, 'households', householdId))
  return { id: householdSnap.id, ...(householdSnap.data() as Omit<Household, 'id'>) }
}

export function subscribeHouseholdForUser(
  uid: string,
  callback: (household: Household | null) => void,
): () => void {
  const { firestore } = getFirebaseServices()
  const userRef = doc(firestore, 'users', uid)
  let householdUnsubscribe: (() => void) | undefined

  const unsubscribeUser = onSnapshot(userRef, (userSnap) => {
    const data = (userSnap.data() as UserHouseholdData | undefined) ?? { currentHouseholdId: null, householdIds: [] }
    const householdId = data.currentHouseholdId

    if (householdUnsubscribe) {
      householdUnsubscribe()
      householdUnsubscribe = undefined
    }

    if (!householdId) {
      callback(null)
      return
    }

    const householdRef = doc(firestore, 'households', householdId)
    householdUnsubscribe = onSnapshot(householdRef, (householdSnap) => {
      if (!householdSnap.exists()) {
        callback(null)
        return
      }
      callback({ id: householdSnap.id, ...(householdSnap.data() as Omit<Household, 'id'>) })
    })
  })

  return () => {
    unsubscribeUser()
    if (householdUnsubscribe) {
      householdUnsubscribe()
    }
  }
}
