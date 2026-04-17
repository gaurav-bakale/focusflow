# Collaboration

FocusFlow supports team collaboration through task sharing, workspaces, activity feeds, and real-time notifications.

---

## Shared Tasks

You can share any task you own with other FocusFlow users.

**How to share a task:**
1. Open the **Board** page
2. Click the **Share** icon on a task card
3. Enter the email address of the user you want to share with
4. Click **Share**

The recipient can view and edit the shared task. Shared tasks appear in their **Shared** section in the sidebar.

![alt text](image-7.png)

---

## Workspaces

Workspaces are shared containers for team projects. Every workspace member sees
the same pool of tasks and can edit any of them — it's the same task list,
live, across everyone on the team.

**Creating a Workspace:**
1. Click **Workspaces** in the left sidebar
2. Click **+ New Workspace**
3. Give it a name
4. Invite members by email with a role — Owner, Admin, or Member

**Adding tasks to a workspace:**
1. Open the **Tasks** page
2. Click **+ New Task** (or edit an existing one)
3. In the modal, use the **Workspace** dropdown to pick a workspace —
   the default "Personal" keeps the task private to you
4. Save — the task is now visible to every member of that workspace

**Filtering tasks by workspace:**
On the Tasks page a row of tabs appears above the filters — *All · Personal ·
&lt;each of your workspaces&gt;*. Click a tab to narrow the view.

**Inside a Workspace (from the Workspaces page):**
- See every member and their role
- See every task in the workspace, with status at a glance
- **Open on Tasks page →** deep-links into the Tasks board filtered to this workspace
- Remove members, change membership, or delete the workspace

**Who can do what to a workspace task:**

| Action              | Owner | Admin | Member |
| ------------------- | ----- | ----- | ------ |
| View workspace tasks | ✅    | ✅    | ✅     |
| Create workspace tasks | ✅  | ✅    | ✅     |
| Edit any workspace task | ✅ | ✅    | ✅     |
| Complete workspace tasks | ✅ | ✅    | ✅     |
| Delete workspace tasks | ✅ own tasks + any in your workspace | ✅ own only | ✅ own only |
| Add/remove members  | ✅    | —     | —      |
| Delete the workspace | ✅    | —     | —      |

**What happens when a workspace is deleted:**
Nobody loses any work. Tasks in the deleted workspace automatically move back
into each member's personal task list (whoever created each task keeps it).
The workspace container itself is removed, and members stop seeing each
other's tasks.

![alt text](image-8.png)

---

## Activity Feed

The **Activity** page shows a real-time timeline of all actions taken on tasks you own or collaborate on:
- Task created / updated / completed
- Comments added
- Tasks shared with you
- Workspace member joined

![alt text](image-9.png)

---

## Real-Time Notifications

The **notification bell** (🔔) in the top header shows unread notifications.

You receive notifications for:
- A task you own is approaching its deadline (within 24 hours)
- A task is shared with you
- A collaborator updates a shared task
- A workspace member joins

Notifications are pushed in real-time via WebSocket — no page refresh needed.
