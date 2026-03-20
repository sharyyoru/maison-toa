# Maison Toa - Data Migration Audit Report
**Generated:** March 20, 2026  
**Prepared for:** Maison Toa Client

---

## Executive Summary

This report provides a comprehensive audit of the patient data migration from the legacy system to the new Maison Toa platform. The audit identifies what data has been migrated, what data is available but NOT yet migrated, and what data fields are empty or missing.

---

## 1. DATA SOURCE INVENTORY

### 1.1 Local Data Files Provided
| Source | Location | Status |
|--------|----------|--------|
| Patient Export CSV | `Exportreport_20260212.csv` | ✅ Migrated |
| Patient File Folders | 14,128 folders | ⚠️ NOT Migrated |
| Medical Records ZIP | 9.8 GB extracted | ✅ Extracted |

### 1.2 File Statistics from Local Folders
| File Type | Count | Description |
|-----------|-------|-------------|
| **PDF Files** | 110,151 | Invoices, consultations, analyses, insurance docs |
| **Excel Files (.xlsx)** | 13,784 | Appointment schedules per patient |
| **Images (JPG/JPEG/PNG)** | 1,349 | Patient photos |
| **Other Files** | 2,227 | Various formats, some with naming issues |
| **TOTAL FILES** | **127,511** | Across all patient folders |

### 1.3 Folder Structure Per Patient
Each patient folder contains:
```
[PatientID]_[FirstName]_[LastName]_[DOB]/
├── 2_Consultations/          # Consultation records
├── 5_Documents/              # Analyses, photos, insurance docs
├── 6_Factures/               # Invoices
│   ├── Factures/             # Active invoices
│   └── Factures annulées/    # Cancelled invoices
├── 7_Rendez-vous/            # Appointments (Excel)
├── Consultations_*.pdf       # Consultation PDFs
├── Notes.pdf                 # Patient notes
└── TOA_Fiche_patient_*.pdf   # Patient forms
```

---

## 2. DATABASE MIGRATION STATUS

### 2.1 Current Database State
| Table | Records | Status |
|-------|---------|--------|
| **patients** | 15,694 | ✅ Migrated from CSV |
| **documents** | 0 | ❌ NOT Migrated |
| **consultations** | 0 | ❌ NOT Migrated |
| **appointments** | 0 | ❌ NOT Migrated |
| **deals** | 0 | ❌ NOT Migrated |
| **tasks** | 0 | ❌ NOT Migrated |
| **emails** | 0 | ❌ NOT Migrated |

### 2.2 Patient Record Discrepancy
| Metric | Count |
|--------|-------|
| Patients in Database | 15,694 |
| Patient Folders with Files | 14,128 |
| **Difference** | 1,566 patients have no corresponding file folder |

---

## 3. DATA FIELDS - WHAT'S PRESENT VS MISSING

### 3.1 Patient Data (FROM CSV - MIGRATED ✅)
| Field | Status | Notes |
|-------|--------|-------|
| Patient ID | ✅ Present | Legacy ID preserved in notes |
| First Name | ✅ Present | |
| Last Name | ✅ Present | |
| Date of Birth | ✅ Present | |
| Lifecycle Stage | ✅ Present | Set to 'patient' |
| Patient Notes | ✅ Present | Contains legacy patient number |
| Email | ❌ EMPTY | **0% populated - NOT in CSV export** |
| Phone | ❌ EMPTY | **0% populated - NOT in CSV export** |
| Street Address | ❌ EMPTY | **0% populated - NOT in CSV export** |
| Postal Code | ❌ EMPTY | **0% populated - NOT in CSV export** |
| Town/City | ❌ EMPTY | **0% populated - NOT in CSV export** |
| Emergency Contact | ❌ EMPTY | **0% populated - NOT in CSV export** |
| Avatar/Photo | ❌ EMPTY | Photos exist in files, not linked |

### 3.2 Documents (FROM FILES - NOT MIGRATED ❌)
| Document Type | Files Available | Database Status |
|---------------|-----------------|-----------------|
| Invoice PDFs | ~50,000+ | ❌ Not uploaded |
| Consultation PDFs | ~15,000+ | ❌ Not uploaded |
| Analysis/Lab Reports | ~20,000+ | ❌ Not uploaded |
| Insurance Documents | ~10,000+ | ❌ Not uploaded |
| Patient Photos | 1,349 | ❌ Not uploaded |
| Patient Forms | ~14,000+ | ❌ Not uploaded |

### 3.3 Appointments (FROM XLSX FILES - NOT MIGRATED ❌)
| Data | Files Available | Database Status |
|------|-----------------|-----------------|
| Appointment Schedules | 13,784 Excel files | ❌ Not parsed/imported |

