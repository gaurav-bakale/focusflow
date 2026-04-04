# Calendar

The Calendar page gives you a visual weekly time-blocking view so you can plan exactly when you will work on each task.

---

## Accessing the Calendar

Click **Calendar** in the left sidebar (calendar icon) or navigate to http://localhost:3001/calendar.

---

## Weekly View

The calendar shows a full 7-day week grid with hourly time slots. Each block you create appears as a colored rectangle on the grid.

<!-- SCREENSHOT: Calendar weekly view with several colored time blocks -->

---

## Creating a Time Block Manually

**Method 1 — Click and drag on the grid:**
1. Click on a time slot on any day
2. Drag down to set the duration
3. A **Block Modal** opens — fill in the details

**Method 2 — Click "New Task Block" in the sidebar:**
1. Click **+ New Task Block**
2. Fill in the modal

### Block Modal Fields

| Field | Description |
|---|---|
| Title | Label shown on the calendar block |
| Start Time | Date + time the block begins |
| End Time | Must be after start time (validated in real-time) |
| Link Task | Optionally link to an existing task |
| Color | Hex color picker for visual organization |
| Recurrence | NONE / DAILY / WEEKDAYS / WEEKLY / MONTHLY |

<!-- SCREENSHOT: Block modal with all fields visible -->

---

## Editing a Block

Click any existing block on the calendar to open its edit modal. You can update any field, including changing a single occurrence vs. the entire recurring series.

---

## Deleting a Block

In the edit modal, click **Delete**. For recurring blocks, you choose:
- **This event only** — deletes just this occurrence
- **All events in series** — deletes the entire recurring series

---

## Import Tasks

The **Import Tasks** feature lets you schedule your TODO tasks directly into the calendar with zero double-booking.

**How to use it:**
1. Click **Import Tasks** in the sidebar
2. A panel appears listing all your TODO tasks with their priority dots
3. Check the tasks you want to schedule
4. Click **Schedule N Tasks**
5. FocusFlow automatically:
   - Finds free slots starting from the current time
   - Uses each task's `estimated_minutes` (or your Pomodoro focus duration as default)
   - Skips any time already occupied by existing blocks
   - Color-codes blocks by priority: 🔴 HIGH, 🔵 MEDIUM, 🟢 LOW
   - If a task doesn't fit today, it rolls over to the next available day

<!-- SCREENSHOT: Import Tasks panel showing task checkboxes with priority dots -->
<!-- SCREENSHOT: Calendar after import showing new colored blocks scheduled in free slots -->

---

## Recurring Blocks

When creating a block, set a **Recurrence** pattern:
- **DAILY** — repeats every day
- **WEEKDAYS** — repeats Mon–Fri only
- **WEEKLY** — repeats on the same day each week
- **MONTHLY** — repeats on the same date each month

All occurrences in a series share a `recurrence_group_id` so edits/deletes can be scoped correctly.
