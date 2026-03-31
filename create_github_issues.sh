#!/bin/bash

# Script to create 25 GitHub issues for FocusFlow project
# Run this script after installing GitHub CLI: brew install gh
# Authenticate first: gh auth login

REPO="gaurav-bakale/focusflow"

echo "Creating GitHub issues for FocusFlow..."

# ============================================================================
# COMPLETED ISSUES (will be marked as closed)
# ============================================================================

echo "Creating COMPLETED issues..."

gh issue create \
  --repo "$REPO" \
  --title "Implement MongoDB Connection with Health Check" \
  --body "MongoDB connection established with ping validation during startup, retry logic, and proper error handling in \`backend/app/db.py\`. Connection lifecycle managed via FastAPI lifespan.

**Status:** ✅ Completed
**Files:** \`backend/app/db.py\`, \`backend/app/main.py\`" \
  --label "backend,database,completed"

gh issue create \
  --repo "$REPO" \
  --title "Build User Authentication System" \
  --body "JWT-based authentication with bcrypt password hashing implemented. Registration and login endpoints working with proper token generation.

**Status:** ✅ Completed
**Files:** \`backend/app/auth.py\`, \`backend/app/routers/auth.py\`" \
  --label "backend,auth,completed"

gh issue create \
  --repo "$REPO" \
  --title "Create Task CRUD API" \
  --body "Full CRUD operations for tasks including create, read, update, delete, and mark complete endpoints in \`/api/tasks\`.

**Status:** ✅ Completed
**Endpoints:**
- GET /api/tasks
- POST /api/tasks
- GET /api/tasks/{task_id}
- PUT /api/tasks/{task_id}
- PATCH /api/tasks/{task_id}/complete
- DELETE /api/tasks/{task_id}

**Files:** \`backend/app/routers/tasks.py\`" \
  --label "backend,api,completed"

gh issue create \
  --repo "$REPO" \
  --title "Implement Pomodoro Timer Backend" \
  --body "Session logging API with endpoints to create and retrieve Pomodoro sessions, including stats calculation for dashboard.

**Status:** ✅ Completed
**Endpoints:**
- POST /api/timer/sessions
- GET /api/timer/sessions
- GET /api/timer/stats

**Files:** \`backend/app/routers/timer.py\`" \
  --label "backend,timer,completed"

gh issue create \
  --repo "$REPO" \
  --title "Build Calendar Time-Blocking API" \
  --body "Time block CRUD operations implemented with task linking support in \`/api/calendar\`.

**Status:** ✅ Completed
**Endpoints:**
- GET /api/calendar/blocks
- POST /api/calendar/blocks
- PUT /api/calendar/blocks/{block_id}
- DELETE /api/calendar/blocks/{block_id}

**Files:** \`backend/app/routers/calendar.py\`" \
  --label "backend,calendar,completed"

gh issue create \
  --repo "$REPO" \
  --title "Implement AI Task Breakdown Feature" \
  --body "OpenAI integration using Strategy Pattern for task decomposition into subtasks with rate limiting (10 requests/hour).

**Status:** ✅ Completed
**Features:**
- BreakdownStrategy for task decomposition
- PrioritizeStrategy for task ranking
- OpenAIAdapter with error handling
- In-memory rate limiting

**Files:** \`backend/app/routers/ai.py\`" \
  --label "backend,ai,completed"

gh issue create \
  --repo "$REPO" \
  --title "Create Task Board UI with Kanban View" \
  --body "TasksPage with Kanban board showing TODO, IN_PROGRESS, and DONE columns with category filtering.

**Status:** ✅ Completed
**Features:**
- Three-column Kanban layout
- Category filtering
- Task creation/editing modal
- Priority badges
- Category tags

**Files:** \`frontend/src/pages/TasksPage.jsx\`" \
  --label "frontend,ui,completed"

gh issue create \
  --repo "$REPO" \
  --title "Build Pomodoro Timer UI" \
  --body "Full timer interface with circular progress indicator, phase tracking, and task selection using TimerContext.

**Status:** ✅ Completed
**Features:**
- SVG circular progress ring
- Phase tracking (Focus, Short Break, Long Break)
- Cycle counter
- Task selection dropdown
- Start/Pause/Resume/Reset controls

**Files:** \`frontend/src/pages/TimerPage.jsx\`, \`frontend/src/context/TimerContext.jsx\`" \
  --label "frontend,timer,completed"

# ============================================================================
# IN PROGRESS ISSUES
# ============================================================================

echo "Creating IN PROGRESS issues..."

gh issue create \
  --repo "$REPO" \
  --title "Add Comprehensive Test Coverage for Backend" \
  --body "Only 3 tests exist in \`test_api.py\` (register, duplicate email, create task). Need tests for:
- Task update/delete endpoints
- Timer endpoints
- Calendar endpoints
- AI endpoints
- Error cases and edge conditions

**Current Coverage:** ~15%
**Target Coverage:** 80%+

**TODO Comment:** Line 128 in \`tests/backend/test_api.py\` indicates Sprint 3 expansion needed.

**Files to Test:**
- \`backend/app/routers/tasks.py\`
- \`backend/app/routers/timer.py\`
- \`backend/app/routers/calendar.py\`
- \`backend/app/routers/ai.py\`" \
  --label "backend,testing,in-progress"

gh issue create \
  --repo "$REPO" \
  --title "Expand Frontend Test Suite" \
  --body "Only 3 test files exist (TaskService, TimerPage, AuthPages). Missing tests for:
- DashboardPage
- CalendarPage
- CanvasAIPage
- Integration tests
- Component tests for Layout

**Current Test Files:**
- \`frontend/src/tests/TaskService.test.js\` (11 tests)
- \`frontend/src/tests/TimerPage.test.jsx\` (9 tests)
- \`frontend/src/tests/AuthPages.test.jsx\` (5 tests)

**Missing Coverage:**
- Dashboard analytics
- Calendar interactions
- AI chat interface
- Context providers" \
  --label "frontend,testing,in-progress"

gh issue create \
  --repo "$REPO" \
  --title "Complete CI/CD Deployment Configuration" \
  --body "Deploy job in \`.github/workflows/ci.yml:167\` is a placeholder. Need actual deployment script for production environment.

**Current Status:** Placeholder echo statement
**Required:**
- Actual deployment to production server
- Environment variable configuration
- Health check verification
- Rollback strategy
- Deployment notifications

**File:** \`.github/workflows/ci.yml\`" \
  --label "devops,in-progress"

gh issue create \
  --repo "$REPO" \
  --title "Add Environment Configuration Documentation" \
  --body "No \`.env.example\` file found. README references it but file doesn't exist.

**Required Variables:**
- \`MONGODB_URL\`
- \`JWT_SECRET\`
- \`JWT_EXPIRE_MINUTES\`
- \`OPENAI_API_KEY\`
- \`MONGODB_HOST\`
- \`MONGODB_PORT\`
- \`MONGODB_DB\`
- \`MONGODB_USER\`
- \`MONGODB_PASSWORD\`

**Action Items:**
1. Create \`.env.example\` with all variables
2. Add descriptions for each variable
3. Update README with setup instructions" \
  --label "documentation,in-progress"

gh issue create \
  --repo "$REPO" \
  --title "Implement Task Drag-and-Drop Functionality" \
  --body "\`react-beautiful-dnd\` is installed in package.json but not implemented in TasksPage. Kanban board currently uses manual status updates.

**Current:** Manual status dropdown in edit modal
**Desired:** Drag tasks between TODO, IN_PROGRESS, and DONE columns

**Implementation:**
- Add DragDropContext to TasksPage
- Wrap columns in Droppable
- Wrap task cards in Draggable
- Handle onDragEnd to update task status

**Dependencies:** Already installed (\`react-beautiful-dnd@^13.1.1\`)
**File:** \`frontend/src/pages/TasksPage.jsx\`" \
  --label "frontend,enhancement,in-progress"

gh issue create \
  --repo "$REPO" \
  --title "Add Subtask Management UI" \
  --body "Backend supports subtasks in models and AI breakdown, but TasksPage doesn't show or allow manual subtask creation/editing.

**Backend Support:**
- \`SubtaskCreate\` and \`SubtaskResponse\` models exist
- Tasks have \`subtasks\` array field
- AI breakdown generates subtasks

**Missing Frontend:**
- Display subtasks in task cards
- Add/edit/delete subtasks manually
- Checkbox to mark subtasks complete
- Progress indicator (e.g., \"3/5 subtasks done\")

**Files:**
- \`frontend/src/pages/TasksPage.jsx\`
- \`backend/app/models.py\` (already has models)" \
  --label "frontend,tasks,in-progress"

gh issue create \
  --repo "$REPO" \
  --title "Implement User Streak Calculation" \
  --body "DashboardPage shows streak hardcoded to 0 (line 25). Backend stats endpoint doesn't calculate streak.

**Current:** \`const [streak] = useState(0)\` in DashboardPage.jsx
**Required:**
- Track daily task completions in database
- Calculate consecutive days with completed tasks
- Add streak field to \`/api/timer/stats\` response
- Update dashboard to display real streak

**Algorithm:**
- Query tasks completed each day
- Count consecutive days backwards from today
- Reset on days with zero completions

**Files:**
- \`frontend/src/pages/DashboardPage.jsx:25\`
- \`backend/app/routers/timer.py\`" \
  --label "backend,analytics,in-progress"

gh issue create \
  --repo "$REPO" \
  --title "Add MongoDB Connection Test to CI" \
  --body "\`test_mongo_connection.py\` exists but needs verification that it runs properly in CI pipeline with MongoDB service.

**Current Status:** Test file exists
**Verification Needed:**
- Confirm test runs in GitHub Actions
- Verify MongoDB service connection works
- Check test passes with valid URL
- Check test fails with invalid URL

**Files:**
- \`tests/backend/test_mongo_connection.py\`
- \`.github/workflows/ci.yml\`" \
  --label "backend,testing,in-progress"

gh issue create \
  --repo "$REPO" \
  --title "Implement AI Prioritization UI" \
  --body "Backend has \`/api/ai/prioritize\` endpoint but no frontend UI to trigger it.

**Backend Ready:**
- POST /api/ai/prioritize endpoint exists
- PrioritizeStrategy implemented
- Rate limiting in place

**Missing Frontend:**
- Button in TasksPage to trigger prioritization
- Send all tasks to endpoint
- Re-order tasks based on AI response
- Show loading state during AI processing

**Note:** CanvasAIPage mentions it in quick actions but doesn't call the actual endpoint.

**Files:**
- \`backend/app/routers/ai.py\` (endpoint ready)
- \`frontend/src/pages/TasksPage.jsx\` (needs UI)
- \`frontend/src/pages/CanvasAIPage.jsx\` (partial reference)" \
  --label "frontend,ai,in-progress"

# ============================================================================
# TO DO ISSUES
# ============================================================================

echo "Creating TO DO issues..."

gh issue create \
  --repo "$REPO" \
  --title "Add Task Search and Filtering" \
  --body "TasksPage needs search bar to filter tasks by title/description and advanced filters.

**Features:**
- Search bar for text matching
- Filter by priority (LOW/MEDIUM/HIGH)
- Filter by deadline (overdue, today, this week, custom range)
- Filter by status (in addition to current category filter)
- Combine multiple filters
- Clear all filters button

**UI Location:** Above the Kanban board in TasksPage

**Implementation:**
- Add search input component
- Add filter dropdown/chips
- Filter tasks array before rendering
- Persist filter state in URL params (optional)

**File:** \`frontend/src/pages/TasksPage.jsx\`" \
  --label "frontend,enhancement,to-do"

gh issue create \
  --repo "$REPO" \
  --title "Implement Task Deadline Notifications" \
  --body "Tasks have deadlines but no notification system. Add email/in-app alerts for approaching deadlines.

**Notification Types:**
1. In-app notifications (bell icon in navbar)
2. Email notifications (optional)
3. Browser push notifications

**Triggers:**
- 24 hours before deadline
- 1 hour before deadline
- When deadline passes (overdue)

**Backend Requirements:**
- Background job scheduler (celery/APScheduler)
- Email service integration (SendGrid/AWS SES)
- Notification preferences per user

**Frontend Requirements:**
- Notification bell component
- Notification list dropdown
- Mark as read functionality
- Notification preferences page

**New Files:**
- \`backend/app/notifications.py\`
- \`frontend/src/components/NotificationBell.jsx\`" \
  --label "backend,frontend,feature,to-do"

gh issue create \
  --repo "$REPO" \
  --title "Add Data Export Functionality" \
  --body "Users should be able to export their tasks, sessions, and time blocks as CSV/JSON for backup and analysis.

**Export Formats:**
- CSV (for Excel/Sheets)
- JSON (for programmatic access)

**Export Options:**
- All tasks
- Tasks by date range
- Tasks by category
- All Pomodoro sessions
- All time blocks
- Complete data dump

**Implementation:**
- Add export button in each page
- Backend endpoint: GET /api/export/{type}
- Stream large exports
- Include metadata (export date, user info)

**New Endpoints:**
- GET /api/export/tasks
- GET /api/export/sessions
- GET /api/export/blocks
- GET /api/export/all

**Files:**
- \`backend/app/routers/export.py\` (new)
- \`frontend/src/pages/TasksPage.jsx\`
- \`frontend/src/pages/DashboardPage.jsx\`" \
  --label "backend,feature,to-do"

gh issue create \
  --repo "$REPO" \
  --title "Implement Dark Mode" \
  --body "Add dark mode theme toggle with persistent user preference storage.

**Requirements:**
- Toggle button in navbar/sidebar
- Persist preference in localStorage
- Apply dark theme to all pages
- Smooth transition between themes
- Respect system preference (prefers-color-scheme)

**Implementation:**
- Use Tailwind CSS dark mode classes
- Create ThemeContext provider
- Update all components with dark: variants
- Add moon/sun icon toggle

**Color Scheme:**
- Dark background: #1a1a1a
- Dark cards: #2d2d2d
- Dark text: #e5e5e5
- Maintain brand colors (indigo) with adjusted opacity

**Files:**
- \`frontend/src/context/ThemeContext.jsx\` (new)
- \`frontend/tailwind.config.js\` (enable dark mode)
- All page components (add dark: classes)" \
  --label "frontend,ui,to-do"

gh issue create \
  --repo "$REPO" \
  --title "Add Task Analytics Dashboard" \
  --body "Create dedicated analytics page showing task completion trends, time distribution by category, and productivity insights.

**Visualizations:**
1. Task completion trend (line chart)
2. Tasks by category (pie chart)
3. Tasks by priority (bar chart)
4. Pomodoro sessions over time (area chart)
5. Most productive hours (heatmap)
6. Average completion time per task

**Metrics:**
- Total tasks completed (all time)
- Completion rate (%)
- Average tasks per day
- Most productive day of week
- Category distribution

**Libraries:**
- Chart.js or Recharts for visualizations
- Date range picker for filtering

**New Files:**
- \`frontend/src/pages/AnalyticsPage.jsx\`
- \`backend/app/routers/analytics.py\` (aggregation queries)

**Backend Endpoints:**
- GET /api/analytics/completion-trend
- GET /api/analytics/category-distribution
- GET /api/analytics/productivity-hours" \
  --label "frontend,analytics,to-do"

gh issue create \
  --repo "$REPO" \
  --title "Implement Recurring Tasks" \
  --body "Add support for daily/weekly/monthly recurring tasks with automatic generation.

**Recurrence Patterns:**
- Daily (every N days)
- Weekly (specific days of week)
- Monthly (specific date or last day)
- Custom (cron-like expression)

**Features:**
- Set recurrence when creating task
- Auto-generate next occurrence when current is completed
- Edit single instance or all future instances
- Skip/delete specific occurrences
- End date or occurrence count limit

**Backend Changes:**
- Add recurrence fields to Task model
- Background job to generate upcoming tasks
- Recurrence rule parsing

**Frontend Changes:**
- Recurrence selector in task modal
- Visual indicator for recurring tasks
- \"Edit series\" vs \"Edit this task\" option

**New Fields:**
- \`recurrence_pattern\`: string
- \`recurrence_end_date\`: optional date
- \`parent_task_id\`: for tracking series

**Files:**
- \`backend/app/models.py\`
- \`backend/app/routers/tasks.py\`
- \`frontend/src/pages/TasksPage.jsx\`" \
  --label "backend,frontend,feature,to-do"

gh issue create \
  --repo "$REPO" \
  --title "Add Collaborative Task Sharing" \
  --body "Allow users to share tasks and time blocks with team members for collaboration.

**Features:**
1. Share individual tasks with other users
2. Shared task lists/projects
3. Real-time updates (WebSocket)
4. Permission levels (view/edit/admin)
5. Activity feed for shared tasks
6. Comments on tasks

**Backend Requirements:**
- User relationship model (teams/workspaces)
- Shared task permissions
- WebSocket server for real-time sync
- Activity log

**Frontend Requirements:**
- Share dialog with user search
- Shared tasks indicator
- Real-time updates UI
- Comments section
- Activity timeline

**New Collections:**
- \`workspaces\`
- \`workspace_members\`
- \`task_shares\`
- \`task_comments\`
- \`activity_log\`

**New Files:**
- \`backend/app/routers/workspaces.py\`
- \`backend/app/routers/sharing.py\`
- \`backend/app/websocket.py\`
- \`frontend/src/pages/SharedTasksPage.jsx\`
- \`frontend/src/components/ShareDialog.jsx\`" \
  --label "backend,frontend,feature,to-do"

gh issue create \
  --repo "$REPO" \
  --title "Implement Calendar Sync Integration" \
  --body "Add Google Calendar/Outlook integration to sync time blocks bidirectionally.

**Integrations:**
1. Google Calendar (OAuth 2.0)
2. Microsoft Outlook Calendar
3. Apple Calendar (CalDAV)

**Features:**
- Two-way sync of time blocks
- Import external events to FocusFlow
- Export FocusFlow blocks to external calendar
- Conflict detection and resolution
- Sync frequency settings (real-time, hourly, daily)

**OAuth Flow:**
- Connect calendar button in settings
- OAuth authorization
- Store refresh tokens securely
- Handle token expiration

**Backend Requirements:**
- Google Calendar API integration
- Microsoft Graph API integration
- CalDAV protocol support
- Sync job scheduler
- Conflict resolution logic

**Frontend Requirements:**
- Calendar connection settings page
- Sync status indicator
- Conflict resolution UI
- Calendar selection (which calendars to sync)

**New Files:**
- \`backend/app/integrations/google_calendar.py\`
- \`backend/app/integrations/outlook_calendar.py\`
- \`backend/app/routers/calendar_sync.py\`
- \`frontend/src/pages/IntegrationsPage.jsx\`

**Environment Variables:**
- \`GOOGLE_CLIENT_ID\`
- \`GOOGLE_CLIENT_SECRET\`
- \`MICROSOFT_CLIENT_ID\`
- \`MICROSOFT_CLIENT_SECRET\`" \
  --label "backend,integration,to-do"

echo ""
echo "✅ All 25 issues created successfully!"
echo ""
echo "Summary:"
echo "- 8 Completed issues (mark as closed after creation)"
echo "- 9 In Progress issues"
echo "- 8 To Do issues"
echo ""
echo "Next steps:"
echo "1. Review issues on GitHub"
echo "2. Close the 8 completed issues"
echo "3. Add issues to your GitHub Project board"
echo "4. Assign team members as needed"
