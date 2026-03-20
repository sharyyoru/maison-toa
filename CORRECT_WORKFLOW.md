# Correct DocSpace Workflow - Files Stay in Supabase

## ✅ Confirmed Workflow

### Storage Strategy
- **Primary Storage**: Supabase `patient-docs` bucket ONLY
- **DocSpace Role**: Temporary editing environment (like RAM)
- **After Editing**: File deleted from DocSpace, saved to Supabase

---

## Complete Flow

### 1. Template Management & Initialization

#### `fetchTemplatesList()`
**Purpose**: Get list of available templates

**Source**: `templates` bucket (Supabase)

**API**: `GET /api/documents/templates`

**Returns**: List of templates with `id`, `name`, `file_path`, `category`

---

#### `initializeNewDocument(templatePath, patientId)`
**Purpose**: Create new patient document from template

**Process**:
1. Download template from `templates` bucket
2. Generate unique document ID
3. Create database record in `patient_documents`
4. **Save to** `patient-docs/{patientId}/{documentId}.docx` (PRIMARY STORAGE)
5. Upload to DocSpace for editing (TEMPORARY)
6. Return DocSpace file ID for editor

**API**: `POST /api/documents/patient/create-from-template`

**Request**:
```json
{
  "patientId": "uuid",
  "templateId": "uuid", 
  "templatePath": "consent-forms/botox.docx",
  "title": "Botox Consent"
}
```

**Response**:
```json
{
  "success": true,
  "document": {
    "id": "doc-uuid",
    "patient_id": "patient-uuid",
    "title": "Botox Consent",
    "docspace_file_id": "temp-12345"
  },
  "fileId": "temp-12345"
}
```

**Storage After**:
- ✅ `templates/consent-forms/botox.docx` (unchanged)
- ✅ `patient-docs/{patientId}/{documentId}.docx` (new copy)
- ⏳ DocSpace (temporary for editing)

---

#### `getPatientFolderContent(patientId)`
**Purpose**: List all documents for a patient

**Source**: `patient-docs/{patientId}/` folder

**API**: `GET /api/documents/patient?patientId={id}`

**Returns**: List of documents from database with metadata

---

### 2. DocSpace Editor Integration

#### `generateDocSpaceSession(documentId)`
**Purpose**: Open document in DocSpace editor

**Process**:
1. Check if `docspace_file_id` exists
2. If yes: Open editor directly
3. If no: Upload to DocSpace first, then open

**Component**: `DocSpaceEditor`

**Props**:
```typescript
{
  docSpaceUrl: "https://docspace-hm9cxt.onlyoffice.com/",
  fileId: "temp-12345",
  mode: "edit",
  callbackUrl: "/api/documents/docspace/callback"
}
```

**DocSpace Config**:
```typescript
{
  frameId: "docspace-editor",
  src: docSpaceUrl,
  id: fileId,
  callbackUrl: `${origin}/api/documents/docspace/callback`,
  editorCustomization: {
    autosave: true,
    forcesave: true
  }
}
```

---

#### `openInDocSpace(fileId)`
**Purpose**: Display DocSpace editor in fullscreen

**UI**: Fullscreen iframe with DocSpace editor

**Features**:
- Auto-save enabled
- Force-save on close
- Callback URL configured

---

#### `syncDocSpaceToSupabase()`
**Purpose**: Save edited document back to Supabase

**Trigger**: DocSpace callback webhook

**API**: `POST /api/documents/docspace/callback`

**DocSpace Callback Payload**:
```json
{
  "key": "document-uuid",
  "status": 2,
  "url": "https://docspace.../download",
  "users": ["user-id"]
}
```

**Status Codes**:
- `1` - Document being edited
- `2` - Document ready for saving (closed)
- `6` - Document force-saved (still open)

**Process**:
1. Receive callback from DocSpace
2. Download edited file from DocSpace
3. **Overwrite** `patient-docs/{patientId}/{documentId}.docx`
4. Update `last_edited_at` timestamp in database
5. **Delete file from DocSpace** (if status = 2)
6. Return success to DocSpace

**Storage After**:
- ✅ `patient-docs/{patientId}/{documentId}.docx` (updated with edits)
- ❌ DocSpace (file deleted - no longer needed)

---

### 3. UI & File Operations

#### `renderFileStorageView(patientId)`
**Purpose**: Display patient's documents