### 3.4 Invoices/Billing (FROM PDF/FOLDER - NOT MIGRATED ❌)
| Data | Available | Database Status |
|------|-----------|-----------------|
| Active Invoices | Yes (in Factures/) | ❌ Not imported |
| Cancelled Invoices | Yes (in Factures annulées/) | ❌ Not imported |
| Reclaim Receipts | Yes | ❌ Not imported |
| Dunning Letters | Yes | ❌ Not imported |

---

## 4. EMPTY/MISSING DATABASE FIELDS

### 4.1 Patient Table - Empty Fields (CRITICAL)
| Field | % Empty | Action Required |
|-------|---------|-----------------|  
| **email** | **100%** | ❌ CRITICAL - Need source data |
| **phone** | **100%** | ❌ CRITICAL - Need source data |
| **street_address** | **100%** | ❌ Need source data |
| **street_number** | **100%** | ❌ Need source data |
| **postal_code** | **100%** | ❌ Need source data |
| **town** | **100%** | ❌ Need source data |
| **country** | **100%** | ❌ Need source data |
| **emergency_contact_name** | **100%** | ❌ Need source data |
| **emergency_contact_phone** | **100%** | ❌ Need source data |
| **avatar_url** | **100%** | Photos exist in files, not linked |
| gender | 100% | Not in CSV export |
| nationality | 100% | Not in CSV export |
| profession | 100% | Not in CSV export |

### 4.2 Tables Completely Empty
| Table | Expected Records | Current | Source Data Available |
|-------|------------------|---------|----------------------|
| consultations | ~15,000+ | 0 | ✅ PDFs available |
| appointments | ~13,000+ | 0 | ✅ Excel files available |
| documents | ~110,000+ | 0 | ✅ Files available |
| deals | Unknown | 0 | ⚠️ Needs review |
| tasks | Unknown | 0 | ⚠️ Needs review |
| emails | Unknown | 0 | ❌ No export provided |

---

## 5. CRITICAL FINDINGS

### 5.1 What IS Working ✅
1. Patient basic data migrated (15,694 records)
2. Database schema is complete with all required columns
3. Application database structure is ready for data

### 5.2 What Needs Immediate Attention ❌
1. **127,511 files NOT uploaded to Supabase storage**
2. **No documents linked to patient records**
3. **No consultation records created from PDFs**
4. **No appointments imported from Excel files**
5. **No invoices imported into billing system**

### 5.3 Data Quality Issues ⚠️
1. 1,566 patients have no corresponding file folder
2. Some files have malformed extensions (naming issues from legacy system)
3. Patient address data completely missing from CSV export
4. Insurance information not in CSV export

---

## 6. RECOMMENDED ACTIONS

### Phase 1: Critical (Immediate)
1. **Upload patient files to Supabase Storage** - 127,511 files
2. **Create document records** linking files to patients
3. **Parse appointment Excel files** and import to appointments table

### Phase 2: Important (Short-term)
4. Import consultation data from PDFs (parse or manual entry)
5. Import invoice data into billing system
6. Link patient photos to profile_photo_url

### Phase 3: Enhancement (Medium-term)
7. Request additional CSV export with address/insurance data
8. Reconcile 1,566 patients without file folders
9. Clean up malformed file extensions

---

## 7. TECHNICAL DETAILS

### 7.1 Database Columns Added (Fixed)
The following columns were missing and have been added:
- `consultations.invoice_status`
- `appointments.title`
- `emails.read_at`
- Plus 20+ additional columns for full functionality

### 7.2 File Upload Estimates
| Metric | Value |
|--------|-------|
| Total Files | 127,511 |
| Estimated Total Size | ~15-20 GB |
| Est. Upload Time | 4-8 hours (depends on connection) |

---

## 8. SUMMARY

| Category | Status | Details |
|----------|--------|---------|
| Patient Records | ✅ Complete | 15,694 migrated |
| Patient Files | ❌ Not Done | 127,511 files pending |
| Consultations | ❌ Not Done | PDFs available, not imported |
| Appointments | ❌ Not Done | Excel files available, not imported |
| Documents | ❌ Not Done | All types available, not uploaded |
| Invoices | ❌ Not Done | PDFs available, not imported |
| Database Schema | ✅ Fixed | All columns now present |

**Bottom Line:** Patient records are migrated, but ALL associated files and documents (127,511 files) have NOT been uploaded or linked to the database. This requires a file migration process to upload to Supabase Storage and create corresponding database records.

---

*Report generated by automated audit system*
