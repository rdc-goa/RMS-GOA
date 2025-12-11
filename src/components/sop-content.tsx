
'use client';

// This component centralizes the SOP content so it can be used in both the public SOP page and the dashboard dialog.
// It uses dangerouslySetInnerHTML because the content is static and controlled, which is a safe use-case.
// Using a library like react-markdown would be overkill for this simple, trusted content.
const sopContent = `
<h1>Standard Operating Procedures (SOP) - R&D Portal</h1>
<p>This document outlines the standard operating procedures for various administrative and faculty roles within the Parul University Goa Research & Development Portal.</p>
<h2>Table of Contents</h2>
<ol>
    <li><a href="#1-faculty-standard-user">Faculty (Standard User)</a></li>
    <li><a href="#2-evaluator">Evaluator</a></li>
    <li><a href="#3-chief-research-officer-cro">Chief Research Officer (CRO)</a></li>
    <li><a href="#4-principal">Principal</a></li>
    <li><a href="#5-head-of-department-hod">Head of Department (HOD)</a></li>
    <li><a href="#6-admin--super-admin">Admin & Super-admin</a></li>
</ol>
<hr>
<h2 id="1-faculty-standard-user">1. Faculty (Standard User)</h2>
<p>This is the base role for all teaching and research staff.</p>
<p><strong>Key Responsibilities:</strong></p>
<ul>
    <li>Submitting Intramural research project proposals (IMR).</li>
    <li>Registering interest in Extramural research funding calls (EMR).</li>
    <li>Applying for research-related incentives (e.g., for publications, patents).</li>
    <li>Maintaining a public researcher profile and managing publications.</li>
</ul>
<h3>Profile & Settings</h3>
<ol>
    <li><strong>First-Time Login (Profile Setup):</strong>
        <ul>
            <li>On your first login, you will be guided to the <strong>Profile Setup</strong> page. This is a critical step.</li>
            <li>You can pre-fill your academic details by entering your MIS ID and clicking "Fetch My Details". Review the information for accuracy.</li>
            <li>Upload a professional profile picture.</li>
            <li>Complete all required fields, including your Faculty, Institute, Department, and Designation.</li>
        </ul>
    </li>
    <li><strong>Settings Page:</strong>
        <ul>
            <li>Navigate to <strong>Settings</strong> from the sidebar at any time to update your profile.</li>
            <li><strong>Crucially, you must complete your salary bank account details</strong>. This information is required for any grant disbursal or incentive claim if your project is approved. The portal will not allow you to submit projects until this is complete.</li>
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
                    <li><strong>Project Details:</strong> Enter the title, abstract, and category. You can also align your project with UN Sustainable Development Goals (SDGs).</li>
                    <li><strong>Team Info:</strong> Add Co-PIs by searching for their MIS ID. They must be registered on the portal. List any student members involved. Upload a single ZIP file containing the CVs of all team members.</li>
                    <li><strong>File Uploads:</strong> Upload your main Project Proposal (PDF) and, if applicable, your Ethics Approval document (PDF).</li>
                    <li><strong>Timeline & Outcomes:</strong> Detail the project timeline and the expected outcomes or impact.</li>
                </ol>
            </li>
            <li>At any step, you can click <strong>Save as Draft</strong>. Drafts are accessible from the <strong>My Projects</strong> page to be completed later.</li>
            <li>On the final step, you must agree to the guidelines before the "Submit Project" button becomes active.</li>
        </ul>
    </li>
    <li><strong>Project Tracking ("My Projects" Page):</strong>
        <ul>
            <li>Go to the <strong>My Projects</strong> page to view a list of all IMR projects you are associated with (either as a Principal Investigator or a Co-PI).</li>
            <li>Monitor the status of your projects. The statuses mean:
                <ul>
                    <li><code>Draft</code>: You have saved the project but not yet submitted it. You can still edit it.</li>
                    <li><code>Submitted</code>: Your project has been submitted and is awaiting review scheduling.</li>
                    <li><code>Under Review</code>: An evaluation meeting has been scheduled. You will be notified of the date, time, and venue.</li>
                    <li><code>Revision Needed</code>: The evaluation committee has requested changes. Open the project details page to view comments and upload a revised proposal.</li>
                    <li><code>Recommended</code>: Your project has been approved for funding.</li>
                    <li><code>Not Recommended</code>: Your project was not approved for funding.</li>
                    <li><code>In Progress</code>: The project grant has been awarded and the project is active.</li>
                    <li><code>Pending Completion Approval</code>: You have submitted your final report, and it is awaiting admin approval.</li>
                    <li><code>Completed</code>: The project has been officially marked as completed.</li>
                </ul>
            </li>
        </ul>
    </li>
</ol>
<h3>EMR Workflow (Extramural Research)</h3>
<ol>
    <li><strong>Browse Opportunities:</strong>
        <ul>
            <li>Navigate to the <strong>EMR Calendar</strong>. This page lists all available external funding opportunities.</li>
            <li>Review the details of each call, including deadlines and attached documents.</li>
        </ul>
    </li>
    <li><strong>Register Interest:</strong>
        <ul>
            <li>For any "Open" call, click <strong>Register Interest</strong> before the deadline.</li>
            <li>You can add Co-PIs to your application at this stage.</li>
            <li>Once registered, your application will appear in the "My EMR Applications" section on the EMR Calendar page.</li>
        </ul>
    </li>
    <li><strong>Await Meeting Schedule:</strong>
        <ul>
            <li>After the interest registration period closes, an administrator will schedule presentation slots for all applicants.</li>
            <li>You will be notified via email and in-app notification with your specific date, time, and venue for the presentation.</li>
        </ul>
    </li>
    <li><strong>Upload Presentation:</strong>
        <ul>
            <li>Once a meeting is scheduled, you must upload your presentation (PPT/PPTX).</li>
            <li>The deadline for this is automatically set to <strong>2 days prior to your presentation date at 5:00 PM</strong>. This is a hard deadline.</li>
            <li>From your EMR application card on the calendar page, click "Upload PPT".</li>
        </ul>
    </li>
    <li><strong>Manage Uploads:</strong>
        <ul>
            <li>Before the deadline, you can view, replace, or remove your uploaded presentation using the "Manage PPT" button on your application card.</li>
        </ul>
    </li>
</ol>
<h3>Incentive Claim Workflow</h3>
<ol>
    <li><strong>Access Portal:</strong> Navigate to <strong>Incentive Claims</strong> from the sidebar.</li>
    <li><strong>Select Claim Type:</strong> Choose the category for which you are claiming an incentive (e.g., Research Papers, Patents, Books).</li>
    <li><strong>Fill the Form:</strong> Complete the detailed application form for your chosen category. You will be required to provide specific details and upload supporting documents (e.g., publication proofs, payment receipts).</li>
    <li><strong>Save or Submit:</strong>
        <ul>
            <li>You can <strong>Save as Draft</strong> at any point to save your progress.</li>
            <li>Once complete, click <strong>Submit Claim</strong>.</li>
        </ul>
    </li>
    <li><strong>Track Status:</strong>
        <ul>
            <li>Go to the <strong>My Claims</strong> tab on the Incentive Claims page to track the status of all your submissions.</li>
            <li>If another author on a paper you co-authored submits a claim, it will appear in the <strong>Co-Author Claims</strong> tab, allowing you to apply for your share of the incentive.</li>
        </ul>
    </li>
</ol>
<h3>Public Profile & Publications</h3>
<ul>
    <li>Your public profile page is accessible to administrators and assigned evaluators for review purposes.</li>
    <li>This page displays your academic details and a comprehensive list of your research papers.</li>
    <li>You are responsible for adding and maintaining your list of publications.</li>
    <li>When adding a paper, you can add co-authors by their university email. If they are registered, the system links them automatically. If not, the paper will link to their account when they sign up.</li>
</ul>
<hr>
<h2 id="2-evaluator">2. Evaluator</h2>
<p>This role is assigned to reviewers of IMR or EMR proposals.</p>
<h3>IMR Evaluation Workflow</h3>
<ol>
    <li><strong>Receive Assignment:</strong>
        <ul>
            <li>You will receive an email and in-app notification when you are assigned to an IMR evaluation committee for a scheduled meeting.</li>
        </ul>
    </li>
    <li><strong>Access Evaluation Queue:</strong>
        <ul>
            <li>Navigate to the <strong>IMR Evaluation Queue</strong>. This page lists all IMR projects that are scheduled for a meeting you are a part of and are awaiting your review.</li>
            <li><strong>Important:</strong> You can only submit your evaluation on the day of the scheduled meeting.</li>
        </ul>
    </li>
    <li><strong>Evaluate a Project:</strong>
        <ul>
            <li>On the meeting day, click on a project to go to its details page.</li>
            <li>Review the proposal and all submitted documents.</li>
            <li>An <strong>Evaluation Form</strong> will be visible on the page. Use the AI-assisted prompts to guide your comments.</li>
            <li>Select your recommendation (<code>Recommended</code>, <code>Not Recommended</code>, or <code>Revision Is Needed</code>) and submit your detailed comments.</li>
        </ul>
    </li>
    <li><strong>View Evaluation History:</strong>
        <ul>
            <li>The <strong>My IMR Evaluations</strong> page shows a complete record of all IMR projects you have previously reviewed.</li>
        </ul>
    </li>
</ol>
<h3>EMR Evaluation Workflow</h3>
<ol>
    <li><strong>Receive Assignment:</strong>
        <ul>
            <li>You will be notified when you are assigned to an EMR evaluation committee.</li>
        </ul>
    </li>
    <li><strong>Access EMR Queue:</strong>
        <ul>
            <li>Navigate to <strong>EMR Evaluations</strong>. This page lists all EMR presentation applications assigned to your committee.</li>
        </ul>
    </li>
    <li><strong>Evaluate a Presentation:</strong>
        <ul>
            <li>On the day of the scheduled EMR meeting, access this page.</li>
            <li>For each applicant, you can view their uploaded presentation (PPT).</li>
            <li>Click the "Evaluate" button to open a form where you can submit your recommendation and comments.</li>
        </ul>
    </li>
</ol>
<hr>
<h2 id="3-chief-research-officer-cro">3. Chief Research Officer (CRO)</h2>
<p>A faculty-level administrative role with oversight of all projects within their specific assigned faculty/faculties.</p>
<p><strong>Key Capabilities:</strong></p>
<ul>
    <li>View all projects and analytics for their assigned faculties.</li>
    <li>Can be assigned as an Evaluator for both IMR and EMR presentations.</li>
</ul>
<p><strong>Workflow:</strong></p>
<ol>
    <li><strong>Project Oversight:</strong>
        <ul>
            <li>Navigate to <strong>All Projects</strong>. The list will be automatically filtered to show projects from one of your assigned faculties.</li>
            <li>If you are assigned to multiple faculties, a dropdown filter will appear at the top of the page, allowing you to switch between them.</li>
            <li>Monitor the status and progress of research across your faculties.</li>
        </ul>
    </li>
    <li><strong>Analytics:</strong>
        <ul>
            <li>The <strong>Analytics</strong> dashboard provides a high-level view of research trends.</li>
            <li>For CROs, the data is automatically aggregated by <strong>Institute</strong>, showing which institutes within your selected faculty are most active.</li>
            <li>Use the faculty dropdown to view analytics for each of your assigned faculties.</li>
        </ul>
    </li>
    <li><strong>Evaluation Duties:</strong>
        <ul>
            <li>When assigned as an evaluator, follow the workflows outlined in the <a href="#2-evaluator">Evaluator</a> section for both IMR and EMR.</li>
        </ul>
    </li>
</ol>
<hr>
<h2 id="4-principal">4. Principal</h2>
<p>An institute-level administrative role with oversight of all activities within their specific institute.</p>
<p><strong>Key Capabilities:</strong></p>
<ul>
    <li>View all projects submitted from their institute.</li>
    <li>View detailed analytics for their institute.</li>
</ul>
<p><strong>Workflow:</strong></p>
<ol>
    <li><strong>First-time Login:</strong>
        <ul>
            <li>You will be prompted to complete a simplified profile setup, requiring only your <strong>Faculty</strong> and <strong>Institute</strong>. An MIS ID is not required for your role.</li>
        </ul>
    </li>
    <li><strong>Project Oversight:</strong>
        <ul>
            <li>Navigate to <strong>All Projects</strong>. The list is automatically filtered to show every project from your institute, regardless of your personal involvement. This is your primary tool for monitoring research activity.</li>
        </ul>
    </li>
    <li><strong>Analytics:</strong>
        <ul>
            <li>The <strong>Analytics</strong> dashboard is tailored for your role. Project data is aggregated by <strong>Department</strong>, allowing you to see which departments within your institute are leading in research submissions and funding.</li>
        </ul>
    </li>
</ol>
<hr>
<h2 id="5-head-of-department-hod">5. Head of Department (HOD)</h2>
<p>A department-level administrative role with oversight of all activities within their specific department.</p>
<p><strong>Key Capabilities:</strong></p>
<ul>
    <li>View all projects submitted from their department.</li>
    <li>View detailed analytics for their department.</li>
</ul>
<p><strong>Workflow:</strong></p>
<ol>
    <li><strong>Project Oversight:</strong>
        <ul>
            <li>Navigate to <strong>All Projects</strong>. The view is automatically filtered to show all projects from your specific department, giving you a complete overview of your department's research landscape.</li>
        </ul>
    </li>
    <li><strong>Analytics:</strong>
        <ul>
            <li>The <strong>Analytics</strong> dashboard provides data specifically for your department, allowing you to track submission trends and funding success.</li>
        </ul>
    </li>
</ol>
<hr>
<h2 id="6-admin--super-admin">6. Admin & Super-admin</h2>
<p>These roles have the highest level of access for managing the entire portal.</p>
<h3>IMR Management</h3>
<ol>
    <li><strong>Full Oversight:</strong>
        <ul>
            <li><strong>All Projects:</strong> View, search, and manage all projects across all faculties and institutes.</li>
            <li><strong>Pending Reviews:</strong> A dedicated page to see all projects currently <code>Under Review</code> or <code>Pending Completion Approval</code>.</li>
            <li><strong>Completed Reviews:</strong> A history of all projects that are no longer in an active review state.</li>
        </ul>
    </li>
    <li><strong>Meeting Scheduling:</strong>
        <ul>
            <li>Navigate to <strong>Schedule Meeting</strong>.</li>
            <li>Select one or more projects from the "Projects Awaiting Meeting" list.</li>
            <li>Set the meeting date and time.</li>
            <li>Assign a committee of evaluators from the user list.</li>
            <li>Clicking "Schedule" will update the project statuses to <code>Under Review</code> and automatically notify all selected PIs and evaluators via email and in-app notifications.</li>
        </ul>
    </li>
    <li><strong>Status Updates & Grant Management:</strong>
        <ul>
            <li>From any project's details page, you can manually update its status at any time. This is useful for making final decisions after a review meeting.</li>
            <li>If a project is <code>Recommended</code>, you can award a grant, set the sanction number, and manage disbursement in phases.</li>
        </ul>
    </li>
</ol>
<h3>EMR Management (Super-admin)</h3>
<ol>
    <li><strong>Manage Calls:</strong>
        <ul>
            <li>Navigate to the <strong>EMR Calendar</strong>.</li>
            <li>Click "Add New Call" to create a new funding opportunity. You can add a title, agency, description, deadlines, and attachments.</li>
            <li>You have the option to send an email announcement to all staff members when creating a new call.</li>
            <li>Existing calls can be edited or deleted.</li>
        </ul>
    </li>
    <li><strong>Manage Registrations:</strong>
        <ul>
            <li>Navigate to <strong>EMR Management</strong>.</li>
            <li>Select a call to view all users who have registered interest.</li>
            <li>You can delete a registration with remarks, which notifies the user.</li>
        </ul>
    </li>
    <li><strong>Schedule Meetings:</strong>
        <ul>
            <li>From the call management page, click <strong>Schedule Meeting</strong>.</li>
            <li>Select the applicants you wish to schedule for a presentation.</li>
            <li>Set a date, venue, and assign evaluators to the committee.</li>
            <li>This will schedule the meeting and notify all relevant parties.</li>
        </ul>
    </li>
    <li><strong>Review Evaluations:</strong>
        <ul>
            <li>From the <strong>EMR Evaluations</strong> page, you can view all feedback and recommendations submitted by the committee for each applicant and make a final decision on their status.</li>
        </ul>
    </li>
</ol>
<h3>System Administration</h3>
<ol>
    <li><strong>User Management:</strong>
        <ul>
            <li>Navigate to <strong>Manage Users</strong>.</li>
            <li>View all registered users, search, and filter by role.</li>
            <li>Assign roles (Faculty, Evaluator, CRO, Admin, Super-admin) to users.</li>
            <li>For CROs, you can assign them to one or more specific faculties.</li>
        </ul>
    </li>
    <li><strong>Bulk Data Management:</strong>
        <ul>
            <li><strong>Bulk Upload Projects</strong>: Import historical IMR project data from a formatted Excel file.</li>
            <li><strong>Bulk Upload Papers</strong>: Import historical research paper data from a formatted Excel file to populate user profiles.</li>
        </ul>
    </li>
    <li><strong>System Health:</strong>
        <ul>
            <li>The <strong>System Health</strong> dashboard allows you to monitor the connectivity and status of all integrated Firebase services (Firestore, Auth, Storage) in real-time.</li>
        </ul>
    </li>
    <li><strong>Module Management (Super-admin only):</strong>
        <ul>
            <li>The Super-admin has exclusive access to the <strong>Module Management</strong> page.</li>
            <li>This powerful feature allows you to dynamically grant or revoke access to any part of the portal (e.g., "Manage Users", "Analytics") for any user, providing fine-grained permission control beyond the default roles.</li>
        </ul>
    </li>
</ol>
`;

export function SopContent() {
    return (
        <div dangerouslySetInnerHTML={{ __html: sopContent.replace(/`/g, '') }} />
    );
}
