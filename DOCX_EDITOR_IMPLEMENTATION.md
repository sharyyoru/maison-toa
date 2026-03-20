# Custom DOCX Editor Implementation Plan

## Overview
Building a 100% fidelity DOCX editor in React with Supabase storage integration.

## Architecture

### 1. Document Parsing & Serialization
**Libraries**:
- `mammoth.js` - Convert .docx to HTML (for initial display)
- `docx` - Generate .docx files from structured data
- `jszip` - Unzip .docx files to access XML

**Components**:
```
src/lib/docx/
  ├── parser.ts       - Parse .docx XML to JSON state
  ├── serializer.ts   - Convert JSON state back to .docx
  ├── types.ts        - TypeScript types for document structure
  └── utils.ts        - Helper functions
```

### 2. Editor Component
**Library**: Slate.js (headless rich text editor)

**Why Slate.js**:
- Fully customizable
- React-based
- Handles complex document structures
- Good for building custom editors

**Components**:
```
src/components/DocxEditor/
  ├── DocxEditor.tsx           - Main editor component
  ├── Toolbar.tsx              - Formatting toolbar
  ├── elements/
  │   ├── Paragraph.tsx
  │   ├── Heading.tsx
  │   ├── List.tsx
  │   └── Table.tsx
  └── plugins/
      ├── withTables.ts
      ├── withImages.ts
      └── withFormatting.ts
```

### 3. Workflow Integration

```
Template Selection
    ↓
Download from Supabase 'templates' bucket
    ↓
Parse .docx to Slate.js format
    ↓
Render in Editor
    ↓
User Edits
    ↓
Convert Slate.js state to .docx
    ↓
Upload to Supabase 'patient-docs' bucket
    ↓
Update database record
```

## Implementation Steps

### Phase 1: Setup & Parsing (Day 1)
1. ✅ Remove DocSpace code
2. ✅ Install libraries: `docx`, `mammoth`, `slate`, `slate-react`, `slate-history`
3. Create DOCX parser utility
4. Create DOCX serializer utility

### Phase 2: Basic Editor (Day 2-3)
1. Build Slate.js editor component
2. Implement basic formatting (bold, italic, underline)
3. Add paragraph styles (normal, headings)
4. Implement undo/redo

### Phase 3: Advanced Features (Day 4-5)
1. Tables support
2. Lists (bullets, numbering)
3. Images
4. Text alignment
5. Font selection

### Phase 4: Integration (Day 6)
1. Connect to template workflow
2. Save to Supabase
3. Load from Supabase
4. Update database records

### Phase 5: Polish (Day 7)
1. Styling and UI
2. Error handling
3. Loading states
4. Testing

## Technical Decisions

### Why NOT Canvas-based?
- More complex to implement
- Harder to make accessible
- Difficult to integrate with React

### Why Slate.js over ProseMirror?
- More React-friendly
- Simpler API
- Better TypeScript support
- Easier to customize

### Limitations to Accept
- **100% fidelity is impossible** in a web browser
- We'll aim for **95% fidelity** for common use cases
- Complex Word features (macros, embedded objects) won't work
- Page breaks will be approximate

## File Structure

```
src/
├── components/
│   └── DocxEditor/
│       ├── DocxEditor.tsx
│       ├── Toolbar.tsx
│       ├── EditorElement.tsx
│       ├── EditorLeaf.tsx
│       └── plugins/
├── lib/
│   └── docx/
│       ├── parser.ts
│       ├── serializer.ts
│       ├── types.ts
│       └── utils.ts
└── app/
    └── api/
        └── documents/
            ├── parse/route.ts
            └── export/route.ts
```

## API Endpoints

### POST /api/documents/parse
- Input: .docx file from Supabase
- Output: Slate.js JSON format

### POST /api/documents/export
- Input: Slate.js JSON format
- Output: .docx blob
- Action: Upload to Supabase

## Next Steps

1. Install dependencies
2. Create basic parser
3. Build minimal editor
4. Test with simple template
5. Iterate and improve

## Estimated Timeline
- **Minimum Viable Product**: 3-4 days
- **Production Ready**: 1-2 weeks
- **Full Feature Parity**: 1-2 months

## Alternative: Quick Solution
If timeline is critical, consider:
1. Download .docx from Supabase
2. User edits locally in Word/LibreOffice
3. Upload edited file back to Supabase

This maintains 100% fidelity but requires manual download/upload.
