# Grinder

Windows productivity tracker with a session timer, activity monitoring, AI-powered analytics (DeepSeek), gamification (XP, achievements, streaks), and social features (friends, leaderboard).

## Tech Stack

- **Electron** + **React** + **TypeScript**
- **Tailwind CSS** + **Framer Motion**
- **SQLite** (local sessions/activities) via `better-sqlite3`
- **Supabase** (auth, friends, leaderboard) — optional
- **DeepSeek API** (session analysis) — optional

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set:

   - `DEEPSEEK_API_KEY` — for AI session analysis in Stats (optional; leave empty to skip).
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY` — for sign-in and Friends (optional).
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — same Supabase values for the renderer (required only if using Friends).

3. **Supabase (optional)**

   - Create a project at [supabase.com](https://supabase.com).
   - In the SQL editor, run the script in `supabase/schema.sql`.
   - Enable Realtime for the `profiles` table if you want live friend activity updates.

4. **Run in development**

   ```bash
   npm run electron:dev
   ```

   This compiles the main/preload processes, starts the Vite dev server, and launches Electron. The app loads from `http://localhost:5173`.

   **Live reload:** While the dev server is running, any change you make in the project folder (save a file) is reflected immediately in the Electron window and in the browser at `http://localhost:5173`. No need to restart or push — just save and see the update.

   **Browser only:** To work only in the browser (no Electron), run `npm run dev` and open `http://localhost:5173`. Same live reload on save.

5. **Build for production**

   ```bash
   npm run build
   npm run electron:build
   ```

   Output is in the `release/` folder.

## Usage

- **Home**: Start the timer (green **START**). Your current active window is shown. Use **PAUSE** / **RESUME** and **STOP** to end the session. You’ll see a completion message and any new achievements.
- **Stats**: View session history, open a session for a time-by-app chart and category pie chart, and run **DeepSeek** analysis (requires `DEEPSEEK_API_KEY`). Level and XP bar plus achievements are at the top.
- **Friends**: Sign in with Supabase to add friends by username, see who’s online and their current activity, open a friend’s profile (level, XP, achievements, recent session summaries only), and view the leaderboard.

## Data

- Sessions and activity segments are stored locally in SQLite (in your user data directory).
- If you use Supabase, your profile (level, XP, streak) is synced for the Friends tab and leaderboard. Session summaries (duration only) can be synced for the leaderboard; the app currently uses local data for Stats.

## License

MIT
