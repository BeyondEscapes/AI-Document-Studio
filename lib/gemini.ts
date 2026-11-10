import { GoogleGenAI } from '@google/genai'
import type { DocumentContent, DocumentSection } from '@/types'

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Set it in .env.local for local development or in Vercel Project Settings > Environment Variables, then restart or redeploy.')
  }
  return new GoogleGenAI({ apiKey })
}

const SYSTEM_PROMPT = `You are an expert travel document writer and AI assistant for "Beyond Escapes Sri Lanka", a premium travel company.

Your primary role is to help create professional travel documents including:
- Itineraries (day-by-day travel plans)
- Tour proposals and quotes
- Welcome letters
- Travel guides
- Activity descriptions
- Hotel information sheets

When generating document content, ALWAYS respond with valid JSON in this exact format:
{
  "message": "A brief friendly response to the user",
  "documentContent": {
    "title": "Document Title",
    "sections": [
      {
        "id": "unique-id",
        "type": "heading1",
        "content": "Section heading text"
      },
      {
        "id": "unique-id",
        "type": "paragraph",
        "content": "Paragraph text"
      },
      {
        "id": "unique-id",
        "type": "bullet_list",
        "content": "",
        "items": ["Item 1", "Item 2", "Item 3"]
      },
      {
        "id": "unique-id",
        "type": "heading2",
        "content": "Day heading - White text on blue bar in final document"
      }
    ],
    "metadata": {
      "generatedAt": "ISO date string",
      "prompt": "original user prompt",
      "language": "English",
      "tone": "professional"
    }
  }
}

SECTION TYPES:
- "title": Document title (large, centered)
- "heading1": Section separator (blue bar with white text in Word template - use for Day headings like "Day 01 | Arrival – Colombo | Leisure")
- "heading2": Sub-section heading (bold, underlined in Word template - use for attraction names)
- "heading3": Minor heading (bold)
- "paragraph": Regular text paragraph
- "bullet_list": Bullet points with "items" array
- "numbered_list": Numbered list with "items" array  
- "table": Data table with "headers" and "rows" arrays
- "page_break": Insert page break (content is empty string)

FORMATTING RULES:
- Use "heading1" for day headings in itineraries: "Day 01 | Location | Activities"
- Use bullet_list for daily activity summaries
- Use "heading2" for attraction/place descriptions
- Use "paragraph" for detailed descriptions
- Do NOT invent specific prices, hotel names, booking references, or personal details
- Write in a professional, warm, travel-industry tone
- Preserve the user's requested language

For NON-DOCUMENT queries (general questions, clarifications, greetings):
{
  "message": "Your response text here",
  "documentContent": null
}

IMPORTANT: Always respond with valid JSON. Never include markdown code blocks in your JSON response.`

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
): Promise<{ message: string; documentContent: DocumentContent | null }> {
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
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
          history: conversationHistory,
        })

        const response = await chat.sendMessage({ message: userMessage })
        const text = response.text || ''

        // Parse JSON response
        try {
          const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
          const parsed = JSON.parse(cleaned)
          
          const documentContent = parsed.documentContent
          if (documentContent && documentContent.sections) {
            documentContent.sections = documentContent.sections.map((section: DocumentSection, index: number) => ({
              ...section,
              id: section.id || `section-${index}-${Date.now()}`,
            }))
          }
          
          return {
            message: parsed.message || 'Content generated successfully.',
            documentContent: documentContent || null,
          }
        } catch {
          return {
            message: text,
            documentContent: null,
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
