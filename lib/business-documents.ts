import type { BusinessDocumentType, DocumentIntake } from '@/types'

export interface DocumentTemplateField {
  key: string
  label: string
}

export interface BusinessDocumentTemplate {
  label: string
  summary: string
  requiredFields: string[]
  fields: DocumentTemplateField[]
  layout: string
}

export const BUSINESS_DOCUMENT_TEMPLATES: Record<BusinessDocumentType, BusinessDocumentTemplate> = {
  room_reservation: {
    label: 'Room Reservation',
    summary: 'Hotel booking and guest room allocation details.',
    requiredFields: [
      'hotel',
      'location',
      'clientName',
      'checkIn',
      'checkOut',
      'adults',
      'basis',
      'roomCategory',
      'roomAllocation',
    ],
    fields: [
      { key: 'tourNumber', label: 'Tour Number' },
      { key: 'market', label: 'Market' },
      { key: 'documentDate', label: 'Document Date' },
      { key: 'hotel', label: 'Hotel' },
      { key: 'location', label: 'Location' },
      { key: 'clientName', label: 'Client Name' },
      { key: 'adults', label: 'Adults' },
      { key: 'children', label: 'Children' },
      { key: 'infants', label: 'Infants' },
      { key: 'checkIn', label: 'Check-in' },
      { key: 'checkOut', label: 'Check-out' },
      { key: 'basis', label: 'Basis' },
      { key: 'singleRooms', label: 'Single Rooms' },
      { key: 'doubleRooms', label: 'Double Rooms' },
      { key: 'twinRooms', label: 'Twin Rooms' },
      { key: 'tripleRooms', label: 'Triple Rooms' },
      { key: 'roomAllocation', label: 'Room Allocation' },
      { key: 'roomCategory', label: 'Room Category' },
      { key: 'nights', label: 'Nights' },
      { key: 'remarks', label: 'Remarks' },
    ],
    layout: 'Match the supplied Earls Regent room reservation reference: a centered ROOM RESERVATION title; tour number, market, and date; hotel and location; a fixed guest table for client name and adult, child, and infant counts; a fixed nine-column stay table for check-in, check-out, basis, SGL, DBL, TWN, TPL, room category, and nights; and a bordered remarks list. Extract room allocations into the four matching room-count fields when explicitly given; otherwise leave those values blank. Never fill omitted values with guesses.',
  },
  hotel_voucher: {
    label: 'Hotel Voucher',
    summary: 'Guest accommodation voucher using confirmed booking details.',
    requiredFields: ['hotel', 'location', 'guestNames', 'checkIn', 'checkOut', 'boardBasis', 'reservationStatus'],
    fields: [
      { key: 'hotel', label: 'Hotel' },
      { key: 'location', label: 'Location' },
      { key: 'guestNames', label: 'Guest Names' },
      { key: 'checkIn', label: 'Check-in' },
      { key: 'checkOut', label: 'Check-out' },
      { key: 'roomCategory', label: 'Room Category' },
      { key: 'roomCount', label: 'Room Count' },
      { key: 'boardBasis', label: 'Board Basis' },
      { key: 'reservationReference', label: 'Reservation Reference' },
      { key: 'reservationStatus', label: 'Reservation Status' },
      { key: 'specialInstructions', label: 'Special Instructions' },
    ],
    layout: 'Create a hotel voucher with the property, guests, stay dates, room and board details, supplied reservation reference/status, and special instructions. Do not describe a booking as confirmed unless the supplied status explicitly says it is confirmed.',
  },
  tour_itinerary: {
    label: 'Tour Itinerary',
    summary: 'Day-by-day travel itinerary and route.',
    requiredFields: ['tripDuration', 'destinations'],
    fields: [
      { key: 'clientName', label: 'Client Name' },
      { key: 'tripDuration', label: 'Trip Duration' },
      { key: 'destinations', label: 'Destinations / Route' },
      { key: 'travelDates', label: 'Travel Dates' },
      { key: 'travelerCount', label: 'Traveler Count' },
      { key: 'interests', label: 'Interests' },
      { key: 'accommodation', label: 'Accommodation' },
      { key: 'transport', label: 'Transport' },
    ],
    layout: 'Create a practical day-by-day itinerary from the supplied duration and route. Distinguish suggestions from confirmed services; do not invent traveler details, reservations, dates, prices, or provider confirmations.',
  },
  invoice: {
    label: 'Invoice',
    summary: 'Itemized invoice using user-provided amounts and terms.',
    requiredFields: ['billTo', 'lineItems', 'currency', 'totalAmount', 'issueDate'],
    fields: [
      { key: 'invoiceNumber', label: 'Invoice Number' },
      { key: 'billTo', label: 'Bill To' },
      { key: 'issueDate', label: 'Issue Date' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'lineItems', label: 'Line Items' },
      { key: 'currency', label: 'Currency' },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'tax', label: 'Tax' },
      { key: 'totalAmount', label: 'Total Amount' },
      { key: 'paymentTerms', label: 'Payment Terms' },
      { key: 'paymentDetails', label: 'Payment Details' },
    ],
    layout: 'Create a clear invoice with an itemized table and supplied totals. Never calculate, estimate, or invent an amount, tax, invoice number, date, or payment instruction. Ask for the stated total rather than deriving one.',
  },
  transport_confirmation: {
    label: 'Transport Confirmation',
    summary: 'Ground transfer or transport service details and explicit status.',
    requiredFields: ['serviceType', 'serviceDateTime', 'pickup', 'dropoff', 'passengerCount', 'guestNames', 'provider', 'confirmationStatus'],
    fields: [
      { key: 'serviceType', label: 'Transport Type' },
      { key: 'serviceDateTime', label: 'Service Date and Time' },
      { key: 'pickup', label: 'Pickup' },
      { key: 'dropoff', label: 'Drop-off' },
      { key: 'passengerCount', label: 'Passenger Count' },
      { key: 'guestNames', label: 'Guest Names' },
      { key: 'provider', label: 'Provider' },
      { key: 'vehicle', label: 'Vehicle' },
      { key: 'driverContact', label: 'Driver Contact' },
      { key: 'confirmationStatus', label: 'Confirmation Status' },
      { key: 'reference', label: 'Reference' },
    ],
    layout: 'Show the supplied transport service, date/time, route, passengers, provider, and confirmation status. Do not claim a service or driver is booked/confirmed unless that status was explicitly supplied.',
  },
  rooming_list: {
    label: 'Rooming List',
    summary: 'Guest-to-room allocation list for a hotel stay.',
    requiredFields: ['hotel', 'stayDates', 'roomAssignments', 'guestNames'],
    fields: [
      { key: 'hotel', label: 'Hotel' },
      { key: 'location', label: 'Location' },
      { key: 'stayDates', label: 'Stay Dates' },
      { key: 'guestNames', label: 'Guest Names' },
      { key: 'roomAssignments', label: 'Room Assignments' },
      { key: 'roomCategory', label: 'Room Category' },
      { key: 'boardBasis', label: 'Board Basis' },
      { key: 'specialRequests', label: 'Special Requests' },
    ],
    layout: 'Create a readable table mapping only supplied guest names to supplied room assignments. Do not create guest identities or room numbers.',
  },
  business_letter: {
    label: 'Business Letter',
    summary: 'Professional business correspondence.',
    requiredFields: ['recipient', 'purpose'],
    fields: [
      { key: 'recipient', label: 'Recipient' },
      { key: 'recipientOrganization', label: 'Recipient Organization' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'keyPoints', label: 'Key Points' },
      { key: 'senderName', label: 'Sender Name' },
      { key: 'senderRole', label: 'Sender Role' },
      { key: 'signoff', label: 'Sign-off' },
    ],
    layout: 'Write a polished letter based on the stated purpose and key points. Use Beyond Escapes as the company identity, but do not invent an employee name, title, recipient address, or signature.',
  },
  tour_proposal: {
    label: 'Tour Proposal',
    summary: 'Tailored tour proposal and scope.',
    requiredFields: ['destinations', 'tripDuration', 'proposalScope'],
    fields: [
      { key: 'clientName', label: 'Client Name' },
      { key: 'destinations', label: 'Destinations' },
      { key: 'tripDuration', label: 'Trip Duration' },
      { key: 'proposalScope', label: 'Proposal Scope' },
      { key: 'travelDates', label: 'Travel Dates' },
      { key: 'travelerCount', label: 'Traveler Count' },
      { key: 'budget', label: 'Budget' },
      { key: 'inclusions', label: 'Inclusions' },
      { key: 'exclusions', label: 'Exclusions' },
    ],
    layout: 'Prepare a professional proposal with the supplied scope and route. Clearly label unconfirmed ideas as suggestions and never invent prices, bookings, dates, or provider commitments.',
  },
  other_business_document: {
    label: 'Business Document',
    summary: 'A new business document type using a reusable branded layout.',
    requiredFields: ['documentPurpose', 'audience', 'keyDetails'],
    fields: [
      { key: 'documentPurpose', label: 'Document Purpose' },
      { key: 'audience', label: 'Audience' },
      { key: 'keyDetails', label: 'Key Details' },
      { key: 'issuer', label: 'Issuer' },
      { key: 'effectiveDate', label: 'Effective Date' },
    ],
    layout: 'Use a clear, professional business-document structure appropriate to the requested document. Include only supplied facts and leave unsupported details out.',
  },
}

