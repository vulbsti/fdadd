# Aidoraa Fashion

Aidoraa is a sophisticated AI-powered fashion assistance application designed to provide personalized styling advice, date planning, and help users discover their unique fashion aesthetic. Built with Next.js, with model calls via OpenRouter (OpenAI-compatible chat completions) and Opencode as the dev-time agent CLI.

## Features

*   **FashionDaddy:** An AI stylist chatbot for outfit suggestions, fashion advice, and more.
*   **DatePlanner:** AI assistance for planning outfits, locations, and activities for dates based on user input.
*   **Aesthetic Quiz:** An interactive quiz to help users discover their personal fashion style and preferences.
*   **Blog:** Fashion-related articles and tips.
*   **User Authentication:** Secure login/signup functionality (currently simulated).

## Tech Stack

*   **Framework:** Next.js 15 (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS, ShadCN UI
*   **AI Model Provider:** OpenRouter (OpenAI-compatible chat completions; see `src/lib/ai/openrouter.ts`)
*   **UI Components:** ShadCN UI, Lucide React Icons
*   **Deployment:** Vercel (recommended)

## Getting Started (Local Development)

Follow these instructions to set up and run the project on your local machine.

### Prerequisites

*   **Node.js:** Version 22.x (as specified in `package.json`). You can use [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions.
*   **npm:** Should be installed with Node.js.
*   **Git:** To clone the repository.
*   **OpenRouter API Key:** You need an API key for the models used by the app. Get one from [OpenRouter](https://openrouter.ai/keys).

### Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-folder-name>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Copy `.env.example` to `.env.local` and populate the services you want to
    enable. `OPENROUTER_API_KEY` (+ `OPENROUTER_MODEL`) powers AI features; Supabase and Razorpay
    variables enable authentication and payments. See
    `docs/supabase-razorpay-setup.md` for the provider-side configuration.

### Running the Application

1.  **Start the Next.js development server:**
    ```bash
    npm run dev
    ```
    This command starts the Next.js application with Turbopack enabled on port 9002 (as configured in `package.json`).

2.  **Access the application:**
    Open your browser and navigate to [http://localhost:9002](http://localhost:9002).

### Dev-time agent CLI (Opencode)

Opencode is a local dev CLI pinned to the same OpenRouter model string (`opencode.json`):

```bash
opencode run "help me debug the astrologer chat route"
```

## Building for Production

To create an optimized production build:

```bash
npm run build
```

To run the production build locally (requires building first):

```bash
npm run start
```

## Deployment (Vercel)

Vercel is the recommended platform for deploying this Next.js application.

### Prerequisites

*   **Vercel Account:** Sign up at [vercel.com](https://vercel.com/).
*   **GitHub/GitLab/Bitbucket Account:** Your project code should be hosted on one of these platforms.

### Steps

1.  **Push your code:** Ensure your latest code, including the `package.json` specifying Node.js 22, is pushed to your Git repository.

2.  **Import Project on Vercel:**
    *   Go to your Vercel Dashboard.
    *   Click "Add New..." > "Project".
    *   Import the Git repository containing your project.

3.  **Configure Project:**
    *   **Framework Preset:** Vercel should automatically detect Next.js.
    *   **Build & Development Settings:** The repository pins Node.js 22 and the GitHub Actions workflow runs the Vercel build and production deploy.
    *   **Environment Variables:**
        *   Navigate to your project's "Settings" tab, then "Environment Variables".
        *   Add `OPENROUTER_API_KEY` (and `OPENROUTER_MODEL`, e.g. `anthropic/claude-sonnet-4`) with your actual values. Ensure they're available for all environments (Production, Preview, Development).

4.  **Deploy:**
    *   Click the "Deploy" button. Vercel will build and deploy your application.
    *   Subsequent pushes to your connected Git branch (e.g., `main` or `master`) will automatically trigger new deployments.

## Other Scripts

*   **Linting:** `npm run lint` - Runs the Next.js linter.
*   **Type Checking:** `npm run typecheck` - Checks TypeScript types.
