import { GoogleGenAI } from '@google/genai'
import { BUSINESS_DOCUMENT_TEMPLATES, normalizeDocumentIntake } from '@/lib/business-documents'
import type { DocumentContent, DocumentSection, DocumentIntake } from '@/types'

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Set it in .env.local for local development or in Vercel Project Settings > Environment Variables, then restart or redeploy.')
  }
  return new GoogleGenAI({ apiKey })
}

const SYSTEM_PROMPT = `You are the real AI assistant and document writer for Beyond Escapes Sri Lanka. Use the user's request and conversation history to identify the document type, extract supplied facts into structured fields, ask for missing essentials, and generate documents using the matching template.

SUPPORTED TEMPLATES AND FIELDS:
${Object.entries(BUSINESS_DOCUMENT_TEMPLATES).map(([type, template]) => `- ${type} (${template.label}); fields: ${template.fields.map(field => `${field.key} (${field.label})`).join(', ')}; required: ${template.requiredFields.map(key => `${key} (${template.fields.find(field => field.key === key)?.label ?? key}`).join(', ')}. ${template.layout}`).join('\n')}

DOCUMENT RULES:
- For a separate/new document, set isNewDocument=true and start with fresh fields; never reuse an earlier document's facts. Set isNewDocument=false for a clarification, revision, or continuation. In a continuation, merge the latest intake with corrected/new facts.
- For document requests, return the exact supported documentType and a fields object using that template's keys. Include only facts stated by the user; use an empty string for unknown values.
- If any required field is missing, set documentContent to null and ask a concise question naming the missing fields. The server independently validates these fields before generating.
- Never invent guest identities, booking or tour references, reservation/transport confirmation status, prices, currencies, totals, tax, invoice identifiers, or travel/issue/due dates. Never calculate invoice totals. Only describe a booking or service as confirmed when the supplied status explicitly confirms it.
- Itineraries and proposals may include suggestions, but label them as suggestions and never present them as booked services.
- For tour itineraries, target about 1,100–1,350 words in the generated sections for a typical week-long trip, scaling shorter trips down and longer trips up, so the finished export including its automatic opening and contact ending is usually near 1,200–1,450 words. Write a concise 80–120 word overview, clear day-by-day highlights, and short attraction descriptions without repeating the overview. The export adds the Sri Lanka route map, Ayubowan welcome page, Beyond Escapes contact ending, logos, and brand styling automatically; do not create duplicate map or welcome pages.
- Use a clear route-led title and one heading per travel day, followed by concise activities, accommodation details only when supplied, and optional attraction subheadings. Keep descriptions informative and practical rather than padding the document to meet a word count.
- Preserve the user's language. Use a professional tone and Beyond Escapes branding. For edits, retain the document type and structured details unless the user changes them.

Always return valid JSON without markdown fences:
{"message":"...","isNewDocument":false,"documentIntake":{"documentType":"supported key","fields":{"fieldKey":"user-provided value"}},"documentContent":null}

When all required fields are present, set documentContent to {"title":"Document title","sections":[{"id":"unique-id","type":"heading1","content":"Section heading"},{"id":"unique-id","type":"paragraph","content":"Document text"},{"id":"unique-id","type":"bullet_list","content":"","items":["Item"]},{"id":"unique-id","type":"table","content":"","headers":["Column"],"rows":[["Value"]]}],"metadata":{"language":"English","tone":"professional"}}. Supported section types: title, heading1 (brand-blue section bar), heading2 (underlined subheading), heading3, paragraph, bullet_list, numbered_list, table, page_break. Keep sections focused and do not invent facts or duplicate structured details.

For general questions or greetings that are not document requests, return {"message":"Response text","isNewDocument":false,"documentIntake":null,"documentContent":null}.`

// Fallback models in priority order if a model experiences 503 high demand or 429
export const AVAILABLE_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
]

// Map deprecated models to active high-availability models
export function normalizeModel(model?: string): string {
  if (!model) return 'gemini-3.5-flash'
  if (model.includes('gemini-2.0') || model.includes('gemini-1.5') || model.includes('gemini-2.5')) {
    return 'gemini-3.5-flash'
  }
  return model
}

