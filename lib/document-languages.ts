export const DOCUMENT_LANGUAGES = ['English', 'Sinhala', 'Tamil', 'German', 'French', 'Spanish'] as const
export type DocumentLanguage = typeof DOCUMENT_LANGUAGES[number]

export function parseDocumentLanguage(value: unknown): DocumentLanguage | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.trim().toLowerCase()
  return DOCUMENT_LANGUAGES.find(language => language.toLowerCase() === name)
}

export function documentLanguageCookie(userId: string): string {
  return `studio_document_language_${userId}`
}

export const DOCUMENT_REQUEST_PROMPTS: Record<DocumentLanguage, string> = {
  English: 'Please describe the document you need.',
  Sinhala: 'ඔබට අවශ්‍ය ලේඛනය විස්තර කරන්න.',
  Tamil: 'உங்களுக்குத் தேவையான ஆவணத்தை விவரிக்கவும்.',
  German: 'Bitte beschreiben Sie das benötigte Dokument.',
  French: 'Veuillez décrire le document dont vous avez besoin.',
  Spanish: 'Describa el documento que necesita.',
}

export const documentLanguageTags: Record<DocumentLanguage, string> = {
  English: 'en', Sinhala: 'si', Tamil: 'ta', German: 'de', French: 'fr', Spanish: 'es',
}
