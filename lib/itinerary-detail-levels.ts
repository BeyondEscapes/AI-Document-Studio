import type { DocumentContent, DocumentSection, ItineraryDetailLevel } from '@/types'

export interface DetailLevelInfo {
  id: ItineraryDetailLevel
  label: string
  sublabel: string
  description: string
  badgeText: string
}

export const DETAIL_LEVEL_CONFIGS: Record<ItineraryDetailLevel, DetailLevelInfo> = {
  low: {
    id: 'low',
    label: 'Low',
    sublabel: 'Short & Sweet',
    description: 'Concise daily highlights and punchy descriptions for quick, easy reading.',
    badgeText: 'Short & Sweet',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    sublabel: 'Current Doc Size',
    description: 'Standard balanced narrative with complete chronological points and informative paragraphs.',
    badgeText: 'Standard Size',
  },
  high: {
    id: 'high',
    label: 'High',
    sublabel: 'Extra Advanced Details',
    description: 'Enriched in-depth travel context, cultural insights, timing recommendations, and comprehensive details.',
    badgeText: 'Advanced Details',
  },
}

// Domain-specific knowledge base for Sri Lankan travel enrichments
const DESTINATION_INSIGHTS: Array<{
  regex: RegExp
  highDetailAdditions: string[]
  conciseSummary: string
}> = [
  {
    regex: /(sigiriya|lion rock|rock fortress)/i,
    highDetailAdditions: [
      'Historical & Architectural Context: Rising nearly 200 meters above the jungle floor, Sigiriya served as King Kashyapa’s 5th-century mountain citadel. Explore the sophisticated hydraulic water gardens, the ancient boulder gardens, and the renowned world-heritage frescoes of the celestial maidens.',
      'Climbing & Photography Tips: We recommend an early morning or late afternoon ascent to enjoy cooler temperatures and breathtaking panoramic views from the summit plateau overlooking the Central Plains. Sturdy walking shoes and drinking water are advised.',
    ],
    conciseSummary: 'Ascend the world-renowned 5th-century Sigiriya Rock Fortress to marvel at ancient frescoes, the Mirror Wall, and panoramic jungle vistas from the summit.',
  },
  {
    regex: /(dambulla|cave temple|golden temple)/i,
    highDetailAdditions: [
      'Sacred Art & Heritage: Dating back to the 1st century BC, this UNESCO site comprises five major caves adorned with over 150 Buddha statues, intricate ceiling murals, and royal effigies preserved in remarkable detail.',
      'Visitor Etiquette: As a revered active Buddhist monastery, visitors must wear clothing covering shoulders and knees, and remove footwear at the entrance gates.',
    ],
    conciseSummary: 'Explore the historic Dambulla Cave Temple complex featuring ancient rock-carved Buddha statues and vibrant ceiling frescoes.',
  },
  {
    regex: /(temple of the tooth|kandy|dalada maligawa)/i,
    highDetailAdditions: [
      'Ceremonial Tradition: The Temple of the Sacred Tooth Relic houses Sri Lanka’s most venerated Buddhist relic. Visitors during puja times can witness the traditional drumming and offering rituals (Thevava) inside the gilded inner chamber.',
      'Atmosphere & Leisure: Stroll along Kandy Lake, explore the historic royal palace complex, and take in the cool hill-country breeze that surrounds the mountain capital.',
    ],
    conciseSummary: 'Visit the revered Temple of the Sacred Tooth Relic and enjoy a pleasant lakeside stroll through the royal hill capital of Kandy.',
  },
  {
    regex: /(galle|galle fort|dutch fort|ramparts)/i,
    highDetailAdditions: [
      'Colonial Fortifications & Coastal Charm: Galle Fort is the largest remaining European-built fortress in Asia. Walk along the oceanfront ramparts, view the iconic white lighthouse, and wander through cobblestone alleys lined with boutique gem merchants, cafes, and historic Dutch colonial churches.',
      'Sunset Experience: The southwestern bastion offers the best vantage point for watching the sun set over the Laccadive Sea as local cliff divers showcase their skills.',
    ],
    conciseSummary: 'Wander through UNESCO-listed Galle Dutch Fort, exploring maritime ramparts, the iconic lighthouse, and colonial cobblestone streets.',
  },
  {
    regex: /(yala|udawalawe|safari|national park|game drive)/i,
    highDetailAdditions: [
      'Wildlife Spotting Strategies: Board your private 4x4 open-top safari jeep accompanied by an experienced tracker. Early mornings and late afternoons offer optimal lighting and peak activity for elephant herds, spotted deer, marsh crocodiles, and abundant birdlife.',
      'Safari Etiquette: Keep noise levels low, stay inside the vehicle at all times, and bring binoculars and telephoto camera lenses for prime wildlife photography.',
    ],
    conciseSummary: 'Embark on a private 4x4 jeep safari across the national park to observe elephants, diverse bird species, and exotic wildlife in their natural habitat.',
  },
  {
    regex: /(ella|nine arches|little adam|rawana)/i,
    highDetailAdditions: [
      'Highland Scenery & Engineering Wonder: Walk along the Nine Arches Viaduct bridge nestled amidst dense jungle and tea plantations, timing your visit with the scenic blue hill-country train crossing.',
      'Light Hiking & Panoramic Trails: The gentle trek up Little Adam’s Peak rewards travelers with spectacular 360-degree vistas across Ella Gap and cascading southern valleys.',
    ],
    conciseSummary: 'Marvel at the Nine Arches railway bridge amidst emerald tea hills and take in panoramic mountain views from Little Adam’s Peak.',
  },
  {
    regex: /(nuwara eliya|tea plantation|tea factory|little england)/i,
    highDetailAdditions: [
      'Ceylon Tea Heritage: Tour an operating tea factory to witness the meticulous orthodox processing stages from plucking and withering to fermenting and sorting, concluding with an authentic tea-tasting flight of pure Ceylon brews.',
      'Colonial Architecture: Known as Little England for its cool temperate climate, visit the historic Tudor-style Grand Hotel, Victoria Park, and the manicured racecourse.',
    ],
    conciseSummary: 'Tour an authentic Ceylon tea estate and factory to taste world-class tea amidst the cool, misty hills of Nuwara Eliya.',
  },
  {
    regex: /(mirissa|whale watching|weligama|stilt fish)/i,
    highDetailAdditions: [
      'Marine Sanctuary & Coastal Vistas: Mirissa is renowned as one of the best locations globally to view blue whales and pods of spinner dolphins migrating through deep coastal waters.',
      'Coastal Relaxation: Relax under swaying coconut palms, observe traditional stilt fishermen balancing over reef shallows, and enjoy freshly prepared seafood.',
    ],
    conciseSummary: 'Relax along golden sandy beaches, observe stilt fishermen, or set out into the azure sea for coastal and marine adventures.',
  },
  {
    regex: /(bentota|madu river|kosgoda|turtle)/i,
    highDetailAdditions: [
      'Lagoon Biodiversity & Mangrove Safari: Cruise down the Madu River past dense mangrove tunnels, cinnamon peeling islands, and tranquil fish breeding nurseries.',
      'Marine Conservation: Visit a community sea turtle conservation project dedicated to protecting endangered green, hawksbill, and olive ridley turtles before release into the wild.',
    ],
    conciseSummary: 'Enjoy a scenic riverboat safari through lush Madu River mangroves and visit a community sea turtle conservation center.',
  },
  {
    regex: /(colombo|gangaramaya|galle face)/i,
    highDetailAdditions: [
      'Urban Contrast & Heritage: Experience the dynamic blend of colonial British architecture, bustling Pettah street markets, and modern high-rise oceanfront developments.',
      'Cultural Landmarks: Visit the eclectic Gangaramaya Buddhist Temple on Beira Lake and enjoy an evening stroll along Galle Face Green promenade savoring local street snacks.',
    ],
    conciseSummary: 'Discover Colombo’s highlights including historic colonial landmarks, vibrant markets, and the oceanfront Galle Face promenade.',
  },
]

