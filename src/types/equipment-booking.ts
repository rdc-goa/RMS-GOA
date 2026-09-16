
export type BookingStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Slot Assigned'
  | 'Completed'
  | 'Cancelled'

export type UserCategory = 'Internal' | 'External Academic' | 'Industry'

export type PaymentStatus = 'Not Required' | 'Pending' | 'Paid'

export interface EquipmentPrices {
  internal: number
  externalAcademic?: number
  industry?: number
}

export interface EquipmentCatalogItem {
  id: string
  name: string
  description: string
  image?: string
  make?: string
  modelNumber?: string
  specifications?: Record<string, string>
  applications?: string[]
  isAvailable: boolean
  prices: EquipmentPrices
  availableSlots: string[]
  createdAt: string // ISO string
  updatedAt: string // ISO string
}

export interface EquipmentBooking {
  id: string
  refNo: string
  uid: string
  applicantName: string
  applicantEmail: string
  applicantPhone: string
  department: string
  institute: string
  designation?: string
  misId?: string
  faculty?: string

  equipmentId: string
  equipmentName: string
  preferredDate: string       // "YYYY-MM-DD"
  preferredTimeSlot: string   // e.g. "09:00–11:00"
  alternateDate?: string
  noOfSamples: number
  purpose: string
  userCategory: UserCategory
  specialRequirements?: string

  // Admin workflow
  status: BookingStatus
  assignedDate?: string
  assignedSlot?: string
  adminRemarks?: string
  assignedBy?: string

  // Financials (V2)
  totalAmount?: number
  paymentStatus?: PaymentStatus
  receiptNo?: string
  paymentMode?: string
  paymentDate?: string
  easebuzzTxnId?: string
  easepayid?: string
  bankRefNum?: string

  createdAt: string // ISO string
  updatedAt: string // ISO string
}

export interface BookingFormData {
  equipmentId: string
  equipmentName: string
  preferredDate: string
  preferredTimeSlot: string
  alternateDate?: string
  noOfSamples: number
  purpose: string
  userCategory: UserCategory
  specialRequirements?: string
}

export interface EquipmentCatalogFormData {
  name: string
  description: string
  image?: string
  make?: string
  modelNumber?: string
  isAvailable: boolean
  prices: EquipmentPrices
  availableSlots: string[]
  applications?: string[]
  specifications?: Record<string, string>
}
