# Standard Operating Procedures (SOP) - R&D Portal

This document provides detailed instructions for all user roles within the Research & Development Portal. It serves as a comprehensive guide to utilizing the portal's features effectively.

## Table of Contents
1.  [Faculty (Standard User)](#1-faculty-standard-user)
    -   [Profile & Setting](#profile--settings)
    -   [IMR Workflow (Intramural Research)](#imr-workflow-intramural-research)
    -   [EMR Workflow (Extramural Research)](#emr-workflow-extramural-research)
    -   [Incentive Claim Workflow](#incentive-claim-workflow)
    -   [Project Recruitment Workflow](#project-recruitment-workflow)
2.  [Evaluator](#2-evaluator)
    -   [IMR & EMR Evaluation](#imr--emr-evaluation)
3.  [Administrative Roles (CRO, Principal, HOD)](#3-administrative-roles)
4.  [Admin & Super-admin](#4-admin--super-admin)
    -   [Core Management Tasks](#core-management-tasks)
    -   [System Administration](#system-administration)

---

## 1. Faculty (Standard User)
This is the base role for all teaching and research staff.

### Profile & Settings
1.  **First-Time Login (Profile Setup):**
    -   On your first login, you will be guided to the **Profile Setup** page. This is a critical and mandatory step.
    -   You can pre-fill your academic details by entering your MIS ID and clicking "Fetch My Details". Review the information for accuracy.
    -   Upload a professional profile picture.
    -   Complete all required fields, including your Campus, Faculty, Institute, Department, and Designation.

2.  **Settings Page:**
    -   Navigate to **Settings** from the sidebar at any time to update your profile.
    -   **Crucially, you must complete your salary bank account details**. This information is required for any grant disbursal or incentive claim. The portal will not allow you to submit projects until this is complete.
    -   You can also update your researcher IDs (ORCID, Scopus, etc.) and change your password from this page.

### IMR Workflow (Intramural Research)
1.  **New Project Submission:**
    -   Navigate to **New Submission** from the sidebar.
    -   The submission form is divided into four steps:
        1.  **Project Details:** Enter the title, abstract, and category. Align your project with UN Sustainable Development Goals (SDGs).
        2.  **Team Info:** Upload your CV. Add Co-PIs by searching for their MIS ID; they must be registered. For each Co-PI, you must upload their CV. List any student members involved.
        3.  **File Uploads:** Upload your main Project Proposal (PDF) and, if applicable, your Ethics Approval document (PDF).
        4.  **Timeline & Outcomes:** Detail the project timeline and the expected outcomes or impact.
    -   At any step, click **Save as Draft**. Drafts are accessible from the **My Projects** page to be completed later.
    -   On the final step, you must agree to the guidelines before the "Submit Project" button becomes active.

2.  **Project Tracking ("My Projects" Page):**
    -   Go to the **My Projects** page to view all IMR projects you are associated with.
    -   Monitor the project status: `Draft`, `Submitted`, `Under Review`, `Revision Needed`, `Recommended`, `Not Recommended`, `In Progress`, `Pending Completion Approval`, `Completed`. Each status change will trigger a notification.

### EMR Workflow (Extramural Research)
1.  **Browse Opportunities:** Navigate to the **EMR Calendar** to view all available external funding calls.
2.  **Register Interest:** For any "Open" call, click **Register Interest** before the deadline and add any Co-PIs.
3.  **Await Meeting Schedule:** An administrator will schedule presentation slots. You will be notified via email and in-app notification.
4.  **Upload Presentation:** Once scheduled, you must upload your presentation (PPT/PPTX) before the hard deadline, which is **2 days prior to your presentation date at 5:00 PM**.
5.  **Manage Uploads:** Before the deadline, you can view, replace, or remove your uploaded presentation from your application card on the calendar page.

### Incentive Claim Workflow
For a detailed guide on how to submit claims, please refer to the **[Incentive Claims SOP](src/INCENTIVE_SOP.md)**.
1.  **Access Portal:** Navigate to **Incentive Claims** from the sidebar.
2.  **Select Claim Type:** Choose the category for your claim (e.g., Research Papers, Patents).
3.  **Fill & Submit:** Complete the form with all required details and proofs. You can save a draft at any time.
4.  **Track Status:** Use the "My Claims" and "Co-Author Claims" tabs to monitor your applications. If a co-author lists you on their claim, you must go to the "Co-Author Claims" tab to apply for your share.

### Project Recruitment Workflow
1.  **Create a Posting:** Navigate to **Post a Job** from the sidebar and fill out the details.
2.  **Submit for Approval:** Your job posting will be submitted to an administrator for review.
3.  **Manage Postings:** View the status of your postings and see the list of applicants for approved jobs.

---

## 2. Evaluator
This role is assigned to expert reviewers for IMR or EMR proposals.

### IMR & EMR Evaluation
1.  **Receive Assignment:** You will be notified by email and in-app notification when assigned to an evaluation committee.
2.  **Access Evaluation Queue:**
    -   Navigate to the **Evaluation Queue**. This page has two tabs: "IMR Projects" and "EMR Presentations".
    -   **Important:** You can only submit your IMR evaluation on the day of the scheduled meeting.
3.  **Evaluate a Project/Presentation:**
    -   On the meeting day, select a project or presentation from the queue.
    -   Review all submitted documents (proposal, CVs, PPTs).
    -   Use the **Evaluation Form** provided on the details page. AI-assisted prompts are available to guide your feedback.
    -   Select your recommendation (`Recommended`, `Not Recommended`, or `Revision Is Needed`) and submit your detailed comments.

---

## 3. Administrative Roles
(CRO, Principal, Head of Department)

These roles provide a hierarchical, read-only oversight of the research activities within their specific scope.

-   **Project Oversight:** Navigate to **All Projects**. The project list is automatically filtered based on your role:
    -   **CRO:** Filtered by your assigned Faculty/Faculties.
    -   **Principal:** Filtered by your assigned Institute.
    -   **HOD:** Filtered by your assigned Department.
-   **Analytics:** Navigate to the **Analytics** dashboard. Data is automatically aggregated to provide relevant insights:
    -   **CRO:** Data aggregated by Faculty.
    -   **Principal:** Data aggregated by Institute.
    -   **HOD:** Data specific by Department.

---

## 4. Admin & Super-admin
These roles have the highest level of access for managing the entire portal.

### Core Management Tasks
-   **IMR Meeting Scheduling:** From **Schedule Meeting**, select submitted projects, set a date/time/venue, and assign an evaluation committee. The system automates all notifications.
-   **EMR Call Management:** From the **EMR Calendar**, create new funding calls, edit existing ones, and send email announcements.
-   **EMR Registration & Meeting Scheduling:** From **EMR Management**, view registered users for a call and schedule their presentation meetings.
-   **Recruitment Approvals:** From **Recruitment Approvals**, review and approve or reject job postings submitted by faculty.

### System Administration
-   **User Management:** From **Manage Users**, assign roles (Faculty, Evaluator, CRO, Admin) to users. For CROs, you can assign them to specific faculties.
-   **Bulk Data Management:** Use the **Bulk Upload** modules to import historical project, publication, or incentive data from formatted Excel files.
-   **System Health:** The **System Health** dashboard allows you to monitor the connectivity and status of all integrated Firebase services.
-   **Module Management (Super-admin only):** A powerful feature to dynamically grant or revoke access to any part of the portal (e.g., "Manage Users") for any user, providing fine-grained permission control beyond the default roles.
