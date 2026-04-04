# Settings

The Settings page lets you configure your FocusFlow experience — AI keys, Pomodoro durations, theme, and account preferences.

---

## Accessing Settings

Click the **gear icon** (⚙️) at the bottom of the left sidebar or navigate to http://localhost:3001/settings.

---

## AI Configuration

FocusFlow's AI features work with either Google Gemini or OpenAI.

**Adding your API key:**
1. Go to **Settings → AI Configuration**
2. Paste your **Gemini API key** (get one free at https://aistudio.google.com/app/apikey) or your **OpenAI API key**
3. Click **Save**

Your key is stored securely in your account and used only for your AI requests. The app-level key (if configured by the admin in `.env`) is used as a fallback.

<!-- SCREENSHOT: Settings page showing AI key input field -->

---

## Pomodoro Durations

Customize the three timer phases to match your work style:

| Setting | Default | Range |
|---|---|---|
| Focus Duration | 25 min | 1–60 min |
| Short Break | 5 min | 1–30 min |
| Long Break | 15 min | 1–60 min |

Changes apply immediately to the Timer page.

---

## Theme

Toggle between **Light** and **Dark** mode using the moon/sun icon in the sidebar header (or in Settings). Your preference is saved to your account.

<!-- SCREENSHOT: Settings page showing Pomodoro duration sliders and theme toggle -->

---

## Account

- View your account name and email
- Change your password (must meet the password requirements: 8+ chars, uppercase, number, special character)
- Delete your account (irreversible — removes all tasks, sessions, and calendar blocks)
