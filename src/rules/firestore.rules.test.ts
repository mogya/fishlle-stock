// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rulesPath = path.resolve(__dirname, '../../firestore.rules')
const rulesTestProjectId = process.env.FIREBASE_PROJECT_ID ?? 'fishlle-stock-mogya'

let testEnv: RulesTestEnvironment | undefined

function firestoreFor(uid?: string) {
  if (!testEnv) {
    throw new Error('Test environment is not initialized')
  }
  if (!uid) {
    return testEnv.unauthenticatedContext().firestore()
  }
  return testEnv.authenticatedContext(uid).firestore()
}

async function seedHousehold(householdId: string, ownerUid: string, memberUids: string[] = []) {
  if (!testEnv) {
    throw new Error('Test environment is not initialized')
  }
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, `households/${householdId}`), { ownerUid })
    for (const memberUid of memberUids) {
      await setDoc(doc(db, `households/${householdId}/members/${memberUid}`), {
        uid: memberUid,
      })
    }
  })
}

function validItemFor(uid: string) {
  return {
    name: '中華風黒酢マリネ(生食用)',
    remainingCount: 2,
    receivedDate: '2026-08-03',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  }
}

async function seedItem(householdId: string, itemId: string, uid: string) {
  if (!testEnv) {
    throw new Error('Test environment is not initialized')
  }
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const now = Timestamp.now()
    await setDoc(doc(db, `households/${householdId}/items/${itemId}`), {
      name: '中華風黒酢マリネ(生食用)',
      remainingCount: 2,
      receivedDate: '2026-08-03',
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
      updatedBy: uid,
    })
  })
}