/**
 * Extracts the first 1-2 sentences of a paragraph for the Low (Short & Sweet) detail level.
 */
function condenseParagraph(text: string): string {
  if (!text || text.trim().length === 0) return ''
  
  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text]
  if (sentences.length <= 1) {
    const trimmed = text.trim()
    return trimmed.length > 180 ? trimmed.substring(0, 180).replace(/\s+\S*$/, '') + '...' : trimmed
  }
  
  // Take first 1 or 2 concise sentences (target ~35-60 words)
  const firstSentence = sentences[0].trim()
  if (firstSentence.split(/\s+/).length >= 20) {
    return firstSentence
  }
  
  const combined = (sentences[0] + sentences[1]).trim()
  return combined
}

/**
 * Enriches a paragraph with in-depth travel details for the High detail level.
 */
function enrichParagraph(text: string, contextTitle: string): string {
  if (!text || text.trim().length === 0) return ''
  
  // Check if this text or context matches a known destination
  const fullSearch = `${contextTitle} ${text}`
  const match = DESTINATION_INSIGHTS.find(item => item.regex.test(fullSearch))
  
  if (match) {
    // Avoid double appending if already enriched
    const alreadyHas = match.highDetailAdditions.some(addition => text.includes(addition.slice(0, 30)))
    if (!alreadyHas) {
      return `${text.trim()}\n\n${match.highDetailAdditions.join('\n\n')}`
    }
    return text
  }

  // Generic enrichment if no specific destination matched
  if (text.length < 220) {
    const genericAddition = 'Travel Note: Guided commentary by your experienced chauffeur guide provides rich cultural background and historical context throughout the journey, ensuring a comfortable, immersive travel pace with ample opportunities for scenic photography.'
    if (!text.includes('Travel Note:')) {
      return `${text.trim()}\n\n${genericAddition}`
    }
  }

  return text
}

