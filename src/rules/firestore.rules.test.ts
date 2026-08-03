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
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rulesPath = path.resolve(__dirname, '../../firestore.rules')

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

describe('Firestore rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'fishlle-stock-rules-test',
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

    await assertSucceeds(
      setDoc(itemRef, {
        name: 'さば',
        remainingCount: 2,
      }),
    )
  })

  it('denies non-member item write', async () => {
    await seedHousehold('h6', 'owner-1', ['member-1'])
    const itemRef = doc(firestoreFor('outsider'), 'households/h6/items/item-1')

    await assertFails(
      setDoc(itemRef, {
        name: 'さば',
        remainingCount: 2,
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
