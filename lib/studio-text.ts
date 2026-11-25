import { parseDocumentLanguage, type DocumentLanguage } from './document-languages'

const messages = {
  workspace: ['Workspace', 'වැඩබිම', 'பணியிடம்', 'Arbeitsbereich', 'Espace de travail', 'Espacio de trabajo'],
  newDocument: ['New document', 'නව ලේඛනය', 'புதிய ஆவணம்', 'Neues Dokument', 'Nouveau document', 'Nuevo documento'],
  settings: ['Settings', 'සැකසුම්', 'அமைப்புகள்', 'Einstellungen', 'Paramètres', 'Configuración'],
  apiStatus: ['API key status', 'API යතුරේ තත්ත්වය', 'API விசை நிலை', 'API-Schlüsselstatus', 'État de la clé API', 'Estado de la clave API'],
  apiConfigured: ['Gemini API key configured', 'Gemini API යතුර සකසා ඇත', 'Gemini API விசை அமைக்கப்பட்டுள்ளது', 'Gemini-API-Schlüssel eingerichtet', 'Clé API Gemini configurée', 'Clave API de Gemini configurada'],
  apiMissing: ['API key missing', 'API යතුර සකසා නැත', 'API விசை இல்லை', 'API-Schlüssel fehlt', 'Clé API manquante', 'Falta la clave API'],
  aiModel: ['AI model', 'AI මාදිලිය', 'AI மாதிரி', 'KI-Modell', 'Modèle IA', 'Modelo de IA'],
  language: ['Language', 'භාෂාව', 'மொழி', 'Sprache', 'Langue', 'Idioma'],
  saving: ['Saving language…', 'භාෂාව සුරකිමින්…', 'மொழி சேமிக்கப்படுகிறது…', 'Sprache wird gespeichert…', 'Enregistrement de la langue…', 'Guardando el idioma…'],
  saveFailed: ['Could not save the language. Try again.', 'භාෂාව සුරැකීමට නොහැකි විය. නැවත උත්සාහ කරන්න.', 'மொழியைச் சேமிக்க முடியவில்லை. மீண்டும் முயலவும்.', 'Die Sprache konnte nicht gespeichert werden. Bitte erneut versuchen.', 'Impossible d’enregistrer la langue. Réessayez.', 'No se pudo guardar el idioma. Inténtelo de nuevo.'],
  templates: ['Templates', 'සැකිලි', 'வார்ப்புருக்கள்', 'Vorlagen', 'Modèles', 'Plantillas'],
  noConversations: ['No conversations yet', 'තවම සංවාද නැත', 'இன்னும் உரையாடல்கள் இல்லை', 'Noch keine Unterhaltungen', 'Aucune conversation pour le moment', 'Aún no hay conversaciones'],
  startDocument: ['Start by creating a document', 'ලේඛනයක් සෑදීමෙන් අරඹන්න', 'ஓர் ஆவணத்தை உருவாக்கித் தொடங்குங்கள்', 'Erstellen Sie zuerst ein Dokument', 'Commencez par créer un document', 'Empiece creando un documento'],
  whatToCreate: ['What would you like to create?', 'ඔබට සෑදීමට අවශ්‍ය කුමක්ද?', 'எதை உருவாக்க விரும்புகிறீர்கள்?', 'Was möchten Sie erstellen?', 'Que souhaitez-vous créer ?', '¿Qué quiere crear?'],
  chooseType: ['Choose a document type or describe what you need in the chat.', 'ලේඛන වර්ගයක් තෝරන්න හෝ ඔබට අවශ්‍ය දේ චැට් එකේ විස්තර කරන්න.', 'ஆவண வகையைத் தேர்ந்தெடுக்கவும் அல்லது உங்களுக்குத் தேவையானதை உரையாடலில் விவரிக்கவும்.', 'Wählen Sie einen Dokumenttyp oder beschreiben Sie im Chat, was Sie benötigen.', 'Choisissez un type de document ou décrivez vos besoins dans le chat.', 'Elija un tipo de documento o describa lo que necesita en el chat.'],
  describe: ['Describe the document you need…', 'ඔබට අවශ්‍ය ලේඛනය විස්තර කරන්න…', 'உங்களுக்குத் தேவையான ஆவணத்தை விவரிக்கவும்…', 'Beschreiben Sie das benötigte Dokument…', 'Décrivez le document dont vous avez besoin…', 'Describa el documento que necesita…'],
  send: ['Send message', 'පණිවිඩය යවන්න', 'செய்தியை அனுப்பவும்', 'Nachricht senden', 'Envoyer le message', 'Enviar mensaje'],
  showDocument: ['View document', 'ලේඛනය බලන්න', 'ஆவணத்தைக் காண்க', 'Dokument anzeigen', 'Afficher le document', 'Ver documento'],
  hideDocument: ['Hide document', 'ලේඛනය සඟවන්න', 'ஆவணத்தை மறைக்கவும்', 'Dokument ausblenden', 'Masquer le document', 'Ocultar documento'],
} as const

const localeIndex: Record<DocumentLanguage, number> = {
  English: 0, Sinhala: 1, Tamil: 2, German: 3, French: 4, Spanish: 5,
}

export function studioText(language: unknown) {
  const index = localeIndex[parseDocumentLanguage(language) ?? 'English']
  return (key: keyof typeof messages) => messages[key][index] ?? messages[key][0]
}