export async function generateDocumentContent(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  requestedModel: string = 'gemini-3.5-flash'
): Promise<{
  message: string
  documentContent: DocumentContent | null
  documentIntake: DocumentIntake | null
  isNewDocument: boolean
}> {
  const client = getClient()
  const primaryModel = normalizeModel(requestedModel)

  // Build model priority list with primaryModel first, followed by fallbacks
  const modelQueue = [
    primaryModel,
    ...AVAILABLE_MODELS.filter(m => m !== primaryModel),
  ]

  let lastError: Error | null = null

  for (const modelToTry of modelQueue) {
    // Retry up to 2 times for each model
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const chat = client.chats.create({
          model: modelToTry,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.3,
            maxOutputTokens: 8192,
          },
          history: conversationHistory,
        })

        const response = await chat.sendMessage({ message: userMessage })
        const text = response.text || ''

        // Parse JSON response
        try {
          const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
          const parsed = JSON.parse(cleaned) as Record<string, unknown>
          const documentIntake = normalizeDocumentIntake(parsed.documentIntake)

          return {
            message: typeof parsed.message === 'string' ? parsed.message : 'Please describe the document you need.',
            documentContent: normalizeDocumentContent(parsed.documentContent, userMessage, documentIntake),
            documentIntake,
            isNewDocument: parsed.isNewDocument === true,
          }
        } catch {
          return {
            message: text,
            documentContent: null,
            documentIntake: null,
            isNewDocument: false,
          }
        }
      } catch (err: any) {
        lastError = err
        const status = err?.status || err?.code
        if (status === 401 || status === 403 || (Array.isArray(err?.details) && err.details.some((detail: any) => detail?.reason === 'ACCESS_TOKEN_TYPE_UNSUPPORTED'))) {
          throw new Error('Google rejected GEMINI_API_KEY. In Vercel, set it to the raw API key from Google AI Studio (not the GEMINI_API_KEY= assignment), enable it for the deployment environment, and redeploy.')
        }
        const isTransient = status === 503 || status === 429 || status === 404 || err?.message?.includes('high demand')
        
        console.warn(`Model ${modelToTry} attempt ${attempt + 1} failed (status ${status}). Trying next...`)

        if (!isTransient) {
          // Non-transient error (e.g. auth), break early
          break
        }

        // Wait short backoff before next try
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000))
      }
    }
  }

  // If all models failed with high demand
  const errMsg = lastError?.message || 'The AI service is temporarily unavailable.'
  if (errMsg.includes('high demand') || (lastError as any)?.status === 503) {
    throw new Error('Google Gemini is currently experiencing a temporary traffic spike across free-tier models. Please click Send again in a few seconds.')
  }

  throw new Error(`AI generation failed: ${errMsg}`)
}

function normalizeDocumentContent(
  value: unknown,
  prompt: string,
  intake: DocumentIntake | null
): DocumentContent | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.title !== 'string' || !Array.isArray(candidate.sections)) return null

  const sectionTypes: DocumentSection['type'][] = [
    'title', 'heading1', 'heading2', 'heading3', 'paragraph',
    'bullet_list', 'numbered_list', 'table', 'page_break',
  ]
  const sections: DocumentSection[] = candidate.sections.flatMap((section: unknown, index: number) => {
    if (!section || typeof section !== 'object') return []
    const source = section as Record<string, unknown>
    if (typeof source.type !== 'string' || !sectionTypes.includes(source.type as DocumentSection['type'])) return []

    return [{
      id: typeof source.id === 'string' && source.id ? source.id : `section-${index}-${Date.now()}`,
      type: source.type as DocumentSection['type'],
      content: typeof source.content === 'string' ? source.content : '',
      ...(Array.isArray(source.items)
        ? { items: source.items.filter((item): item is string => typeof item === 'string') }
        : {}),
      ...(Array.isArray(source.headers)
        ? { headers: source.headers.filter((header): header is string => typeof header === 'string') }
        : {}),
      ...(Array.isArray(source.rows)
        ? {
            rows: source.rows
              .filter((row): row is unknown[] => Array.isArray(row))
              .map(row => row.map(cell => typeof cell === 'string' ? cell : String(cell ?? ''))),
          }
        : {}),
    }]
  })
  if (!sections.length) return null

  const sourceMetadata = candidate.metadata && typeof candidate.metadata === 'object'
    ? candidate.metadata as Record<string, unknown>
    : {}

  return {
    title: candidate.title,
    sections,
    ...(intake ? { documentType: intake.documentType, intake } : {}),
    approval: { status: 'draft' },
    metadata: {
      generatedAt: new Date().toISOString(),
      prompt,
      ...(typeof sourceMetadata.language === 'string' ? { language: sourceMetadata.language } : {}),
      ...(typeof sourceMetadata.tone === 'string' ? { tone: sourceMetadata.tone } : {}),
    },
  }
}

export async function streamGenerateContent(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  model: string = 'gemini-3.8-flash'
): Promise<ReadableStream<Uint8Array>> {
  const client = getClient()
  const effectiveModel = normalizeModel(model)

  const chat = client.chats.create({
    model: effectiveModel,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
    history: conversationHistory,
  })

  const encoder = new TextEncoder()
  
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const responseStream = await chat.sendMessageStream({ message: userMessage })
        let fullText = ''
        
        for await (const chunk of responseStream) {
          const chunkText = chunk.text || ''
          fullText += chunkText
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`))
        }
        
        // Send final parsed result
        try {
          const cleaned = fullText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
          const parsed = JSON.parse(cleaned)
          
          if (parsed.documentContent?.sections) {
            parsed.documentContent.sections = parsed.documentContent.sections.map(
              (section: DocumentSection, index: number) => ({
                ...section,
                id: section.id || `section-${index}-${Date.now()}`,
              })
            )
          }
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, result: parsed })}\n\n`))
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, result: { message: fullText, documentContent: null } })}\n\n`))
        }
        
        controller.close()
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`))
        controller.close()
      }
    }
  })
  
  return stream
}

export function checkApiKey(): { configured: boolean; error?: string } {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey.trim() === '') {
    return {
      configured: false,
      error: 'GEMINI_API_KEY is not configured. Set it in .env.local for local development or in Vercel Project Settings > Environment Variables, then restart or redeploy.'
    }
  }
  return { configured: true }
}
