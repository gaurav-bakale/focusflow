# FocusFlow — Scrum Summary (Since Part B)

## Sprint Overview

Part B was submitted after initial infrastructure (auth, basic task CRUD, CI/CD skeleton) was in place.
The following sprints cover all development from Part B through Part C.

---

## Sprint 3 — Core Feature Buildout
**Dates:** ~Mar 31 – Apr 1, 2026
**Theme:** Establish full task board, calendar, dark mode, and smart category features

### What Was Improved
- Replaced placeholder pages with fully functional Task Board (Kanban) and Calendar
- Added dark mode toggle across the entire UI
- Added smart category suggestions using keyword matching
- Implemented overlap detection for calendar blocks

### Stories / Epics Finished
| Story | PR | Description |
|---|---|---|
| Kanban Board | [#51](https://github.com/gaurav-bakale/focusflow/pull/51) | Task board with Drag-and-drop, status columns, recurring task support |
| Dark Mode | [#53](https://github.com/gaurav-bakale/focusflow/pull/53) | Full dark/light theme toggle with persistent preference |
| Calendar + Recurring Blocks | [#55](https://github.com/gaurav-bakale/focusflow/pull/55) | Weekly calendar view, drag-to-create blocks, recurring series |
| Overlap Detection Fix | [#54](https://github.com/gaurav-bakale/focusflow/pull/54) | Fixed false positive in overlap detection + dashboard task description fix |

### Team Contributions
| Member | Contribution |
|---|---|
| Gaurav Bakale | UI redesign, Kanban DnD, dark mode integration |
| Karan Srinivas | Calendar page, block modal, recurring logic |
| Vihar Kothiya | Backend calendar router, block series scoped updates/deletes |
| Vishwesh Gopikrishnan | Smart categories utility, overlap detection |
| Sheshu Tadaka | Unit tests for overlap detection and smart schedule utilities |

---

## Sprint 4 — AI, Collaboration & Notifications
**Dates:** ~Apr 2, 2026
**Theme:** Full AI integration, real-time collaboration, deadline notifications, streak tracking, subtasks

### What Was Improved
- Integrated Google Gemini AI for task breakdown, prioritization, scheduling, and frog identification
- Added real-time WebSocket collaboration (task sharing, workspaces, activity feed)
- Added background deadline notification scanner with browser push support
- Added Pomodoro streak calculation
- Added subtask management UI on task cards

### Stories / Epics Finished
| Story | PR | Description |
|---|---|---|
| AI Integration | [#57](https://github.com/gaurav-bakale/focusflow/pull/57) | Gemini-powered breakdown, prioritize, schedule, frog, tips endpoints |
| Collaborative Sharing | [#56](https://github.com/gaurav-bakale/focusflow/pull/56) | Task sharing, Workspaces, Activity feed, WebSocket notifications |
| Deadline Notifications | [#59](https://github.com/gaurav-bakale/focusflow/pull/59) | APScheduler background scanner, browser push, notification bell |
| User Streak | [#60](https://github.com/gaurav-bakale/focusflow/pull/60) | Consecutive Pomodoro-active day streak in `/api/timer/stats` |
| Subtask Management | [#61](https://github.com/gaurav-bakale/focusflow/pull/61) | Inline subtask CRUD on task cards and edit modal |

### Team Contributions
| Member | Contribution |
|---|---|
| Gaurav Bakale | AI Dashboard widgets (frog, schedule, tips), Settings page (API key management) |
| Vishwesh Gopikrishnan | AI router (Strategy + Adapter patterns), Gemini SDK integration |
| Karan Srinivas | WebSocket manager, real-time toast notifications, Workspaces page |
| Vihar Kothiya | Activity feed, sharing service + backend, CommentThread component |
| Sheshu Tadaka | Tests for AI endpoints (TC-AI01–AI12), notification tests (TC-N01–N12), streak tests (TC-ST01–ST08) |

---

## Sprint 5 — Polish, Export, and Part C Features
**Dates:** ~Apr 3–4, 2026
**Theme:** AI UX improvements, data export, calendar fixes, deployment hardening, documentation

### What Was Improved
- Rewrote AI Task Planner as a conversational 5-task flow (accept / refine / discard)
- Moved AI Schedule feature to the Board page with conflict-free calendar insertion
- Added "Import Tasks" to Calendar with no double-booking (`findFreeSlot` utility)
- Added persistent 🍅 Pomodoro button on IN_PROGRESS Kanban cards
- Implemented Eat That Frog feature on Dashboard with "Start Now" button
- Added data export endpoints (CSV + JSON) for tasks, sessions, blocks
- Fixed calendar block end-time validation
- Updated README with full build/deploy instructions
- Added `.env.example` for easy onboarding
- Hardened Docker setup for Render deployment
- Fixed all CI lint errors (ESLint + flake8)

### Stories / Epics Finished
| Story | PR | Description |
|---|---|---|
| Data Export | [#66](https://github.com/gaurav-bakale/focusflow/pull/66) | Export tasks/sessions/blocks as CSV or JSON with filters |
| Calendar End-Time Fix | [#62](https://github.com/gaurav-bakale/focusflow/pull/62) | Validate end time > start time in real-time on BlockModal |
| AI Planning + Scheduling UX | [#68](https://github.com/gaurav-bakale/focusflow/pull/68) | Conversational AI Task Planner, Eat That Frog, AI Schedule on Board, Calendar Import |
| Render Deployment | [#70](https://github.com/gaurav-bakale/focusflow/pull/70) | Root Dockerfile for Render cloud deployment |
| README + .env | [#63](https://github.com/gaurav-bakale/focusflow/pull/63), [#64](https://github.com/gaurav-bakale/focusflow/pull/64) | Full setup/deploy documentation |

### Team Contributions
| Member | Contribution |
|---|---|
| Gaurav Bakale | AI Task Planner rewrite, Eat That Frog, AI Schedule on Board, Calendar Import, Pomodoro button on Kanban |
| Vihar Kothiya | Data export router + tests, Render Dockerfile |
| Karan Srinivas | Calendar end-time validation fix |
| Vishwesh Gopikrishnan | README update, `.env.example`, deployment documentation |
| Sheshu Tadaka | Export tests (TC-EX01–EX14), calendar test fixes |

---

## What Was Not Done (For Lack of Time)

| Item | Reason |
|---|---|
| Mobile-responsive layout | Time constraint; desktop-first approach maintained throughout |
| Google Calendar sync (OAuth) | External OAuth integration scope exceeded sprint capacity |
| Offline mode / PWA | Service worker setup not prioritized given feature backlog |
| AI natural language time parsing ("add task for tomorrow at 3pm") | Deprioritized in favor of manual scheduling UX |
