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

function timestampMillis(value: Household['createdAt'] | Household['updatedAt']): number | null {
  return value ? value.toMillis() : null
}

function isSameHousehold(a: Household | null, b: Household | null): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b) {
    return false
  }
  return a.id === b.id &&
    a.ownerUid === b.ownerUid &&
    a.name === b.name &&
    timestampMillis(a.createdAt) === timestampMillis(b.createdAt) &&
    timestampMillis(a.updatedAt) === timestampMillis(b.updatedAt)
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
  onError?: (error: Error) => void,
): () => void {
  const { firestore } = getFirebaseServices()
  const userRef = doc(firestore, 'users', uid)
  let householdUnsubscribe: (() => void) | undefined
  let currentHouseholdId: string | null = null
  let lastNotifiedHousehold: Household | null = null

  const handleError = onError ?? (() => undefined)

  const unsubscribeUser = onSnapshot(
    userRef,
    { includeMetadataChanges: true },
    (userSnap) => {
      if (userSnap.metadata.hasPendingWrites) {
        return
      }

      const data = (userSnap.data() as UserHouseholdData | undefined) ?? { currentHouseholdId: null, householdIds: [] }
      const householdId = data.currentHouseholdId

      if (!householdId) {
        if (householdUnsubscribe) {
          householdUnsubscribe()
          householdUnsubscribe = undefined
        }
        currentHouseholdId = null
        if (!isSameHousehold(lastNotifiedHousehold, null)) {
          lastNotifiedHousehold = null
          callback(null)
        }
        return
      }

      if (householdId === currentHouseholdId && householdUnsubscribe) {
        return
      }

      if (householdUnsubscribe) {
        householdUnsubscribe()
        householdUnsubscribe = undefined
      }
      currentHouseholdId = householdId

      const householdRef = doc(firestore, 'households', householdId)
      householdUnsubscribe = onSnapshot(
        householdRef,
        (householdSnap) => {
          if (!householdSnap.exists()) {
            currentHouseholdId = null
            if (!isSameHousehold(lastNotifiedHousehold, null)) {
              lastNotifiedHousehold = null
              callback(null)
            }
            return
          }

          const nextHousehold = { id: householdSnap.id, ...(householdSnap.data() as Omit<Household, 'id'>) }
          if (isSameHousehold(lastNotifiedHousehold, nextHousehold)) {
            return
          }

          lastNotifiedHousehold = nextHousehold
          callback(nextHousehold)
        },
        handleError,
      )
    },
    handleError,
  )

  return () => {
    unsubscribeUser()
    if (householdUnsubscribe) {
      householdUnsubscribe()
    }
  }
}
