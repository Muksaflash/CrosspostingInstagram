
# Instagram Automation Web App

This project automates Instagram crossposting using Next.js, Firebase (Firestore/Auth), and Cloud Run.

## Prerequisites

1.  **Node.js 18+**
2.  **Google Cloud Project** with Firestore and Cloud Run enabled.
3.  **Service Account Key** (JSON) with Firestore Admin roles.

## Local Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Copy `.env.local.example` to `.env.local` and fill in the values:
    - `AUTH_SECRET`: Generate with `openssl rand -hex 32`.
    - `AUTH_GOOGLE_ID` / `SECRET`: From Google Cloud Console -> APIs & Services -> Credentials (OAuth Client ID).
    - `GOOGLE_APPLICATION_CREDENTIALS`: Path to your service account JSON file (e.g., `./service-account.json`).
    - `OPENAI_API_KEY`, `RAPIDAPI_KEY`, `POSTMYPOST_TOKEN`: Your API keys.

3.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000).

## Deployment to Cloud Run

This project uses **Google Cloud Build** for CI/CD.

1.  **Connect Repo**: Connect this repository to Cloud Build in Google Cloud Console.
2.  **Trigger**: Set up a trigger on push to `main` branch.
3.  **Substitution Variables**: Ensuring `_PROJECT_ID` is handled automatically.

Alternatively, deploy manually:

```bash
gcloud run deploy instagram-automation --source . --region us-central1 --allow-unauthenticated
```
(Note: You need to set environment variables in Cloud Run console or via `--set-env-vars`).

## Tech Stack

- **Next.js 14+** (App Router)
- **Tailwind CSS**
- **NextAuth.js** (Google Auth)
- **Firebase Admin** (Firestore)
- **Docker** (Containerization)
