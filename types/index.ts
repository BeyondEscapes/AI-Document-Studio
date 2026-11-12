// Document content types
export interface DocumentSection {
  id: string
  type: 'title' | 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'bullet_list' | 'numbered_list' | 'table' | 'page_break'
  content: string
  items?: string[]  // for lists
  rows?: string[][]  // for tables
  headers?: string[]  // for table headers
  images?: DocumentImage[]
}

export interface DocumentImage {
  catalogId?: string
  src: string
  altText: string
  caption?: string
  width: number
  height: number
  displayWidth?: number
  displayHeight?: number
}

export interface ItineraryRouteStop {
  name: string
  latitude: number | null
  longitude: number | null
}

export interface ItineraryCoverSettings {
  overview?: string
  welcome?: string
  preparedBy?: string
  routeStops?: ItineraryRouteStop[]
  mapImage?: DocumentImage
  mapAttribution?: string
  mapRouteSignature?: string
  welcomeArtwork?: DocumentImage
}

export interface ItineraryClosingSettings {
  cancellationPolicy?: string[]
  companyName?: string
  phone?: string
  email?: string
  address?: string
  logo?: DocumentImage
}

export interface ItineraryPageSettings {
  cover?: ItineraryCoverSettings
  closing?: ItineraryClosingSettings
}

export interface ItineraryImageCatalogItem {
  id: string
  title: string
  sourceName: string
  sourcePath: string
  url: string
  width: number
  height: number
}

export interface DocumentContent {
  title: string
  sections: DocumentSection[]
  documentType?: BusinessDocumentType
  intake?: DocumentIntake
  itineraryPages?: ItineraryPageSettings
  coverImage?: DocumentImage
  closingLogo?: DocumentImage
  approval?: {
    status: 'draft' | 'approved'
    approvedAt?: string
  }
  metadata: {
    generatedAt: string
    prompt: string
    language?: string
    tone?: string
  }
}

export type BusinessDocumentType =
  | 'room_reservation'
  | 'hotel_voucher'
  | 'tour_itinerary'
  | 'invoice'
  | 'transport_confirmation'
  | 'rooming_list'
  | 'business_letter'
  | 'tour_proposal'
  | 'other_business_document'

export interface DocumentIntake {
  documentType: BusinessDocumentType
  fields: Record<string, string>
  missingFields: string[]
}

// Chat types
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  documentContent?: DocumentContent
  documentIntake?: DocumentIntake
  isLoading?: boolean
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  selectedTheme?: string
  documentContent?: DocumentContent
}

// Template / Theme types
export interface DocumentTheme {
  id: string
  name: string
  description: string
  templatePath: string  // path to .docx template file
  isDefault: boolean
  createdAt: string
  previewImagePath?: string
}

// Settings types
export interface AppSettings {
  defaultThemeId: string
  defaultOutputFormats: ('docx' | 'pdf')[]
  geminiModel: string
  language: string
  autoSave: boolean
}

// Export types
export interface ExportRequest {
  conversationId: string
  documentContent: DocumentContent
  themeId: string
  format: 'docx' | 'pdf'
  filename?: string
}

export interface ExportResult {
  success: boolean
  filePath?: string
  filename?: string
  error?: string
}

// API response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface GenerateResponse {
  message: string
  documentContent?: DocumentContent
}
