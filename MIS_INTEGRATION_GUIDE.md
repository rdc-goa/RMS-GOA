# API Integration Guide: RDC Portal & UMS

This document outlines the technical requirements for the Parul University Goa MIS (UMS) development team to provide real-time staff data to the RDC Research & Incentive Portal.

## 1. Overview
The RDC Portal currently uses a manual Excel-based import system for staff profiles. To improve efficiency and data accuracy, we are moving to a real-time integration where the portal can fetch a staff member's profile directly from UMS during the "Profile Setup" process.

## 2. API Specification

### 2.1 Endpoint Details
- **Base URL**: `https://ums.paruluniversity.ac.in/api/v1` (Placeholder - Please provide the actual endpoint)
- **Path**: `/staff-lookup`
- **Method**: `GET`
- **Format**: `application/json`

### 2.2 Authentication
Since no API gateway is currently in place, we recommend a simple **Header-based API Key** authentication for this internal service.

- **Header Name**: `x-api-key`
- **Value**: `[TO_BE_GENERATED_BY_MIS_TEAM]`

### 2.3 Request Parameters
The API should support lookups by either `misId` (Primary) or `email`.

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `misId` | `string` | Optional* | The unique MIS Identification number of the staff member. |
| `email` | `string` | Optional* | The university email address of the staff member. |

*\*At least one of `misId` or `email` must be provided.*

---

## 3. Data Schema (Expected Response)

The response should be a JSON object containing the staff details.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | Full name of the staff member. |
| `email` | `string` | University email address. |
| `phoneNumber` | `string` | Primary contact number. |
| `campus` | `string` | Campus location (e.g., Vadodara, Ahmedabad, Rajkot, Goa). |
| `faculty` | `string` | The parent faculty (e.g., Faculty of Engineering & Technology). |
| `institute` | `string` | The specific constituent institute. |
| `department` | `string` | Academic department. |
| `designation` | `string` | Current official designation. |
| `misId` | `string` | MIS ID. |
| `type` | `string` | User classification: `faculty`, `CRO`, or `Institutional`. |
| `orcidId` | `string` | (Optional) Researcher ORCID iD. |
| `scopusId` | `string` | (Optional) Scopus Author ID. |
| `vidwanId` | `string` | (Optional) Vidwan Expert ID. |
| `googleScholarId` | `string` | (Optional) Google Scholar Profile ID. |
| `researchDomain` | `string` | (Optional) Primary area of research/expertise. |

---

## 4. Sample JSON

### 4.1 Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "name": "Dr. John Doe",
    "email": "john.doe@paruluniversity.ac.in",
    "phoneNumber": "9876543210",
    "campus": "Vadodara",
    "faculty": "Faculty of Engineering & Technology",
    "institute": "Parul Institute of Technology",
    "department": "Computer Science & Engineering",
    "designation": "Professor",
    "misId": "12345",
    "type": "faculty",
    "orcidId": "0000-0001-2345-6789",
    "scopusId": "57200000000",
    "vidwanId": "123456",
    "googleScholarId": "ABCDEFG-HIJK",
    "researchDomain": "Artificial Intelligence"
  }
}
```

### 4.2 Not Found Response (`404 Not Found`)
```json
{
  "success": false,
  "message": "Staff member with the provided MIS ID/Email not found."
}
```

### 4.3 Unauthorized (`401 Unauthorized`)
```json
{
  "success": false,
  "message": "Invalid API Key."
}
```

---

## 5. Security Recommendations
1. **HTTPS**: The API must be served over a secure TLS connection.
2. **IP Whitelisting**: We recommend whitelisting the RDC Portal's server IP to restrict access to the endpoint.
3. **Rate Limiting**: Standard rate limiting should be applied to prevent brute-force lookups.

## 6. Technical Contact
For clarifications regarding the portal's internal data mapping, please contact:
- **Developer Name**: [User's Name / Team Name]
- **Email**: [User's Email]
- **Repository**: `prathi912/rdc-imr`