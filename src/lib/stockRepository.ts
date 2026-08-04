import {
  collection,
  doc,
  increment,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { getFirebaseServices } from '../config/firebase'
import { subscribeQueryWithPermissionRetry } from './firestoreListener'
import type { StockItem } from '../types/stock'
import type { User } from './auth'

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }
  if (typeof value === 'string') {
    return value
  }
  return ''
}

function convertItem(id: string, data: Record<string, unknown>): StockItem {
  return {
    id,
    name: String(data.name),
    remainingCount: Number(data.remainingCount),
    receivedDate: String(data.receivedDate),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    createdBy: data.createdBy != null ? String(data.createdBy) : undefined,
    updatedBy: data.updatedBy != null ? String(data.updatedBy) : undefined,
  }
}

// household 作成/参加直後は members のサーバー確定前に items 購読が走り、
// 一時的に permission-denied になることがある。共通ヘルパーで数回リトライして自己回復させる。
export function subscribeStockItems(
  householdId: string,
  callback: (items: StockItem[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const { firestore } = getFirebaseServices()
  const itemsRef = collection(firestore, 'households', householdId, 'items')
  const q = query(itemsRef, orderBy('receivedDate', 'asc'))

  return subscribeQueryWithPermissionRetry(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => convertItem(d.id, d.data() as Record<string, unknown>))
      callback(items)
    },
    onError,
  )
}

export async function addStockItems(householdId: string, items: StockItem[], user: User): Promise<void> {
  const { firestore } = getFirebaseServices()
  const batch = writeBatch(firestore)
  for (const item of items) {
    const ref = doc(collection(firestore, 'households', householdId, 'items'))
    batch.set(ref, {
      name: item.name,
      remainingCount: item.remainingCount,
      receivedDate: item.receivedDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
      updatedBy: user.uid,
    })
  }
  await batch.commit()
}

export async function eatStockItem(householdId: string, itemId: string, user: User): Promise<void> {
  const { firestore } = getFirebaseServices()
  const ref = doc(firestore, 'households', householdId, 'items', itemId)
  await updateDoc(ref, {
    remainingCount: increment(-1),
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  })
}

export async function updateStockItem(
  householdId: string,
  itemId: string,
  data: { remainingCount: number; receivedDate: string },
  user: User,
): Promise<void> {
  const { firestore } = getFirebaseServices()
  const ref = doc(firestore, 'households', householdId, 'items', itemId)
  await updateDoc(ref, {
    remainingCount: data.remainingCount,
    receivedDate: data.receivedDate,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  })
}
