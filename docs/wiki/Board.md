# Board (Kanban)

The Board page is your task management hub — a full Kanban board with drag-and-drop, AI scheduling, and Pomodoro integration.

---

## Accessing the Board

Click **Board** in the left sidebar or navigate to http://localhost:3001/tasks.

---

## Kanban Columns

The board has three columns:

| Column | Meaning |
|---|---|
| **TODO** | Tasks not yet started |
| **IN PROGRESS** | Tasks actively being worked on |
| **DONE** | Completed tasks |

---

## Creating a Task

1. Click the **+ Add Task** button at the top of any column (or the global **+ New Task** button)
2. Fill in:
   - **Title** (required)
   - **Description** (optional)
   - **Priority** — LOW / MEDIUM / HIGH
   - **Deadline** (optional date/time)
   - **Category** (optional — AI can suggest one based on the title)
   - **Estimated Minutes** (used by AI scheduling; default is 2 Pomodoro cycles)
   - **Subtasks** (optional inline checklist)
3. Click **Create**

<!-- SCREENSHOT: Task creation modal with all fields -->

---

## Moving Tasks

**Drag and drop** any task card to a different column. The task's status updates automatically.

---

## Task Cards

Each card shows:
- Title, priority dot, category badge
- Deadline (highlighted red if overdue)
- Subtask progress (e.g., `2/4 subtasks`)
- **IN_PROGRESS cards** show a persistent 🍅 **Pomodoro button**

### Starting a Pomodoro from a Card

Click the **🍅** button on any IN_PROGRESS card to instantly start a Pomodoro focus session linked to that task. The timer starts counting down immediately.

<!-- SCREENSHOT: IN_PROGRESS card with the 🍅 Pomodoro button highlighted -->

---

## AI Schedule

The **AI Schedule** banner sits above the Kanban grid.

**How to use it:**
1. Click **✨ AI Schedule My Day**
2. The AI analyzes your TODO and IN_PROGRESS tasks and suggests an ordered schedule
3. A collapsible banner shows the recommended task order with estimated durations
4. Click **Add to Calendar** to auto-schedule all tasks into your calendar:
   - Starts from the next 30-minute boundary from now
   - Uses `estimated_minutes` per task (default: 2 × your Pomodoro focus duration)
   - Inserts a **30-min Rest / Free** block between each task
   - If tasks don't fit today, they roll over to the next available day (up to 7 days ahead)
   - No double-booking — uses existing calendar blocks to find free slots

<!-- SCREENSHOT: AI Schedule banner showing task list with durations and Add to Calendar button -->

---

## Editing & Deleting Tasks

- Click the **pencil icon** on a card to open the edit modal
- Click the **trash icon** to delete (with confirmation prompt)
- In the edit modal, you can also manage subtasks, change status, update deadline, etc.

---

## AI Task Breakdown

On any task card, click **🤖 AI Breakdown** to get AI-generated subtasks for that task. The subtasks appear inline and can be added to the task.
