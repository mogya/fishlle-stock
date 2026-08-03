import type { Timestamp } from 'firebase/firestore'

export type HouseholdId = string
export type HouseholdRole = 'owner' | 'member'

export interface Household {
  id: HouseholdId
  ownerUid: string
  name: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface HouseholdMember {
  uid: string
  role: HouseholdRole
  displayName: string
  email: string
  joinedAt: Timestamp
  invitedBy?: string
  inviteCode?: string
}

export interface HouseholdInvite {
  householdId: HouseholdId
  createdBy: string
  createdAt: Timestamp
  expiresAt: Timestamp
}
