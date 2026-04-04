# Timer (Pomodoro)

The Timer page implements the Pomodoro Technique — 25 minutes of focused work followed by short breaks — to help you maintain concentration and avoid burnout.

---

## Accessing the Timer

Click **Timer** in the left sidebar (clock icon) or navigate to http://localhost:3001/timer.

---

## How the Pomodoro Technique Works

1. Pick a task to work on
2. Work for **25 minutes** (one Pomodoro) without interruptions
3. Take a **5-minute short break**
4. Every 4 Pomodoros, take a **15-minute long break**

---

## Timer Controls

| Button | Action |
|---|---|
| ▶ Start | Begin the countdown |
| ⏸ Pause | Pause the current session |
| ↺ Reset | Reset to the start of the current phase |
| Skip | Skip to the next phase (break → focus → break) |

<!-- SCREENSHOT: Timer page showing countdown ring, phase label, and control buttons -->

---

## Phases

The timer cycles through three phases:

| Phase | Default Duration | Description |
|---|---|---|
| 🎯 Focus | 25 min | Active work time |
| ☕ Short Break | 5 min | Quick rest between Pomodoros |
| 🛋 Long Break | 15 min | Extended rest every 4 Pomodoros |

---

## Configuring Durations

You can customize all three durations in **Settings** (gear icon in sidebar):
- Focus duration: 1–60 minutes
- Short break: 1–30 minutes
- Long break: 1–60 minutes

Your preferences are saved to your account and persist across sessions.

---

## Linking a Task

Before starting, select a task from the dropdown to link the session. Completed sessions are logged against that task for analytics.

You can also start a Pomodoro directly from any IN_PROGRESS card on the Board page — the task is pre-linked automatically.

---

## Session Log

Below the timer, the **Session Log** shows all your completed Pomodoro sessions for today, including:
- Linked task name
- Duration
- Completion time

<!-- SCREENSHOT: Timer page with session log showing completed sessions -->

---

## Stats & Streak

At the bottom of the Timer page (or in the Dashboard stats row):

| Stat | Description |
|---|---|
| Sessions Today | Number of focus sessions completed today |
| Focus Time | Total minutes of focused work today |
| Streak | Consecutive days with at least one completed Pomodoro session |

Your streak increases each day you complete at least one Pomodoro, and resets if you miss a day.
