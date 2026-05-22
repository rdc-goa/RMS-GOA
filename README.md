# R&D Portal: A Comprehensive Research Management System

This is a comprehensive, full-stack web application designed to streamline and manage the entire research lifecycle at any university. It serves as a central hub for faculty, evaluators, and administrators to handle Intramural (IMR) and Extramural (EMR) research projects, user management, incentive claims, and grant tracking.

Built with a modern, robust tech stack, the portal leverages the power of Next.js for a performant frontend and backend, Firebase for its powerful and scalable suite of services (Firestore, Authentication, Storage), and Google's Genkit for integrating cutting-edge AI features.

## ✨ Key Features

### 1. Role-Based Access Control (RBAC) & User Management
The portal provides a tailored experience for each user role, ensuring a secure and relevant interface.

-   **Faculty:** The primary users of the portal. They can submit and track their own research projects, manage a public-facing profile including a comprehensive list of their publications, and register for external funding calls announced by the university.
-   **Evaluators:** Assigned to review project proposals based on their expertise. They have access to a dedicated queue of projects, can use AI-assisted tools for scoring and feedback, and view their evaluation history.
-   **CRO (Chief Research Officer):** Have oversight of all projects within their specific assigned faculties. They can manage user roles, schedule IMR meetings, and access faculty-specific analytics to monitor research trends.
-   **Principal & HOD:** Institute and Department-level administrators with read-only oversight of all projects and analytics within their specific scope, enabling them to track research activity effectively.
-   **Admin & Super-admin:** Have broad oversight of the entire system, including user management, project status updates, and system health monitoring. Super-admins have ultimate control, including dynamically managing module access for all other users.

### 2. Intramural Research (IMR) Project Workflow
A complete, end-to-end workflow for managing internal research project funding from submission to completion.

-   **Guided Proposal Submission:** A multi-step form guides faculty through submitting detailed project proposals, including team information (with CV uploads for each member), abstracts, SDG alignment, and all necessary supporting documents. Drafts can be saved at any point.
-   **Automated Meeting Scheduling:** Admins and CROs can schedule IMR evaluation meetings for multiple projects at once. The system automatically notifies all Principal Investigators and the assigned evaluation committee via email and in-app notifications.
-   **AI-Assisted Evaluation:** Evaluators are provided with AI-generated prompts to help them assess projects based on key criteria like relevance, methodology, feasibility, and innovation, ensuring a structured and consistent review process.
-   **Status Tracking & Revisions:** PIs can track their project's status in real-time (e.g., `Submitted`, `Under Review`, `Revision Needed`, `Recommended`). If revisions are requested, PIs can view comments and upload a revised proposal directly through the portal.
-   **Comprehensive Grant Management:** For recommended projects, administrators can award grants, set sanction numbers, and manage the disbursement process in multiple phases. A detailed transaction log allows PIs to manage their budget and administrators to track fund utilization.

### 3. Extramural Research (EMR) Management Workflow
A dedicated module to manage the entire lifecycle of externally funded research opportunities.

-   **EMR Calendar & Announcements:** A central calendar lists all available external funding calls, complete with deadlines and details. Super-admins can create new calls and trigger an email announcement to all staff members.
-   **Streamlined Interest Registration:** Faculty can register their interest in a call and add Co-PIs to their team directly through the portal before the deadline.
-   **Organized Presentation Workflow:** Administrators can schedule presentation slots for all registered applicants, assign an evaluation committee, and set a hard deadline for presentation uploads (typically 2 days prior to the meeting).
-   **Centralized Evaluation:** Evaluators can access their queue, view applicant presentations, and submit their feedback through a structured form. Super-admins can then review all evaluations and make a final decision on the application's status.

### 4. Digital Incentive Claim Workflow
A fully digital process for submitting, tracking, and approving research incentives, eliminating paperwork and increasing transparency.

-   **Multi-Category Claims:** Faculty can apply for incentives for a wide range of academic achievements, including Research Papers, Patents, Books & Book Chapters, Conference Presentations, Professional Memberships, and Article Processing Charges (APC).
-   **Automated Incentive Calculation:** The system automatically calculates the tentative incentive amount based on the university's predefined policy, considering factors like author roles, publication quality (e.g., Q-rating), publisher type, and number of co-authors.
-   **Configurable Multi-Stage Approval:** Claims are routed through a configurable multi-stage approval workflow, ensuring proper verification at each level (e.g., HOD, CRO, RDC Head). Approvers can view all relevant details and previous approval history before making a decision.
-   **Intelligent Co-Author Management:** The system intelligently handles claims for publications with multiple internal authors. When one author submits a claim, the system notifies all other PU co-authors, who can then apply for their respective share from their own dashboard.

### 5. AI Integration (Powered by Google Genkit)
The portal is enhanced with several AI-powered features to assist users and streamline administrative tasks.
-   **Project Summarization:** Instantly generate concise summaries of complex project proposals to aid evaluators and administrators in quick reviews.
-   **Research Domain Suggestion:** AI analyzes a faculty member's publication history to suggest their core research domain, helping them build a strong public profile.
-   **Journal Website Finder:** An AI tool to find the official website of an academic journal based on its name, helping to verify publication sources and details for incentive claims.

