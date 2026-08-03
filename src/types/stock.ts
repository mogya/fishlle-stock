export type DateString = string
export type StockItemId = string

export type StockItem = {
  id: StockItemId
  name: string
  remainingCount: number
  receivedDate: DateString
  createdAt: string
  updatedAt: string
  createdBy?: string
  updatedBy?: string
}

export type StockInputItem = {
  name: string
  count: number
}

export type CreateStockItemParams = {
  name: string
  count: number
  receivedDate: DateString
}
