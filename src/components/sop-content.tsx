'use client';

// This component centralizes the SOP content so it can be used in both the public SOP page and the dashboard dialog.
// It uses dangerouslySetInnerHTML because the content is static and controlled, which is a safe use-case.
// Using a library like react-markdown would be overkill for this simple, trusted content.
const sopContent = `
<h1>Standard Operating Procedures (SOP) - R&D Portal</h1>
<p>This document provides detailed instructions for all user roles within the Research & Development Portal. It serves as a comprehensive guide to utilizing the portal's features effectively.</p>
<h2>Table of Contents</h2>
<ol>
    <li><a href="#1-faculty-standard-user">Faculty (Standard User)</a></li>
    <li><a href="#2-evaluator">Evaluator</a></li>
    <li><a href="#3-administrative-roles">Administrative Roles (CRO, Principal, HOD)</a></li>
    <li><a href="#4-admin--super-admin">Admin & Super-admin</a></li>
</ol>
<hr>
<h2 id="1-faculty-standard-user">1. Faculty (Standard User)</h2>
<p>This is the base role for all teaching and research staff.</p>
<p><strong>Key Responsibilities:</strong></p>
<ul>
    <li>Submitting Intramural research project proposals (IMR).</li>
    <li>Registering interest in Extramural research funding calls (EMR).</li>
    <li>Applying for research-related incentives (e.g., for publications, patents).</li>
    <li>Posting job openings for research projects.</li>
    <li>Maintaining a public researcher profile and managing publications.</li>
</ul>
<h3>Profile & Settings</h3>
<ol>
    <li><strong>First-Time Login (Profile Setup):</strong>
        <ul>
            <li>On your first login, you will be guided to the <strong>Profile Setup</strong> page. This is a critical and mandatory step.</li>
            <li>You can pre-fill your academic details by entering your MIS ID and clicking "Fetch My Details". Review the information for accuracy.</li>
            <li>Upload a professional profile picture.</li>
            <li>Complete all required fields, including your Campus, Faculty, Institute, Department, and Designation.</li>
        </ul>
    </li>
    <li><strong>Settings Page:</strong>
        <ul>
            <li>Navigate to <strong>Settings</strong> from the sidebar at any time to update your profile.</li>
            <li><strong>Crucially, you must complete your salary bank account details</strong>. This information is required for any grant disbursal or incentive claim. The portal will not allow you to submit projects until this is complete.</li>
            <li>You can also update your researcher IDs (ORCID, Scopus, etc.) and change your password from this page.</li>
        </ul>
    </li>
</ol>
<h3>IMR Workflow (Intramural Research)</h3>
<ol>
    <li><strong>New Project Submission:</strong>
        <ul>
            <li>Navigate to <strong>New Submission</strong> from the sidebar.</li>
            <li>The submission form is divided into four steps:
                <ol>
                    <li><strong>Project Details:</strong> Enter the title, abstract, and category. Align your project with UN Sustainable Development Goals (SDGs).</li>
                    <li><strong>Team Info:</strong> Upload your CV as the Principal Investigator (PI). Add Co-PIs by searching for their MIS ID. They must be registered on the portal. For each Co-PI added, you must upload their individual CV as a PDF (max 5MB). List any student members involved.</li>
                    <li><strong>File Uploads:</strong> Upload your main Project Proposal (PDF) and, if applicable, your Ethics Approval document (PDF).</li>
                    <li><strong>Timeline & Outcomes:</strong> Detail the project timeline and the expected outcomes or impact.</li>
                </ol>
            </li>
            <li>At any step, click <strong>Save as Draft</strong>. Drafts are accessible from the <strong>My Projects</strong> page to be completed later.</li>
            <li>On the final step, you must agree to the guidelines before the "Submit Project" button becomes active.</li>
        </ul>
    </li>
    <li><strong>Project Tracking ("My Projects" Page):</strong>
        <ul>
            <li>Go to the <strong>My Projects</strong> page to view a list of all IMR projects you are associated with.</li>
            <li>Monitor the project status: <code>Draft</code>, <code>Submitted</code>, <code>Under Review</code>, <code>Revision Needed</code>, <code>Recommended</code>, <code>Not Recommended</code>, <code>In Progress</code>, <code>Pending Completion Approval</code>, <code>Completed</code>. Each status change will trigger a notification.</li>
        </ul>
    </li>
</ol>
<h3>EMR Workflow (Extramural Research)</h3>
<ol>
    <li><strong>Browse Opportunities:</strong> Navigate to the <strong>EMR Calendar</strong> to view all available external funding calls.</li>
    <li><strong>Register Interest:</strong> For any "Open" call, click <strong>Register Interest</strong> before the deadline and add any Co-PIs.</li>
    <li><strong>Await Meeting Schedule:</strong> An administrator will schedule presentation slots. You will be notified via email and in-app notification.</li>
    <li><strong>Upload Presentation:</strong> Once scheduled, you must upload your presentation (PPT/PPTX) before the hard deadline, which is <strong>2 days prior to your presentation date at 5:00 PM</strong>.</li>
    <li><strong>Manage Uploads:</strong> Before the deadline, you can view, replace, or remove your uploaded presentation from your application card on the calendar page.</li>
</ol>
<h3>Incentive Claim Workflow</h3>
<p>For a detailed guide on how to submit claims, please refer to the <strong>[Incentive Claims SOP](src/INCENTIVE_SOP.md)</strong>.</p>
<ol>
    <li><strong>Access Portal:</strong> Navigate to <strong>Incentive Claims</strong> from the sidebar.</li>
    <li><strong>Select Claim Type:</strong> Choose the category for your claim (e.g., Research Papers, Patents).</li>
    <li><strong>Fill & Submit:</strong> Complete the form with all required details and proofs. You can save a draft at any time.</li>
    <li><strong>Track Status:</strong> Use the "My Claims" and "Co-Author Claims" tabs to monitor your applications. If a co-author lists you on their claim, you must go to the "Co-Author Claims" tab to apply for your share.</li>
</ol>
<h3>Project Recruitment Workflow</h3>
<ol>
    <li><strong>Create a Posting:</strong> Navigate to <strong>Post a Job</strong> from the sidebar and fill out the details.</li>
    <li><strong>Submit for Approval:</strong> Your job posting will be submitted to an administrator for review.</li>
    <li><strong>Manage Postings:</strong> View the status of your postings and see the list of applicants for approved jobs.</li>
</ol>
<hr>
<h2 id="2-evaluator">2. Evaluator</h2>
<p>This role is assigned to expert reviewers for IMR or EMR proposals.</p>
<h3>IMR & EMR Evaluation</h3>
<ol>
    <li><strong>Receive Assignment:</strong> You will be notified by email and in-app notification when assigned to an evaluation committee.</li>
    <li><strong>Access Evaluation Queue:</strong>
        <ul>
            <li>Navigate to the <strong>Evaluation Queue</strong>. This page has two tabs: "IMR Projects" and "EMR Presentations".</li>
            <li><strong>Important:</strong> You can only submit your IMR evaluation on the day of the scheduled meeting.</li>
        </ul>
    </li>
    <li><strong>Evaluate a Project/Presentation:</strong>
        <ul>
            <li>On the meeting day, select a project or presentation from the queue.</li>
            <li>Review all submitted documents (proposal, CVs, PPTs).</li>
            <li>Use the <strong>Evaluation Form</strong> provided on the details page. AI-assisted prompts are available to guide your feedback.</li>
            <li>Select your recommendation (<code>Recommended</code>, <code>Not Recommended</code>, or <code>Revision Is Needed</code>) and submit your detailed comments.</li>
        </ul>
    </li>
</ol>
<hr>
<h2 id="3-administrative-roles">3. Administrative Roles</h2>
<p>(CRO, Principal, Head of Department)</p>
<p>These roles provide a hierarchical, read-only oversight of the research activities within their specific scope.</p>
<ul>
    <li><strong>Project Oversight:</strong> Navigate to <strong>All Projects</strong>. The project list is automatically filtered based on your role:
        <ul>
            <li><strong>CRO:</strong> Filtered by your assigned Faculty/Faculties.</li>
            <li><strong>Principal:</strong> Filtered by your assigned Institute.</li>
            <li><strong>HOD:</strong> Filtered by your assigned Department.</li>
        </ul>
    </li>
    <li><strong>Analytics:</strong> Navigate to the <strong>Analytics</strong> dashboard. Data is automatically aggregated to provide relevant insights:
        <ul>
            <li><strong>CRO:</strong> Data aggregated by Institute.</li>
            <li><strong>Principal:</strong> Data aggregated by Department.</li>
            <li><strong>HOD:</strong> Data specific to your Department.</li>
        </ul>
    </li>
</ul>
<hr>
<h2 id="4-admin--super-admin">4. Admin & Super-admin</h2>
<p>These roles have the highest level of access for managing the entire portal.</p>
<h3>Core Management Tasks</h3>
<ul>
    <li><strong>IMR Meeting Scheduling:</strong> From <strong>Schedule Meeting</strong>, select submitted projects, set a date/time/venue, and assign an evaluation committee. The system automates all notifications.</li>
    <li><strong>EMR Call Management:</strong> From the <strong>EMR Calendar</strong>, create new funding calls, edit existing ones, and send email announcements.</li>
    <li><strong>EMR Registration & Meeting Scheduling:</strong> From <strong>EMR Management</strong>, view registered users for a call and schedule their presentation meetings.</li>
    <li><strong>Recruitment Approvals:</strong> From <strong>Recruitment Approvals</strong>, review and approve or reject job postings submitted by faculty.</li>
</ul>
<h3>System Administration</h3>
<ul>
    <li><strong>User Management:</strong> From <strong>Manage Users</strong>, assign roles (Faculty, Evaluator, CRO, Admin) to users. For CROs, you can assign them to specific faculties.</li>
    <li><strong>Bulk Data Management:</strong> Use the <strong>Bulk Upload</strong> modules to import historical project, publication, or incentive data from formatted Excel files.</li>
    <li><strong>System Health:</strong> The <strong>System Health</strong> dashboard allows you to monitor the connectivity and status of all integrated Firebase services.</li>
    <li><strong>Module Management (Super-admin only):</strong> A powerful feature to dynamically grant or revoke access to any part of the portal (e.g., "Manage Users") for any user, providing fine-grained permission control beyond the default roles.</li>
</ul>
`;

export function SopContent() {
    return (
        <div dangerouslySetInnerHTML={{ __html: sopContent.replace(/`/g, '') }} />
    );
}