**UI**:
```
┌─────────────────────────────────────────────┐
│ 📁 File Storage                              │
├─────────────────────────────────────────────┤
│ [Search...] [New Document]                  │
├─────────────────────────────────────────────┤
│ 📄 Botox Consent     [Edit] [Download] [❌] │
│ 📄 Prescription      [Edit] [Download] [❌] │
└─────────────────────────────────────────────┘
```

**Data Source**: `patient_documents` table + `patient-docs` bucket

---

#### `handleCreateNewClick()`
**Purpose**: Open template selector modal

**Flow**:
1. Fetch templates list
2. Show modal with templates
3. User selects template
4. Call `initializeNewDocument()`
5. Open DocSpace editor

---

#### `downloadFile(documentId)`
**Purpose**: Download document to user's computer

**Source**: `patient-docs/{patientId}/{documentId}.docx`

**API**: `GET /api/documents/patient/{id}/download`

**Process**:
1. Get document metadata
2. Download from Supabase storage
3. Stream to user's browser

---

#### `deleteFile(documentId)`
**Purpose**: Delete document

**API**: `DELETE /api/documents/patient?documentId={id}`

**Process**:
1. Delete from `patient-docs` bucket
2. Delete from `patient_documents` table
3. If exists in DocSpace, delete from DocSpace
4. Refresh UI

---

## Functional Logic Flow

| Action | Source | Destination | Tool Used | Storage |
|--------|--------|-------------|-----------|---------|
| **Create New** | `templates` bucket | `patient-docs/{id}/` | Supabase Storage API | ✅ Supabase |
| **Upload to DocSpace** | `patient-docs/{id}/` | DocSpace (temp) | DocSpace API | ⏳ Temporary |
| **Edit File** | DocSpace (temp) | DocSpace (temp) | DocSpace Editor | ⏳ Temporary |
| **Save File** | DocSpace (temp) | `patient-docs/{id}/` | Callback Webhook | ✅ Supabase |
| **Delete from DocSpace** | DocSpace (temp) | - | DocSpace API | ❌ Removed |
| **View List** | `patient-docs/{id}/` | User UI | Supabase Client | ✅ Supabase |
| **Download** | `patient-docs/{id}/` | User Computer | Supabase Storage | ✅ Supabase |

---

## Key Points

### ✅ Files Stored in Supabase ONLY
- Primary storage: `patient-docs/{patientId}/{documentId}.docx`
- Templates: `templates/{category}/{name}.docx`
- DocSpace: Temporary editing only (deleted after save)

### ✅ DocSpace is Temporary
- Files uploaded to DocSpace for editing
- After save, files deleted from DocSpace
- DocSpace acts like RAM, not storage

### ✅ Callback Webhook
- DocSpace calls `/api/documents/docspace/callback` on save
- Webhook downloads edited file
- Webhook saves to Supabase
- Webhook deletes from DocSpace

### ✅ No Permanent DocSpace Storage
- DocSpace room is temporary workspace
- Files don't accumulate in DocSpace
- All permanent storage in Supabase

---

## API Endpoints Summary

### Document Creation
- `GET /api/documents/templates` - List templates
- `POST /api/documents/patient/create-from-template` - Create from template

### Document Management
- `GET /api/documents/patient?patientId={id}` - List patient documents
- `GET /api/documents/patient/{id}/download` - Download document
- `DELETE /api/documents/patient?documentId={id}` - Delete document

### DocSpace Integration
- `POST /api/documents/docspace/upload` - Upload to DocSpace (legacy)
- `POST /api/documents/docspace/callback` - Save from DocSpace to Supabase

---

## Testing Checklist

- [ ] Create document from template
- [ ] Verify file in `patient-docs/{patientId}/` bucket
- [ ] Verify file uploaded to DocSpace temporarily
- [ ] Open in DocSpace editor
- [ ] Make edits
- [ ] Save/close editor
- [ ] Verify callback triggered
- [ ] Verify edited file in `patient-docs/{patientId}/` bucket
- [ ] Verify file deleted from DocSpace
- [ ] Download file from Supabase
- [ ] Verify edits are present

---

## Summary

**Storage**: Supabase `patient-docs` bucket ONLY

**DocSpace**: Temporary editing environment (deleted after save)

**Workflow**: Template → Supabase → DocSpace (temp) → Edit → Save → Supabase → Delete from DocSpace

**Result**: All files permanently stored in Supabase, organized by patient ID, with DocSpace used only for editing.
