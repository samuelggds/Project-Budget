export type BudgetStatus =
  | 'Enviado'
  | 'Recusado'
  | 'Em andamento'
  | 'Aprovado'
  | 'Pago'

export type BudgetItem = {
  id: string
  serviceId?: string
  serviceCode?: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
}

export type Budget = {
  id: string
  number: string
  issuedAt: string
  validDays: number
  status: BudgetStatus
  client: {
    id?: string
    name: string
    document: string
    phone: string
    email: string
    address: string
    city: string
    state: string
    cep: string
    contact: string
  }
  payment: string
  notes: string
  items: BudgetItem[]
  updatedAt: string
  pdfSavedAt?: string
}