describe('Firestore rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: rulesTestProjectId,
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: fs.readFileSync(rulesPath, 'utf8'),
      },
    })
  })

  afterEach(async () => {
    if (!testEnv) {
      return
    }
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    if (!testEnv) {
      return
    }
    await testEnv.cleanup()
  })

  it('denies unauthenticated read for household', async () => {
    await seedHousehold('h1', 'owner-1', ['member-1'])
    const householdRef = doc(firestoreFor(), 'households/h1')

    await assertFails(getDoc(householdRef))
  })

  it('allows owner to create own household', async () => {
    const householdRef = doc(firestoreFor('owner-1'), 'households/h2')

    await assertSucceeds(setDoc(householdRef, { ownerUid: 'owner-1' }))
  })

  it('denies create when ownerUid does not match auth uid', async () => {
    const householdRef = doc(firestoreFor('owner-1'), 'households/h2')

    await assertFails(setDoc(householdRef, { ownerUid: 'other-user' }))
  })

  it('allows member to read household', async () => {
    await seedHousehold('h3', 'owner-1', ['member-1'])
    const householdRef = doc(firestoreFor('member-1'), 'households/h3')

    await assertSucceeds(getDoc(householdRef))
  })

  it('denies non-member read for household', async () => {
    await seedHousehold('h4', 'owner-1', ['member-1'])
    const householdRef = doc(firestoreFor('outsider'), 'households/h4')

    await assertFails(getDoc(householdRef))
  })

  it('allows member to create item', async () => {
    await seedHousehold('h5', 'owner-1', ['member-1'])
    const itemRef = doc(firestoreFor('member-1'), 'households/h5/items/item-1')

    await assertSucceeds(setDoc(itemRef, validItemFor('member-1')))
  })

  it('denies non-member item write', async () => {
    await seedHousehold('h6', 'owner-1', ['member-1'])
    const itemRef = doc(firestoreFor('outsider'), 'households/h6/items/item-1')

    await assertFails(setDoc(itemRef, validItemFor('outsider')))
  })

  it('denies item create with remainingCount out of create range', async () => {
    await seedHousehold('h6b', 'owner-1', ['member-1'])
    const itemRef = doc(firestoreFor('member-1'), 'households/h6b/items/item-1')

    await assertFails(
      setDoc(itemRef, {
        ...validItemFor('member-1'),
        remainingCount: 0,
      }),
    )
  })

  it('denies item create with unexpected field', async () => {
    await seedHousehold('h6c', 'owner-1', ['member-1'])
    const itemRef = doc(firestoreFor('member-1'), 'households/h6c/items/item-1')

    await assertFails(
      setDoc(itemRef, {
        ...validItemFor('member-1'),
        status: 'active',
      }),
    )
  })

  it('denies item create when createdBy does not match auth uid', async () => {
    await seedHousehold('h6d', 'owner-1', ['member-1'])
    const itemRef = doc(firestoreFor('member-1'), 'households/h6d/items/item-1')

    await assertFails(
      setDoc(itemRef, {
        ...validItemFor('member-1'),
        createdBy: 'other-user',
      }),
    )
  })

  it('denies item create with invalid receivedDate format', async () => {
    await seedHousehold('h6h', 'owner-1', ['member-1'])
    const itemRef = doc(firestoreFor('member-1'), 'households/h6h/items/item-1')

    await assertFails(
      setDoc(itemRef, {
        ...validItemFor('member-1'),
        receivedDate: '2026/08/03',
      }),
    )
  })

  it('allows member to update item with remainingCount 0', async () => {
    await seedHousehold('h6e', 'owner-1', ['member-1'])
    await seedItem('h6e', 'item-1', 'member-1')
    const itemRef = doc(firestoreFor('member-1'), 'households/h6e/items/item-1')

    await assertSucceeds(
      updateDoc(itemRef, {
        remainingCount: 0,
        updatedAt: serverTimestamp(),
        updatedBy: 'member-1',
      }),
    )
  })

  it('denies item update when createdBy is changed', async () => {
    await seedHousehold('h6f', 'owner-1', ['member-1'])
    await seedItem('h6f', 'item-1', 'member-1')
    const itemRef = doc(firestoreFor('member-1'), 'households/h6f/items/item-1')

    await assertFails(
      updateDoc(itemRef, {
        createdBy: 'other-user',
        updatedAt: serverTimestamp(),
        updatedBy: 'member-1',
      }),
    )
  })

  it('denies item update when updatedBy does not match auth uid', async () => {
    await seedHousehold('h6g', 'owner-1', ['member-1'])
    await seedItem('h6g', 'item-1', 'member-1')
    const itemRef = doc(firestoreFor('member-1'), 'households/h6g/items/item-1')

    await assertFails(
      updateDoc(itemRef, {
        remainingCount: 1,
        updatedAt: serverTimestamp(),
        updatedBy: 'other-user',
      }),
    )
  })

  it('denies item update when remainingCount is greater than 99', async () => {
    await seedHousehold('h6i', 'owner-1', ['member-1'])
    await seedItem('h6i', 'item-1', 'member-1')
    const itemRef = doc(firestoreFor('member-1'), 'households/h6i/items/item-1')

    await assertFails(
      updateDoc(itemRef, {
        remainingCount: 100,
        updatedAt: serverTimestamp(),
        updatedBy: 'member-1',
      }),
    )
  })

  it('allows owner to add member doc', async () => {
    await seedHousehold('h7', 'owner-1', ['owner-1'])
    const memberRef = doc(firestoreFor('owner-1'), 'households/h7/members/member-2')

    await assertSucceeds(
      setDoc(memberRef, {
        uid: 'member-2',
      }),
    )
  })

  it('allows member to delete own membership', async () => {
    await seedHousehold('h8', 'owner-1', ['owner-1', 'member-1'])
    const ownMemberRef = doc(firestoreFor('member-1'), 'households/h8/members/member-1')

    await assertSucceeds(deleteDoc(ownMemberRef))
  })

  it('denies member deleting other membership', async () => {
    await seedHousehold('h9', 'owner-1', ['owner-1', 'member-1', 'member-2'])
    const otherMemberRef = doc(firestoreFor('member-1'), 'households/h9/members/member-2')

    await assertFails(deleteDoc(otherMemberRef))
  })
})
