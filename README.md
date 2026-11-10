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

3. **Real AI Chat Assistant (Gemini API)**
   - Official current `@google/genai` SDK integration.
   - Generates typed document models (`title`, `heading1`, `heading2`, `paragraph`, `bullet_list`, `numbered_list`, `table`).
   - Revision support: expand, shorten, rewrite, or correct sections.
   - Safe server-side API key protection (keys never reach client code).

4. **Live Document Workspace & Editor**
   - Dual-mode: **Preview** (visual representation of final document) and **Edit** (modify headings, paragraphs, bullet lists, add/remove sections).
   - Template switcher (switch between Beyond Escapes Official and custom uploaded templates).

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

DOCX exports on Vercel are generated in JavaScript and returned directly as downloads. PDF conversion still requires LibreOffice or Microsoft Word and is not available in Vercel functions; use a separate conversion service if PDF export is required in production.

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
   - **Closing**: Centered `****END OF SERVICES****`.

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
