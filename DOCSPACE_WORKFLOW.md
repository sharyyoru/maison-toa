# DocSpace Document Workflow - Simplified

## Overview

**Single File Storage view** with documents that can be edited in DocSpace. All files stored in Supabase, edited in DocSpace.

---

## Workflow

### 1. Templates (Read-Only)
- **Location**: Supabase `templates` bucket
- **Purpose**: Master templates that never change
- **Examples**: Consent forms, prescriptions, reports

### 2. Create Document from Template
**User Action**: Click "New Document" → Select template

**System Process**:
1. Download template from `templates` bucket
2. Create database record in `patient_documents`
3. Copy template to `patient-docs/{patientId}/{documentId}.docx`
4. Upload to DocSpace
5. Return DocSpace file ID
6. Open in DocSpace editor

**Result**: 
- Template unchanged in `templates` bucket ✅
- New document in `patient-docs` bucket ✅
- Document in DocSpace ready to edit ✅

### 3. Edit Document
**User Action**: Click edit icon on document

**System Process**:
1. Check if `docspace_file_id` exists
2. If yes: Open DocSpace editor directly
3. If no: Upload to DocSpace first, then open

**Result**: Document opens in DocSpace editor with 100% DOCX fidelity

### 4. Auto-Save
**DocSpace Behavior**: Changes auto-save to DocSpace

**Note**: DocSpace is the "live" editing environment. Changes persist in DocSpace.

### 5. Download/Sync (Optional Future Feature)
**Potential**: Download from DocSpace back to `patient-docs` bucket for backup

---

## File Storage Locations

### Supabase Storage

**`templates` bucket**:
```
templates/
├── consent-forms/
│   ├── botox-consent.docx
│   └── filler-consent.docx
├── prescriptions/
│   ├── prescription-template.docx
│   └── post-op-instructions.docx
└── reports/
    └── treatment-report.docx
```

**`patient-docs` bucket**:
```
patient-docs/
├── {patient-id-1}/
│   ├── {document-id-1}.docx
│   ├── {document-id-2}.docx
│   └── {document-id-3}.docx
├── {patient-id-2}/
│   ├── {document-id-4}.docx
│   └── {document-id-5}.docx
```

### DocSpace Storage

**Patient Documents room** (Room ID: `TH8KPxfXMpXG8G2`):
```
Patient Documents/
├── Botox Consent - John Doe.docx
├── Prescription - Jane Smith.docx
├── Treatment Report - Alice Johnson.docx
```

---

## Database Schema

### `patient_documents` table

```sql
CREATE TABLE patient_documents (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES patients(id),
  template_id UUID, -- Reference to which template was used
  title TEXT,
  content TEXT, -- Metadata/description
  status TEXT, -- draft, final, signed, archived
  version INTEGER,
  docspace_file_id TEXT, -- DocSpace file ID for editing
  created_by_name TEXT,
  last_edited_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## UI Structure

### Single Tab: File Storage

```
┌─────────────────────────────────────────────────────┐
│ 📁 File Storage                                      │
├─────────────────────────────────────────────────────┤
│ [Search...] [New Document]                          │
├─────────────────────────────────────────────────────┤
│ 📄 Botox Consent        Draft  v1  [Edit] [Delete] │
│ 📄 Prescription         Final  v2  [Edit] [Delete] │
│ 📄 Treatment Report     Draft  v1  [Edit] [Delete] │
└─────────────────────────────────────────────────────┘
```

**No more**:
- ❌ Document Templates tab
- ❌ Separate template browsing view

**Now**:
- ✅ Single File Storage view
- ✅ New Document button opens template selector
- ✅ All documents editable in DocSpace

---

## API Endpoints

### `POST /api/documents/patient/create-from-template`
**Purpose**: Create new document from template

**Request**:
```json
{
  "patientId": "uuid",
  "templateId": "uuid",
  "templatePath": "consent-forms/botox-consent.docx",
  "title": "Botox Consent"
}
```

**Response**:
```json
{
  "success": true,
  "document": {
    "id": "uuid",
    "patient_id": "uuid",
    "title": "Botox Consent",
    "docspace_file_id": "12345"
  },
  "fileId": "12345",
  "docSpaceUrl": "https://docspace-hm9cxt.onlyoffice.com/"
}
```

### `POST /api/documents/docspace/upload`
**Purpose**: Upload existing document to DocSpace (for legacy documents)

**Request**:
```json
{
  "documentId": "uuid",
  "patientId": "uuid",
  "title": "Document Title"
}
```

**Response**:
```json
{
  "success": true,
  "fileId": "12345",
  "docSpaceUrl": "https://docspace-hm9cxt.onlyoffice.com/"
}
```

---

## Benefits

### ✅ Simplified UX
- Single File Storage view
- No confusion between templates and documents
- Clear workflow: New Document → Select Template → Edit

### ✅ Template Protection
- Templates never modified
- Always available for reuse
- Stored separately in `templates` bucket

### ✅ Patient Data Organization
- Each patient's documents in their own folder
- Easy to find and manage
- Stored in `patient-docs/{patientId}/`

### ✅ DocSpace Integration
- 100% DOCX fidelity
- Real-time editing
- Auto-save
- No Google quota issues

### ✅ File Storage Visibility
- All documents visible in Supabase Storage
- Can download/backup anytime
- Full control over data

---

## Testing Checklist

- [ ] Run database migration (add `docspace_file_id` column)
- [ ] Upload templates to `templates` bucket
- [ ] Click "New Document"
- [ ] Select template
- [ ] Verify document created in `patient-docs/{patientId}/`
- [ ] Verify document uploaded to DocSpace
- [ ] DocSpace editor opens with perfect DOCX rendering
- [ ] Make edits in DocSpace
- [ ] Changes auto-save
- [ ] Close editor
- [ ] Re-open document - loads instantly from DocSpace
- [ ] Verify file exists in Supabase Storage

---

## Summary

**Workflow**: Templates (read-only) → Copy to patient-docs → Upload to DocSpace → Edit → Auto-save

**Storage**: 
- Templates: `templates` bucket (never change)
- Patient docs: `patient-docs/{patientId}/` bucket (one copy per document)
- DocSpace: Live editing environment

**UI**: Single File Storage tab with New Document button

**Result**: Simple, clean workflow with 100% DOCX fidelity and full data control.
