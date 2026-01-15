
# Research & Development Portal Parul University Goa

This is a comprehensive, full-stack web application designed to streamline and manage the entire research lifecycle at Parul University Goa. It serves as a central hub for faculty, evaluators, and administrators to handle Intramural (IMR) and Extramural (EMR) research projects, user management, and grant tracking.

The portal is built with a modern tech stack, leveraging the power of Next.js for the frontend and backend, Firebase for its powerful suite of backend services, and Google's Genkit for integrating cutting-edge AI features.

## ✨ Key Features

### 1. Role-Based Access Control (RBAC)
The portal provides a tailored experience for each user role, ensuring users only see what's relevant to them.
-   **Faculty:** The primary users of the portal. They can submit and track their own research projects, manage their public profile including a list of their publications, and register for external funding calls.
-   **Evaluators:** Assigned to review project proposals. They have access to a dedicated queue of projects assigned for review, can use AI-assisted tools for scoring, and submit structured feedback.
-   **CRO (Chief Research Officer):** Have oversight of all projects within their specific faculty. They can manage user roles, schedule meetings, and access faculty-specific analytics.
-   **Admin:** Have broad oversight of the entire system, including user management, project status updates, and system monitoring.
-   **Super-admin:** Has complete control over the entire system, including all admin privileges plus the ability to dynamically manage module access for all other users.

### 2. Intramural Research (IMR) Project Management
A complete workflow for managing internal research project funding from submission to completion.
-   **Guided Proposal Submission:** A multi-step form for submitting detailed project proposals, including team information, abstracts, and necessary file uploads (proposal PDF, team CVs, ethics approvals).
-   **Status Tracking:** Real-time tracking of project status (Draft, Submitted, Under Review, Recommended, Not Recommended, In Progress, Completed, etc.).
-   **AI-Assisted Evaluation:** AI-generated prompts to help evaluators assess projects based on key criteria like relevance, methodology, feasibility, and innovation.
-   **Meeting Scheduling:** Admins and CROs can schedule IMR evaluation meetings for multiple submitted projects at once and automatically notify the Principal Investigators (PIs) via email.
-   **Grant Management:** A system for awarding grants, tracking fund utilization through transaction logging, and managing the disbursement process in phases.

### 3. Extramural Research (EMR) Management
A dedicated module to manage the lifecycle of externally funded research opportunities.
-   **EMR Calendar:** A central calendar listing all available external funding calls, complete with deadlines and details.
-   **Interest Registration:** Faculty can register their interest in a call and add Co-PIs to their team directly through the portal.
-   **Presentation Workflow:** A streamlined process for scheduling presentation slots, assigning evaluators, and allowing faculty to upload their presentation files before a hard deadline.
-   **Admin Oversight:** Super-admins can manage the entire EMR lifecycle, from adding new funding calls to tracking evaluation outcomes.

### 4. User Profiles & Publication Tracking
-   **Public Profiles:** Faculty can maintain a public-facing profile showcasing their research contributions, projects, and a comprehensive list of their publications. This profile is viewable by administrators and assigned evaluators.
-   **Publication Management:** A dedicated system for faculty to add, edit, and delete their research papers. The system intelligently handles co-authors, ensuring a single paper entry appears on the profiles of all its authors to reduce data redundancy.
-   **Automated Co-Author Linking:** When adding a paper, the system automatically checks for existing users or staff members by their university email, linking profiles and fetching names to streamline the process.

### 5. AI Integration (Powered by Google Genkit)
-   **Project Summarization:** Instantly generate concise summaries of complex project proposals to aid in quick reviews.
-   **Research Domain Suggestion:** AI analyzes a faculty member's publication history to suggest their core research domain for their public profile.
-   **Journal Website Finder:** An AI tool to find the official website of an academic journal based on its name, helping to verify publication sources.

