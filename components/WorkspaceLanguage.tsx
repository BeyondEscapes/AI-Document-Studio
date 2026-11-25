'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { studioText, type StudioTextKey } from '@/lib/studio-text'
import { documentLanguageTags, type DocumentLanguage } from '@/lib/document-languages'

const languageContext = createContext({
  language: 'English' as DocumentLanguage,
  setLanguage: (_language: DocumentLanguage) => {},
})

export function WorkspaceLanguage({ initialLanguage, children }: { initialLanguage: DocumentLanguage; children: ReactNode }) {
  const [language, setLanguage] = useState(initialLanguage)
  useEffect(() => { document.documentElement.lang = documentLanguageTags[language] }, [language])
  return <languageContext.Provider value={{ language, setLanguage }}>{children}</languageContext.Provider>
}

export function useWorkspaceLanguage() {
  const context = useContext(languageContext)
  return { ...context, t: studioText(context.language) }
}

export function WorkspaceText({ label }: { label: StudioTextKey }) {
  return useWorkspaceLanguage().t(label)
}
