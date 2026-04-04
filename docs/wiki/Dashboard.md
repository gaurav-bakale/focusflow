# Dashboard

The Dashboard is your daily productivity command center. It gives you an at-a-glance view of your workload, AI recommendations, and progress stats.

---

## Accessing the Dashboard

Click **Dashboard** in the left sidebar (house icon) or navigate to http://localhost:3001/dashboard.

---

## Sections

### AI Task Planner (Main Column)

The AI Task Planner helps you turn a vague goal into 5 actionable tasks.

**How to use it:**
1. Type your goal in the text box (e.g., *"I want to build a portfolio website"*)
2. Click **Generate Tasks**
3. The AI returns exactly 5 tasks with titles, descriptions, priorities, and categories
4. You have three choices:
   - **Add to Board** — all 5 tasks are created directly in your TODO column
   - **Suggest Changes** — type feedback (e.g., *"make them more specific"*) and click **Revise Tasks**
   - **Discard** — clears the suggestions with no changes

<!-- SCREENSHOT: AI Task Planner showing goal input and 5 suggested tasks with action buttons -->

---

### Eat That Frog

Based on Brian Tracy's productivity principle — tackle the hardest, most impactful task first.

- The AI analyzes your TODO/IN_PROGRESS tasks and identifies the single most important one
- Displays the task name, priority badge, deadline (if set), and the AI's reasoning
- Click **Start Now →** to immediately move the task to IN_PROGRESS and begin

> If you have no tasks, an empty state with a 🐸 emoji prompts you to add tasks first.

<!-- SCREENSHOT: Eat That Frog card showing a high-priority task with Start Now button -->

---

### By Priority

Shows your current tasks grouped and color-coded by priority:
- 🔴 **HIGH** — red dot
- 🟡 **MEDIUM** — yellow dot
- 🟢 **LOW** — green dot

Click any task to open its detail/edit modal.

---

### Stats Widgets (Top Row)

| Widget | Description |
|---|---|
| Tasks Today | Count of tasks created or due today |
| Pomodoro Sessions | Sessions completed today |
| Focus Time | Total focused minutes today |
| Streak | Consecutive days with at least one Pomodoro session |

<!-- SCREENSHOT: Dashboard stats row showing 4 metric cards -->
