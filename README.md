# AI Document Studio — Beyond Escapes Sri Lanka

A professional, local AI-powered document creation web application. Users chat with AI (powered by Google Gemini) to generate travel itineraries, tour proposals, welcome letters, and business documents, review and edit the structured content in a live document workspace, apply the official **Beyond Escapes** Microsoft Word template, and export high-fidelity **DOCX** and **PDF** documents retaining all corporate branding.

---

## 🌟 Key Features

1. **Branded Word Template Replication Engine**
   - Built on top of the authentic `beyond-escapes-template.docx`
   - Preserves official Beyond Escapes Sri Lanka headers, embedded logo graphics (`image1.png`, `image2.png`), blue heading bars (`#3973B9`), bold white titles, Times New Roman typography, page margins, and `BEYOND ESCAPES | SRI LANKA` footer.
   - Clears sample content while preserving complete OpenXML section properties and styles.

2. **Dual DOCX & PDF Export Engine**
   - **Word (.docx)**: Generated via `python-docx` template replication.
   - **PDF (.pdf)**: High-resolution conversion using LibreOffice headless and native Word COM automation on Windows, ensuring identical visual identity.

3. **Unified AI Business Document Generator (Gemini API)**
   - One real Gemini-powered chat identifies Room Reservations, Hotel Vouchers, Tour Itineraries, Invoices, Transport Confirmations, Rooming Lists, Business Letters, Tour Proposals, and other business documents.
   - Extracts supplied facts into typed fields and asks for required details before generating incomplete bookings, invoices, or confirmations.
   - Never invents prices, guest or booking data, references, dates, or confirmation status.
   - Revision support: expand, shorten, rewrite, or correct sections. API keys stay server-side.

4. **Live Document Workspace & Editor**
   - Dual-mode: **Preview** (visual representation of final document) and **Edit** (modify structured fields, headings, paragraphs, bullet lists, and tables).
   - Review and approve documents, save changes locally, and export editable DOCX or PDF.
   - Template switcher (Beyond Escapes Official and custom uploaded templates).
   - Itinerary destination photos are matched automatically from the bundled image library or added from the device; selected photos are embedded in DOCX/PDF exports.
   - Itinerary cover and final-page copy, cancellation terms, and company contacts have dedicated editors; the Word copy remains editable text.
   - Road maps use a free OpenFreeMap/MapLibre map with OSRM road routing, editable waypoints, manual point placement, and map-image upload fallback.

5. **Local Persistence & Privacy**
   - Fast SQLite database (`studio.db`) stores conversations, messages, document states, custom templates, and settings.
   - Zero mandatory cloud dependencies; documents remain private and local.

---

## 🛠️ System Requirements (Windows)

| Component | Minimum Version | Note |
|-----------|----------------|------|
| **OS** | Windows 10 or 11 (64-bit) | Supported & tested |
| **Node.js** | v20+ or v26+ | Included with npm |
| **Python** | 3.10+ (tested on 3.12) | With `python-docx`, `lxml`, `docx2pdf` |
| **LibreOffice** or **MS Office** | LibreOffice 24+ / Office 2016+ | For headless PDF conversion |

---

## 🚀 Quick Start Guide (Windows)

### Step 1: Install Prerequisites (One-time setup)

Open PowerShell as Administrator:

```powershell
# 1. Install Node.js
winget install OpenJS.NodeJS.LTS

# 2. Install Python 3.12
winget install Python.Python.3.12

# 3. Install LibreOffice (optional if Microsoft Word is installed)
winget install TheDocumentFoundation.LibreOffice
```

### Step 2: Install Node.js & Python Dependencies

In the project root directory (`c:\Users\Dilshan\Desktop\doc_theme`):

```powershell
# Install Node.js packages
npm install

# Install Python packages
python -m pip install python-docx lxml docx2pdf
```

### Step 3: Configure Gemini API Key

1. Copy `.env.example` to `.env.local`:
   ```powershell
   Copy-Item .env.example .env.local
   ```
2. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Open `.env.local` and paste your key:
   ```env
   GEMINI_API_KEY=your_google_ai_studio_api_key
   ```

### Vercel Deployment