### 6. System Administration
-   **User Management:** Admins can manage user roles and permissions, including assigning CROs to specific faculties.
-   **Module Management:** A Super-admin exclusive feature to dynamically assign access to different parts of the portal for each user.
-   **System Health Dashboard:** A dedicated page to monitor the connectivity and status of all integrated Firebase services (Firestore, Auth, Storage) in real-time.
-   **Bulk Data Upload:** Admins can upload historical project data from a formatted Excel file to integrate past records into the system.

## 🛠️ Tech Stack

-   **Framework:** [Next.js](https://nextjs.org/) (App Router)
-   **Language:** [TypeScript](https://www.typescriptlang.org/)
-   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
-   **UI Components:** [ShadCN UI](https://ui.shadcn.com/)
-   **AI Toolkit:** [Google Genkit](https://firebase.google.com/docs/genkit)
-   **Database:** [Cloud Firestore](https://firebase.google.com/docs/firestore)
-   **Authentication:** [Firebase Authentication](https://firebase.google.com/docs/auth) with Google One Tap
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
FIREBASE_AUTH_DOMAIN="[AUTH_DOMAIN]"
FIREBASE_PROJECT_ID="[PROJECT_ID]"
FIREBASE_STORAGE_BUCKET="[STORAGE_BUCKET]"
FIREBASE_MESSAGING_SENDER_ID="[MESSAGING_SENDER_ID]"
FIREBASE_APP_ID="[APP_ID]"
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

#### Google Sign-In (Client-Side)
- Go to the [Google Cloud Console Credentials page](https://console.cloud.google.com/apis/credentials).
- Find your "OAuth 2.0 Client ID" for your web application.
- Copy the **Client ID**.

```env
# .env.local
NEXT_PUBLIC_GOOGLE_CLIENT_ID="[YOUR_GOOGLE_OAUTH_CLIENT_ID]"
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

#### Optional API Keys
-   These are needed for fetching data from external academic sources. The application will function without them, but some features will be disabled.

```env
# .env.local
SCOPUS_API_KEY=""
WOS_API_KEY=""
SPRINGER_API_KEY=""
```

### 4. Run the Development Server

Once your `.env.local` file is configured, you can start the development server.

```bash
npm run dev
```

The application should now be running at [http://localhost:9002](http://localhost:9002).

## 🚑 Troubleshooting

### Google Sign-In Error: `401: invalid_client`

This is a common configuration error. It almost always means your Google OAuth Client ID is not correctly configured for the address you are running the app from.

1.  **Go to the Google Cloud Console Credentials page:** [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials).
2.  **Select your Project** from the dropdown at the top of the page.
3.  Find your OAuth 2.0 Client ID under the "OAuth 2.0 Client IDs" section and click on its name to edit it.
4.  **Add Authorized JavaScript Origins:** Under the "Authorized JavaScript origins" section, click **"+ ADD URI"**.
    -   For local development, add `http://localhost:9002`.
    -   If you are using a different port, add `http://localhost:<YOUR_PORT>`.
    -   For your deployed production site, add its full URL (e.g., `https://your-app-name.web.app`).
5.  **Click Save**. It may take a few minutes for the changes to apply.
6.  **Restart your local development server** after making these changes.

## 📁 Project Structure

-   `src/app/`: Next.js App Router pages, layouts, and route handlers.
-   `src/components/`: Reusable React components, organized by feature (e.g., `projects`, `emr`) and UI primitives from ShadCN UI (`ui`).
-   `src/lib/`: Core logic, including Firebase configuration (`config.ts`, `admin.ts`), security modules (`modules.ts`), and utility functions.
-   `src/ai/`: Contains all Genkit flows for AI-powered features.
-   `public/`: Static assets like images and logos.
-   `firestore.rules`: Security rules for the Firestore database.
-   `apphosting.yaml`: Configuration for deployment to Firebase App Hosting.
-   `goastaffdata.xlsx`: These files in the root directory contain historical user and academic data used to pre-fill profiles.

## ☁️ Deployment

This project is configured for one-click deployment to **Firebase App Hosting**. Simply connect your GitHub repository to your Firebase project, and it will build and deploy automatically. The `apphosting.yaml` file controls the build and runtime settings.
