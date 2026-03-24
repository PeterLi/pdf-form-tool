# SAM SmartForm Field Naming Specification

## Overview
Field IDs/names in PDF forms for SAM SmartForms must follow these conventions for proper integration with the SAM backend.

---

## Field Naming Rules

### 0. Uniqueness Requirement ⚠️
**All field IDs/names MUST be unique across the entire form.**

If multiple fields would generate the same name, append a number (starting from 2):
```
✅ FirstName, FirstName2, FirstName3
✅ DateOfBirthDay, DateOfBirthMonth, DateOfBirthYear
✅ Date2Day, Date2Month, Date2Year
✅ Received_Yes, Received2_Yes, Received3_Yes
```

**For date fields:** Insert the number before the suffix:
```
Date → DateDay, DateMonth, DateYear
Date2 → Date2Day, Date2Month, Date2Year (not DateDay2!)
```

The PDF Form Tool automatically ensures uniqueness by:
1. Detecting all duplicate suggested names
2. Keeping first occurrence as-is
3. Appending `2`, `3`, `4`, etc. to subsequent occurrences
4. For date fields: inserting number before `Day`/`Month`/`Year` suffix

### 1. Case Convention
**PascalCase** - First letter of each word capitalized, no spaces.

**Examples:**
```
✅ FirstName
✅ LastName
✅ DateOfBirth
✅ StreetAddress
✅ PhoneNumber
```

**NOT:**
```
❌ firstName (camelCase)
❌ first_name (snake_case)
❌ first-name (kebab-case)
❌ FIRSTNAME (all caps)
```

---

### 2. Allowed Characters
- **Alphabetical:** a-z, A-Z
- **Numbers:** 0-9 (e.g., `Example9000`)
- **Underscores:** _ (allowed, see special cases below)
- **Hyphens:** - (allowed, see special cases below)

**Note:** While underscores and hyphens are allowed, prefer pure PascalCase when possible.

---

### 3. Special Cases

#### Date Fields
Use PascalCase with descriptive suffixes:
```
✅ DateOfBirthDay
✅ DateOfBirthMonth
✅ DateOfBirthYear

✅ StartDateDay
✅ StartDateMonth
✅ StartDateYear
```

**NOT:**
```
❌ dateOfBirth_day
❌ date_of_birth_day
❌ DOB_Day
```

#### Radio Buttons
Pattern: `FIELDNAME_RadioValue`

**Example:**
```
✅ Received_Yes
✅ Received_No
✅ Received_NotSure

✅ Gender_Male
✅ Gender_Female
✅ Gender_Other
```

#### Checkboxes
Pattern: `FIELDNAME_CheckboxValue`

**Example:**
```
✅ Consent_Agree
✅ Marketing_OptIn
✅ Terms_Accepted
```

#### Signature Fields
Pattern: `FIELDNAME_Image`

Fields containing signature-related keywords automatically get `_Image` suffix (capital I).

**Note:** These are still **text input fields** that contain **data URL formatted images** (not image upload boxes).

**Data URL format:** `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB8AAAAfCAY...`

**Keywords detected (case-insensitive):**
- signature
- sign
- signed
- initial

**Example:**
```
✅ Signature_Image
✅ ApplicantSignature_Image
✅ PatientSignature_Image
✅ GuardianSignature_Image
✅ DoctorSignature_Image
```

**Multiple signatures:**
```
✅ Signature_Image
✅ Signature2_Image
✅ Signature3_Image
```

**The PDF Form Tool automatically:**
- Detects signature keywords in labels
- Appends `_Image` suffix (capital I, PascalCase)
- Handles uniqueness (inserts number before `_Image`)

---

### 4. Reserved Field Names

These fields have special meaning in SAM SmartForms:

| Field Name | Purpose | Required |
|------------|---------|----------|
| `SmartFormUniqueID` | Generates unique ID across all SmartForms | Optional |
| `FIELDNAME_emailable` | Email from this field receives PDF copy | Optional |
| `FIELDNAME_Image` | Text field containing data URL image (e.g., `data:image/png;base64,...`) | Optional |

**Example Usage:**
```
Email_emailable         → Email field that receives PDF copy
Signature_Image         → Text field containing data URL (data:image/png;base64,...)
SmartFormUniqueID       → Auto-generated unique identifier
```

---

## Implementation in PDF Form Tool

The PDF Form Tool automatically suggests field names following this spec:

### Text Fields
```
"first name" → FirstName
"last name" → LastName
"street address" → StreetAddress
```

### Date Fields (Clustered)
```
"date of birth" → DateOfBirthDay, DateOfBirthMonth, DateOfBirthYear
"start date" → StartDateDay, StartDateMonth, StartDateYear
```

### Radio Buttons
```
"received: yes/no" → Received_Yes, Received_No
"gender" → Gender_Male, Gender_Female, Gender_Other
```

### Checkboxes
```
"consent" → Consent_Agree
"marketing opt-in" → MarketingOptIn
```

---

## Best Practices

1. **Be descriptive:** `StreetAddress` is better than `Address1`
2. **Be consistent:** Use same naming pattern across all forms
3. **Avoid abbreviations:** `FirstName` not `FName`
4. **Use full words:** `PhoneNumber` not `Phone` or `Tel`
5. **Group related fields:** `Address` prefix for all address fields
   - `AddressStreet`
   - `AddressCity`
   - `AddressPostcode`

---

## Valid Examples

### Good Field Names ✅
```
FirstName
LastName
DateOfBirthDay
DateOfBirthMonth
DateOfBirthYear
Email
PhoneNumber
MobileNumber
StreetAddress
AddressCity
AddressState
AddressPostcode
MedicareNumber
ConsentToTreat_Agree
EmergencyContactName
EmergencyContactPhone
Signature_Image
ApplicantSignature_Image
GuardianSignature_Image
Email_emailable
SmartFormUniqueID
Received_Yes
Received_No
Gender_Male
Gender_Female
```

### Bad Field Names ❌
```
first_name          (snake_case)
firstName           (camelCase)
FIRST_NAME          (SCREAMING_SNAKE_CASE)
first-name          (kebab-case)
fName               (abbreviation)
date_of_birth_day   (snake_case)
dateOfBirth_day     (mixed case)
rcvd_yes            (abbreviation)
```

---

## Migration Notes

**If converting existing forms:**
1. Use PDF Form Tool's "Save Template" feature
2. Review suggested names for compliance
3. Manually adjust if needed (rare)
4. Test template with SAM backend

**Common conversions:**
```
Old                  → New
-------------------- → --------------------
firstName            → FirstName
last_name            → LastName
dateOfBirth_day      → DateOfBirthDay
phone_number         → PhoneNumber
street_address       → StreetAddress
email                → Email
received_yes         → Received_Yes
consent_checkbox     → Consent_Agree
```

---

## References

- SAM SmartForm Documentation (internal)
- PDF Form Tool: `~/Documents/Interact Technology/pdf-form-tool/`
- GitHub: https://github.com/PeterLi/pdf-form-tool

---

**Last Updated:** March 24, 2026  
**Spec Version:** 1.0