### 6. System Administration & Health
-   **Dynamic Module Management:** A Super-admin exclusive feature to dynamically assign access to any part of the portal (e.g., "Manage Users", "Analytics") for any user, providing fine-grained permission control beyond the default roles.
-   **System Health Dashboard:** A dedicated page to monitor the connectivity and status of all integrated Firebase services (Firestore, Auth, Storage) in real-time, ensuring system stability.
-   **Bulk Data Upload:** Admins can upload historical project, incentive, and publication data from formatted Excel files to integrate past records into the system seamlessly.

## 🛠️ Tech Stack

-   **Framework:** [Next.js](https://nextjs.org/) (App Router)
-   **Language:** [TypeScript](https://www.typescriptlang.org/)
-   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
-   **UI Components:** [ShadCN UI](https://ui.shadcn.com/)
-   **AI Toolkit:** [Google Genkit](https://firebase.google.com/docs/genkit)
-   **Database:** [Cloud Firestore](https://firebase.google.com/docs/firestore)
-   **Authentication:** [Firebase Authentication](https://firebase.google.com/docs/auth)
-   **File Storage:** [Cloud Storage for Firebase](https://firebase.google.com/docs/storage)
-   **Deployment:** [Firebase App Hosting](https://firebase.google.com/docs/hosting)
-   **Email Service:** [Nodemailer](https://nodemailer.com/) with Gmail

## 🚀 Getting Started

Follow these instructions to get the project up and running on your local machine for development and testing purposes.

### Prerequisites

-   [Node.js](https://nodejs.org/) (v20 or later)
-   `npm` (comes with Node.js)
-   A [Firebase](https://firebase.google.com/) project.

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd <repository-name>
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

This is the most critical step. The application will not run without the correct environment variables.

1.  Create a new file named `.env.local` in the root of the project.
2.  Copy the contents of the `.env` file into your new `.env.local` file.
3.  Fill in the values for each variable as described below.

#### Firebase Client-Side Keys
-   Go to your **Firebase Console** -> **Project Settings** (gear icon) -> **General**.
-   Under "Your apps", find your web app and copy the `firebaseConfig` object values.

```env
# .env.local
NEXT_PUBLIC_FIREBASE_API_KEY="[API_KEY]"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="[AUTH_DOMAIN]"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="[PROJECT_ID]"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="[STORAGE_BUCKET]"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="[MESSAGING_SENDER_ID]"
NEXT_PUBLIC_FIREBASE_APP_ID="[APP_ID]"
```

#### Firebase Admin (Server-Side) Keys
-   Go to your **Firebase Console** -> **Project Settings** -> **Service accounts**.
-   Click **"Generate new private key"**. A JSON file will be downloaded.
-   Open the JSON file and copy the corresponding values.

```env
# .env.local
FIREBASE_CLIENT_EMAIL="[client_email_from_json]"
FIREBASE_PRIVATE_KEY="[private_key_from_json]"
```

#### Email Service (Nodemailer)
-   You'll need a Gmail account and an "App Password".
-   Go to your **Google Account** -> **Security** -> **2-Step Verification** (must be enabled).
-   Go to **App passwords**, create a new password for this app, and copy the 16-character password.

```env
# .env.local
GMAIL_USER="your-gmail-address@gmail.com"
GMAIL_APP_PASSWORD="your-16-character-app-password"
```

### 4. Run the Development Server

Once your `.env.local` file is configured, you can start the development server.

```bash
npm run dev
```

The application should now be running at [http://localhost:9002](http://localhost:9002).

## 📖 Supporting Documentation

For more detailed information, please refer to the following documents:

-   **[Standard Operating Procedures (SOP)](./SOP.md):** Detailed step-by-step guides for all user roles.
-   **[Incentive Policy](./INCENTIVE_POLICY.md):** The complete rules and calculation logic for all research incentives.
-   **[Terms of Use](./TERMS_OF_USE.md):** The terms and conditions for using the portal.
-   **[Privacy Policy](./src/PRIVACY_POLICY.md):** Our policy on data collection, use, and security.

## 📁 Project Structure

-   `src/app/`: Next.js App Router pages, layouts, and route handlers.
-   `src/components/`: Reusable React components, organized by feature.
-   `src/lib/`: Core logic, including Firebase configuration and utility functions.
-   `src/ai/`: Contains all Genkit flows for AI-powered features.
-   `public/`: Static assets like images and logos.
-   `docs/`: Contains backend.json for datastructure details.
-   `firestore.rules`: Security rules for the Firestore database.
-   `apphosting.yaml`: Configuration for deployment to Firebase App Hosting.
-   `staffdata.xlsx`: This file in the root directory contains historical user and academic data used to pre-fill profiles.

## ☁️ Deployment

This project is configured for one-click deployment to **Firebase App Hosting**. Simply connect your GitHub repository to your Firebase project, and it will build and deploy automatically. The `apphosting.yaml` file controls the build and runtime settings.