export function isBusinessDocumentType(value: unknown): value is BusinessDocumentType {
  return typeof value === 'string' && Object.hasOwn(BUSINESS_DOCUMENT_TEMPLATES, value)
}

export function normalizeDocumentIntake(value: unknown): DocumentIntake | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (!isBusinessDocumentType(candidate.documentType)) return null

  const sourceFields = candidate.fields
  const fields: Record<string, string> = {}
  if (sourceFields && typeof sourceFields === 'object' && !Array.isArray(sourceFields)) {
    for (const [key, fieldValue] of Object.entries(sourceFields)) {
      const normalizedValue = normalizeFieldValue(fieldValue)
      if (normalizedValue) fields[key.slice(0, 100)] = normalizedValue.slice(0, 2000)
    }
  }

  return {
    documentType: candidate.documentType,
    fields,
    missingFields: [],
  }
}

function normalizeFieldValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(normalizeFieldValue).filter(Boolean).join('\n')
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const normalized = normalizeFieldValue(item)
        return normalized ? `${key}: ${normalized}` : ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

export function getMissingRequiredFields(intake: DocumentIntake): string[] {
  const template = BUSINESS_DOCUMENT_TEMPLATES[intake.documentType]
  return template.requiredFields.filter(key => {
    const value = intake.fields[key]?.trim()
    return !value || /^(not provided|not specified|not stated|unknown)$/i.test(value)
  })
}

export function getDocumentFieldLabel(documentType: BusinessDocumentType, key: string): string {
  return BUSINESS_DOCUMENT_TEMPLATES[documentType].fields.find(field => field.key === key)?.label ?? key
}

export function mergeDocumentIntakes(
  previous: DocumentIntake | undefined,
  current: DocumentIntake
): DocumentIntake {
  const fields = previous?.documentType === current.documentType
    ? { ...previous.fields, ...current.fields }
    : current.fields
  const merged: DocumentIntake = { ...current, fields, missingFields: [] }
  merged.missingFields = getMissingRequiredFields(merged)
  return merged
}
