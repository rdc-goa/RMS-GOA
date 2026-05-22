# Research Paper Incentive Calculation Logic

## Example: Dr. PRINCE CHANDULAL JAIN's Claim

### Paper Details
- **Journal**: Alexandria Engineering Journal
- **Publication Type**: Research Articles/Short Communications
- **Journal Classification**: International
- **Indexed In**: WoS (Web of Science)
- **WoS Type**: SCIE (Science Citation Index Expanded)
- **Q Rating**: Q1
- **Author Role**: Corresponding Author / 5th position
- **Internal Authors**: 2 (from PU)
- **Total Authors**: 7
- **PU Name in Publication**: No
- **APC Paid by University**: No

---

## Step-by-Step Calculation

### **Step 1: Check Eligibility**
```
Is the author beyond 5th position? 
- Author position: 5th → ✓ Eligible (5th position is the cutoff)
- Continues to calculation
```

### **Step 2: Get Base Incentive**
```
Faculty: Not specified (assume Engineering & Technology - Special Policy Faculty)
Designation: Not specified (assume Regular Faculty, not Ph.D Scholar)

Rules Applied:
1. Journal Classification: Q1
2. Publication Type: Research Articles/Short Communications
3. Special Faculty: YES (Engineering & Technology is in SPECIAL_POLICY_FACULTIES)

Base Incentive Calculation:
- Since faculty is "Engineering & Technology" (Special Policy Faculty)
- And journalClassification = 'Q1'
- Base Amount = 15,000 INR (Standard Q1 rate for all faculties)
```

### **Step 3: Adjust for Publication Type**
```
Publication Type: Research Articles/Short Communications
- Adjustment factor: 1.0 (no reduction)
- Amount after adjustment: 15,000 × 1.0 = 15,000 INR
```

### **Step 4: Apply University-Level Deductions**
```
Deduction 1: PU Name in Publication?
- Value: No
- Effect: Amount ÷ 2 = 15,000 ÷ 2 = 7,500 INR

Deduction 2: APC Paid by University?
- Value: No
- Effect: No deduction applied
- Total after deductions: 7,500 INR
```

### **Step 5: Identify Internal Authors & Roles**
```
All Authors (7 total):
1. Dr. PRINCE CHANDULAL JAIN      → Corresponding Author ✓ Internal
2. Upasana Panigrahi                → First Author ✓ Internal
3. Dr. Prabodh Kumar Sahoo         → Corresponding Author ✗ External
4. M. K. Panda                      → Co-Author ✗ External
5. S. R. Parija                     → Co-Author ✗ External
6. L. Lu                            → Co-Author ✗ External
7. H. Liu                           → Co-Author ✗ External

Internal Authors Count: 2
- Main Authors (First/Corresponding): 2
  - Dr. PRINCE CHANDULAL JAIN (Corresponding)
  - Upasana Panigrahi (First)
- Co-Authors: 0
```

### **Step 6: Apply Author Distribution Rules**

```
Since we have:
- Multiple Internal Authors (2)
- All are Main Authors (First/Corresponding)
- No internal Co-Authors

Apply Rule: Multiple Main Authors Only
Formula: Total Amount ÷ Number of Main Authors
= 7,500 ÷ 2
= 3,750 INR per main author
```

### **Step 7: Final Amount**
```
FINAL INCENTIVE AMOUNT: 3,750 INR
```

---

## Author Distribution Rules Summary

| Scenario | Distribution |
|----------|--------------|
| **Sole Main Author** (First/Corresponding) | 100% of amount |
| **Sole Co-Author** | 80% of amount |
| **Multiple Main Authors (no Co-Authors)** | Amount ÷ # of Main Authors |
| **Multiple Co-Authors (no Main Authors)** | (80% of amount) ÷ # of Co-Authors |
| **Mixed (Main + Co-Authors)** | Main Authors: 70% ÷ # of Main Authors<br>Co-Authors: 30% ÷ # of Co-Authors |

---

## Base Incentive by Journal Classification

### For Regular Faculty (Not Ph.D Scholar, Not Special Policy)
- **Nature/Science/Lancet**: 50,000 INR
- **Top 1% Journals**: 25,000 INR
- **Q1**: 15,000 INR
- **Q2**: 10,000 INR
- **Q3**: 6,000 INR
- **Q4**: 4,000 INR

### For Ph.D Scholars Only
- **Q1**: 6,000 INR
- **Q2**: 4,000 INR
- **Others**: 0 INR (not eligible)

### For Special Policy Faculties (Engineering, Medicine, Sciences, etc.)
- Same as regular faculty above
- **No additional UGC incentives**

---

## Publication Type Adjustments

| Type | Factor |
|------|--------|
| Research Articles/Short Communications | 1.0 (no change) |
| Scopus Indexed Conference Proceedings | 1.0 (no change) |
| Case Reports/Short Surveys | 0.9 (90%) |
| Review Articles (Q3/Q4) | 0.8 (80%) |
| Review Articles (Others) | 1.0 (no change) |
| Letter to the Editor/Editorial | Flat 2,500 INR total |

---

## Special Cases

### Co-Author Beyond 5th Position
- **Eligibility**: NOT eligible for monetary incentive
- Amount: 0 INR
- Note: Still counted for ARPS and analytics

### Scopus Conference Proceedings
- **Rule**: Only "Presenting Authors" are eligible
- Non-presenting co-authors: 0 INR

### Missing PU Name in Publication
- **Deduction**: Amount ÷ 2

### APC Paid by University
- **Deduction**: Amount ÷ 2
- Deductions stack if both apply

---

## Key Policies

1. **Co-author Position Limit**: Only authors up to 5th position are eligible
2. **PU Name Requirement**: If PU not mentioned, incentive is halved
3. **APC Policy**: If university paid APC, incentive is halved
4. **Special Faculty Rule**: Engineering, Medicine, Sciences faculties follow standard rules (no UGC bonus)
5. **PhD Scholar Rule**: PhD Scholars only get Q1/Q2 incentives (6k/4k)