/**
 * Condenses a bullet list for the Low detail level.
 */
function condenseBulletList(items: string[]): string[] {
  if (!items || items.length === 0) return []
  // Keep the top 2-3 essential highlights
  const count = Math.min(items.length, 3)
  return items.slice(0, count).map(item => {
    const parts = item.split(/[:–—]/)
    if (parts.length > 1 && parts[0].trim().length > 3) {
      // Return heading + concise part
      const head = parts[0].trim()
      const tail = parts.slice(1).join(':').trim()
      const words = tail.split(/\s+/)
      return words.length > 14 ? `${head}: ${words.slice(0, 14).join(' ')}...` : `${head}: ${tail}`
    }
    const words = item.split(/\s+/)
    return words.length > 18 ? `${words.slice(0, 18).join(' ')}...` : item
  })
}

/**
 * Expands a bullet list for the High detail level.
 */
function enrichBulletList(items: string[], contextTitle: string): string[] {
  if (!items || items.length === 0) return []
  
  const expanded = [...items]
  
  // Add operational timing and travel tips if not present
  const hasTiming = expanded.some(i => /morning|afternoon|departure|transfer|time/i.test(i))
  if (!hasTiming) {
    expanded.unshift('Morning Departure: Enjoy a relaxed breakfast before commencing scheduled sightseeing with private transport.')
  }

  const hasPhotoOrTip = expanded.some(i => /photo|scenic|view|tip|attire/i.test(i))
  if (!hasPhotoOrTip) {
    expanded.push('Scenic Stops & Travel Insights: Dedicated photo pauses at panoramic viewpoints with complimentary chilled mineral water provided throughout the drive.')
  }

  return expanded
}

/**
 * Transforms an itinerary document to the target detail level (low, medium, or high).
 * Caches variants inside document.detailVariants for instant switching.
 */
export function applyDetailLevel(
  document: DocumentContent,
  targetLevel: ItineraryDetailLevel
): DocumentContent {
  // If already at target level, return document as is
  if (document.detailLevel === targetLevel && document.sections.length > 0) {
    return document
  }

  // Ensure variants store is initialized
  const variants = { ...(document.detailVariants || {}) }

  // If medium variant is not yet recorded, record the current sections as medium baseline
  const currentLevel = document.detailLevel || 'medium'
  if (currentLevel === 'medium' && !variants.medium) {
    variants.medium = [...document.sections]
  }

  // Check if we already have the target level cached
  if (variants[targetLevel] && variants[targetLevel]!.length > 0) {
    return {
      ...document,
      sections: variants[targetLevel]!,
      detailLevel: targetLevel,
      detailVariants: variants,
    }
  }

  // Base sections to derive from (prefer medium baseline if available)
  const baseSections = variants.medium && variants.medium.length > 0
    ? variants.medium
    : document.sections

  let currentDayTitle = ''
  let transformedSections: DocumentSection[] = []

  if (targetLevel === 'low') {
    transformedSections = baseSections.map(section => {
      if (section.type === 'heading1') {
        currentDayTitle = section.content
        return section
      }
      if (section.type === 'bullet_list' && Array.isArray(section.items)) {
        return {
          ...section,
          items: condenseBulletList(section.items),
        }
      }
      if (section.type === 'paragraph' && section.content) {
        return {
          ...section,
          content: condenseParagraph(section.content),
        }
      }
      return section
    })
  } else if (targetLevel === 'high') {
    transformedSections = baseSections.map(section => {
      if (section.type === 'heading1') {
        currentDayTitle = section.content
        return section
      }
      if (section.type === 'bullet_list' && Array.isArray(section.items)) {
        return {
          ...section,
          items: enrichBulletList(section.items, currentDayTitle),
        }
      }
      if (section.type === 'paragraph' && section.content) {
        return {
          ...section,
          content: enrichParagraph(section.content, currentDayTitle),
        }
      }
      return section
    })
  } else {
    // Medium is the baseline
    transformedSections = baseSections
  }

  // Preserve any images already assigned in the base sections
  const imageMap = new Map<string, typeof baseSections[0]['images']>()
  baseSections.forEach(s => {
    if (s.images && s.images.length > 0) imageMap.set(s.id, s.images)
  })
  transformedSections = transformedSections.map(s => {
    const existingImages = imageMap.get(s.id)
    if (existingImages && (!s.images || s.images.length === 0)) {
      return { ...s, images: existingImages }
    }
    return s
  })

  // Save in cache
  variants[targetLevel] = transformedSections
  if (!variants.medium) {
    variants.medium = baseSections
  }

  return {
    ...document,
    sections: transformedSections,
    detailLevel: targetLevel,
    detailVariants: variants,
  }
}