1. In Vercel, open the project and go to **Settings > Environment Variables**.
2. Add a variable named `GEMINI_API_KEY`. Set its value to the raw API key from [Google AI Studio](https://aistudio.google.com/app/apikey); do not include `GEMINI_API_KEY=` or quotes in the value.
3. Select the environments where the app runs, such as **Production** and **Preview**, then save.
4. Redeploy the project so the deployment receives the updated variable.

Keep this key server-side: do not name it `NEXT_PUBLIC_GEMINI_API_KEY` and never commit it to the repository. If Google rejects the key, create a fresh Gemini API key in Google AI Studio and update the Vercel variable.

Vercel deployments write runtime files under `/tmp` because the application bundle is read-only. Vercel temporary storage is not durable and may not be shared across function instances, so conversations, settings, uploaded themes, and generated downloads can be lost. Use a managed database and object storage for persistent production data.

DOCX exports on Vercel use the selected Word template and are returned directly as downloads. PDF export uses the authenticated LibreOffice service in `converter/`:

1. Deploy `converter/` as a Docker web service. Set `PDF_CONVERTER_TOKEN` to a long random secret in the converter's environment.
2. Confirm the service responds with `{"ok":true}` at `/health`.
3. In Vercel, add `PDF_CONVERTER_URL` as the service base URL (without `/convert`) and `PDF_CONVERTER_TOKEN` with the same secret value.
4. Redeploy the Vercel project.

The converter accepts requests only with the matching bearer token and limits DOCX uploads to 25 MB. Keep the token secret and do not commit it.

### Step 4: Run the Application

```powershell
# Development server (with hot reload)
npm run dev

# Or build and run production
npm run build
npm run start
```

Open your browser to: **[http://localhost:3000](http://localhost:3000)** (automatically redirects to `/studio`).

Alternatively, double-click **`start.bat`** in the project folder to start with one click!

### Optional: Import an Itinerary Photo Library

To add or refresh the bundled destination library, import only the JPEG photos from the supplied ZIP. The importer skips PSDs and documents and optimizes the photos into `public/itinerary-images/` so they are available to every app instance:

```powershell
npm run import:itinerary-images -- --zip "C:\path\to\Itinerary images.zip"
```

Itineraries automatically attach confident location matches when opened. You can also use **Auto-match locations**, choose another photo from the library, or add a JPEG, PNG, or WebP image from your device in the section editor. Selected image data is included in each saved document and its exports; device uploads remain local.

---

## 📁 Project Structure

```
doc_theme/
├── app/
│   ├── api/
│   │   ├── chat/route.ts               # Gemini AI chat & structured generation
│   │   ├── conversations/route.ts      # Conversation list & create
│   │   ├── conversations/[id]/route.ts # Single conversation CRUD
│   │   ├── export/route.ts             # DOCX & PDF generation dispatcher
│   │   ├── export/download/route.ts    # Secure file download endpoint
│   │   ├── settings/route.ts           # App settings & API key status
│   │   ├── themes/route.ts             # Theme list & delete
│   │   └── themes/upload/route.ts      # Custom .docx template upload
│   ├── studio/
│   │   └── page.tsx                    # Main AI Studio interface
│   ├── globals.css                     # Tailwind v4 theme & document styling
│   ├── layout.tsx                      # Root HTML layout & fonts
│   └── page.tsx                        # Redirect to /studio
├── assets/
│   └── beyond-escapes-template.docx    # Official Beyond Escapes Word template
├── components/
│   ├── ChatPanel.tsx                   # Chat UI, quick prompts, message bubbles
│   ├── DocumentWorkspace.tsx           # Live preview, section editor, export triggers
│   └── Sidebar.tsx                     # Chat history, template selector, settings
├── data/
│   ├── studio.db                       # SQLite database (conversations, settings)
│   └── exports/                        # Generated DOCX and PDF files
├── lib/
│   ├── db.ts                           # SQLite database layer (better-sqlite3)
│   ├── export.ts                       # Export orchestrator (DOCX & PDF)
│   ├── business-documents.ts           # Document-type templates and required intake fields
│   └── gemini.ts                       # Google Gen AI SDK integration
├── public/
│   └── images/                         # Beyond Escapes logos & icons
├── python/
│   ├── generate_docx.py                # OOXML Word template replication engine
│   └── convert_to_pdf.py               # High-fidelity PDF conversion engine
├── .env.example                        # Template for environment configuration
├── .env.local                          # Your local environment secrets (not committed)
├── package.json                        # Dependencies & npm scripts
└── README.md                           # Documentation & instructions
```

---

## Business Document Templates

The existing chat, conversation storage, branded DOCX/PDF export, and uploaded Word templates power all document types. `lib/business-documents.ts` defines the document types, required intake fields, and reusable layout guidance. Room Reservations use the supplied Earls Regent PDF as a layout reference (reservation heading, tour/market details, hotel/location, guest composition, stay and room allocation tables, and remarks) while applying the selected Beyond Escapes Word template for the official logo, fonts, headers, and footer. The uploaded PDF itself is not used as a source of guest or booking data.

To add a document type, add its field schema and required-field rules to `BUSINESS_DOCUMENT_TEMPLATES`. Update the Gemini guidance and any type-specific preview/export renderer only when the new type needs a specialized layout; the generic branded layout and custom `.docx` theme upload remain reusable.

---

## 🔍 How the Template Replication Engine Works

1. **Visual Identity Preservation**:
   - `assets/beyond-escapes-template.docx` contains the approved brand typography, margins, header with dual logo pictures (`image1.png` and `image2.png`), and footer text (`BEYOND ESCAPES | SRI LANKA`).
2. **Intelligent Content Injection**:
   - `python/generate_docx.py` opens the template document using `python-docx`.
   - Strips all existing sample itinerary paragraphs and tables from the `w:body`.
   - **Crucially retains the section properties (`w:sectPr`)**, ensuring header/footer references (`rId8`, `rId9`), page size (A5), and margins (`top=936`, `left=1080`, `right=1080`, `bottom=936`) are 100% intact.
3. **Branded Element Rendering**:
   - **Day / Section Bars**: Inserted as centered single-cell tables with full width (`10080 dxa`), shading color `#3973B9`, and white bold Times New Roman text (`12pt`).
   - **Attraction Subheadings**: Bold underlined Times New Roman `12pt`.
   - **Bullet Lists**: Native Word `List Bullet` paragraphs with zero after-spacing.
   - **Tables**: Styled with blue header bars and borders.
   - **Closing**: A dedicated cancellation-policy page, centered `****END OF SERVICES****`, and Beyond Escapes contact details and logos.

### Finalized itinerary layout reference

The supplied finalized itinerary was measured at approximately **1,356 words**, **8 A4 pages**, and **11 inline images**. New itinerary exports use a branded cover with editable Word title, overview, welcome, route, and contact text; only the supplied Ayubowan welcome banner and route map are images. Daily sections combine a concise, chronological bullet list of key activities with descriptive paragraphs under attraction subheadings. The editor includes dedicated first- and last-page controls and previews. Destination photos are constrained to **4.8 × 3 inches** by default. Generated itinerary content targets about **1,350–1,650 words** for a typical week-long trip, with more detailed daily activity descriptions. A separate final page contains editable cancellation wording, the end-of-services marker, contact details, and Beyond Escapes logos.

The route editor uses the no-key OpenFreeMap Liberty style through MapLibre GL and displays map attribution on the exported page. It can ask the public OSRM demo server for a road-following route; that service is best-effort and has no availability guarantee. A successful road route automatically captures the map canvas and includes it on the cover and in exports; **Apply map to cover** can recapture a manually adjusted view. If an itinerary has no saved map image or its image is out of date for the current stops, export opens the editor and attempts to generate one; export never substitutes an illustrative island graphic. When routing is unavailable, users can place and reorder stops manually or upload a prepared map image. The visible direct-line fallback is labeled as not road-routed. For production routing reliability, set `NEXT_PUBLIC_OSRM_ROUTING_URL` to an appropriately hosted OSRM-compatible endpoint. Itineraries always use the official Beyond Escapes template; other document types continue to use the selected template. The official template header logos, blue `#3973B9` heading bars, and branded footer remain in place.

---

## 🔧 Troubleshooting

| Issue | Resolution |
|-------|------------|
| `GEMINI_API_KEY is not configured` | Locally, set it in `.env.local` and restart the server. On Vercel, add it under **Settings > Environment Variables** and redeploy. |
| `Google rejected GEMINI_API_KEY` | Set the Vercel variable to a valid raw Gemini API key from Google AI Studio, without the `GEMINI_API_KEY=` prefix, then redeploy. |
| `Python was not found` | Ensure Python is added to Windows PATH, or install via `winget install Python.Python.3.12`. |
| `python-docx not installed` | Run `python -m pip install python-docx lxml docx2pdf`. |
| `PDF conversion failed` | Ensure either LibreOffice or Microsoft Word is installed. The engine automatically detects both. |
| `Running scripts is disabled on this system` | In PowerShell run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force`. |
