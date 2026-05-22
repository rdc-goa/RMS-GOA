# ARPS Evaluation Period Calculation

## Overview
The ARPS (Annual Research Performance Score) calculator uses a **12-month evaluation window** that spans from June 1st to May 31st of the following year.

## Period Calculation Logic

### Formula
```
Evaluation Year: Y
Evaluation Period: 01-June-(Y-1) to 31-May-Y
```

### Examples

| Evaluation Year | Period |
|---|---|
| 2026 | 01-Jun-2025 to 31-May-2026 |
| 2025 | 01-Jun-2024 to 31-May-2025 |
| 2024 | 01-Jun-2023 to 31-May-2024 |

## Implementation Details

### Backend Calculation (arps-actions.ts)
```typescript
const startDate = new Date(year - 1, 5, 1);        // June 1st of the previous year
const endDate = new Date(year, 4, 31, 23, 59, 59, 999); // May 31st of the selected year
```

The calculation automatically:
1. Fetches all approved incentive claims within the period
2. Includes publications, patents, and EMR projects that were approved during this window
3. Calculates raw scores, applies weightages, and applies caps

### Frontend Display

#### On-Screen Results
When ARPS results are displayed, the evaluation period is shown in a blue info card:
- **Evaluation Year**: The selected year
- **Evaluation Period**: The complete date range (01-Jun-YYYY to 31-May-YYYY+1)

#### PDF Report
The PDF report includes:
- **Evaluation Year** field showing the selected year
- **Evaluation Window** field showing the complete date range
- All contributing claims/projects with their approval dates

## Date Range Examples

### Evaluation Year 2026
- **Start**: June 1, 2025
- **End**: May 31, 2026
- **Duration**: 12 months (overlaps fiscal year)

This means:
- A publication approved on June 15, 2025 ✅ INCLUDED
- A publication approved on May 30, 2026 ✅ INCLUDED  
- A publication approved on May 31, 2026 ✅ INCLUDED
- A publication approved on June 1, 2026 ❌ NOT INCLUDED (next evaluation year)

## Claims Included in Calculation

Only claims with **approved statuses** are included:
- ✅ Accepted
- ✅ Submitted to Accounts
- ✅ Payment Completed

Claims with other statuses are excluded regardless of submission date.

## Financial Year vs Evaluation Year

The ARPS evaluation period **does not align** with the financial year:
- **Financial Year**: April 1 - March 31
- **Evaluation Year**: June 1 - May 31

This offset ensures that:
1. Budget cycles are not aligned with evaluation cycles
2. Different timelines for fiscal and performance tracking
3. Adequate time for claim processing and approval before evaluation closes
