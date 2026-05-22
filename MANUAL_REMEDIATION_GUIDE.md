# Manual Remediation Guide: RDC-IMR Post-Patching

To fully secure the portal, the following manual steps must be executed by an administrator or infrastructure engineer.

## 1. Firestore: Assigning the First Super-Admin

Because the new security rules prevent users from assigning themselves roles, the first `Super-admin` must be created manually.

1.  Open the [Firebase Console](https://console.firebase.google.com/).
2.  Navigate to **Firestore Database** -> **Data**.
3.  Go to the `users` collection.
4.  Find your UID (or create an account first).
5.  Add/Update the field `role`: `Super-admin` (Case sensitive).

> [!CAUTION]
> Only assign this role to trusted root administrators. All other faculty should have the `faculty` role or no role (defaulting to restricted access).

---

## 2. Cloud Storage: Existing Public Files Cleanup

My code patches prevent **future** files from being made public. However, files uploaded before this patch are still marked as "Public" in Firebase/Google Drive.

### Firebase Storage Cleanup
1.  Navigate to **Storage** in the Firebase Console.
2.  Review folders: `/incentive-proofs/`, `/emr-presentations/`, `/invoices/`.
3.  If you have thousands of files, you can use the following snippet via the [Firebase CLI/Admin SDK Script]:
    ```javascript
    // Admin SDK Script to revert public access
    const [files] = await bucket.getFiles({ prefix: 'incentive-proofs/' });
    for (const file of files) {
      await file.makePrivate(); 
    }
    ```

### Google Drive Cleanup
1.  Access the Google Drive service account or shared drive.
2.  Check the "Proposals" or "Uploads" folders.
3.  Ensure "Anyone with the link can view" is disabled for these folders.

---

## 3. Secret Management Migration

Your `.env` file currently contains production secrets. If this code is pushed to a shared repository, these secrets are compromised.

### Action Plan:
1.  **Vercel / Hosting Provider**: Go to **Environment Variables**.
2.  Add the following as **Secret** types:
    *   `FIREBASE_PRIVATE_KEY`
    *   `GMAIL_APP_PASSWORD`
    *   `PERSONAL_STORAGE_API_TOKEN`
3.  **Delete** these values from your local `.env` and `.env.local` files once migrated.
4.  **Rotate Keys**: Since these were previously stored in plain text, go to the [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts) and **Generate a NEW private key** for your service account, then delete the old one.

---

## 4. CORS Whitelisting

I have restricted the API CORS policy to `https://rndprojects.paruluniversity.ac.in/`. If you use multiple domains (e.g., staging, dev), please set the `ALLOWED_ORIGINS` environment variable:

*   **Variable**: `ALLOWED_ORIGINS`
*   **Value**: `https://rndprojects.paruluniversity.ac.in,http://localhost:9002` (comma-separated).

---

## 5. Staff Data Maintenance

The new **24-hour cache** ensures performance under load. 
*   If you update `staffdata.xlsx` or `goastaffdata.xlsx` and need the changes to reflect **immediately**, you must **Redeploy** the application to clear the in-memory cache, or wait for the 24-hour expiration.
