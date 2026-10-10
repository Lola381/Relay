# UI Requirements: Collaborative Project Management Platform

Design language: **Windows 8 / Metro ("Modern UI")**. Live tiles in mixed sizes on a start-screen grid, and **clicking a tile flips it** to show its back face.

This document says **what** must exist and how it behaves. It deliberately leaves out colors, exact sizes and visual styling. The backend contract is in [API_DESIGN.md](API_DESIGN.md) and the data rules are in [DATA_MODEL.md](DATA_MODEL.md).

---

## 1. Theme & Design Language

### 1.1 Metro principles to follow
- **Content before chrome.** No decorative frames, gradients, bevels, glossy effects or heavy shadows. Flat surfaces with solid fills.
- **Typography is the main visual element.** Large, light-weight page titles. Clear size hierarchy (page title → section header → tile title → body → caption). One clean sans-serif family (Segoe-style).
- **Grid of tiles.** Tiles sit on a strict grid with even gutters. Groups of tiles have a small header label above them.
- **Horizontal panorama on desktop.** The start screen and hub pages scroll **sideways** in tile groups, like the Windows 8 Start screen. On narrow screens they reflow to **vertical** scrolling.
- **Edge-to-edge, generous margins.** Large left margin for page titles. Content bleeds off the right edge to hint that you can scroll.
- **Motion is meaningful.** Tile flips, live-tile content cycling, turnstile/slide-in page transitions, items entering in a staggered sequence. Nothing bounces or decorates.
- **Iconography:** simple monochrome line or glyph icons (Segoe MDL2 / Fluent-style). Icons sit inside tiles or as circular glyph buttons in app bars.
- **Square corners** on tiles and buttons (Metro has no rounded cards).

### 1.2 Theme modes
- **Light and Dark themes**, following the OS by default, with a manual toggle in Profile.
- One **accent color** concept used for the selected state, focus, primary buttons and highlighted tiles. (The color itself is not fixed here.)
- Tiles use **solid fills that differ by tile category** (project, task, notification, activity, user, stat), so categories can be told apart at a glance. Every tile category must stay legible in both themes.
- Status and priority each need distinct visual treatments (TODO / IN_PROGRESS / IN_REVIEW / DONE; LOW / MEDIUM / HIGH / URGENT), and they must **not rely on color alone**: use a label and an icon too.

### 1.3 Tile system

| Tile size | Grid units | Use |
|---|---|---|
| **Small** | 1×1 | Single number or icon (unread count, quick action) |
| **Medium** | 2×2 | One item summary (a task, a team member, a stat) |
| **Wide** | 4×2 | Item with more detail (a project, a list of 3 items, a chart) |
| **Large** | 4×4 | Hero content (my work overview, project progress) |

**Front face** (resting state)
- Title + icon + primary value, e.g. "My Tasks • 7".
- Optional **live content**: it cycles through up to 3 items every few seconds with a slide-up animation, like Windows 8 live tiles. It pauses on hover/focus.
- Optional **badge** in the corner (count, or a status glyph).

**Back face** (after a click)
- The details and **actions** for that item (e.g. Open, Change status, Assign, Mark read).
- An **Open** action that always navigates to the full page.
- A **flip-back** control.

**Flip behaviour**

| Requirement | Detail |
|---|---|
| Trigger | Click/tap anywhere on the tile front, or **Enter/Space** when it has keyboard focus |
| Animation | 3D flip around the vertical axis (~300–400 ms) |
| One at a time | Flipping a tile flips any other open tile back |
| Return | Flip-back control, click outside, **Esc**, or ~10 s with no interaction |
| Actions on back | Actions run without leaving the screen where possible. The tile shows a busy state, then the result (updated front, or an error message on the back) |
| Real-time | If the tile's data changes while it's flipped, update the back face in place and briefly highlight what changed. If the item is deleted, the back face shows "This item was deleted" and the tile is removed when it flips back |
| Reduced motion | When the OS "reduce motion" setting is on: crossfade instead of flipping, and no live-tile cycling |
| Accessibility | Tile is a `button` with `aria-expanded`. Focus moves to the first back-face action. The back face is announced to screen readers |
| Touch | Tap flips. **Long-press** selects a tile (multi-select where supported, see §1.4) |

### 1.4 Shared Metro components

| Component | Requirement |
|---|---|
| **Top bar** | Thin bar showing the app name/logo, a back arrow on non-root pages, a **search** glyph, a **notifications** glyph with an unread badge, and the **user tile** (avatar + name, opens a menu with Profile, Theme, Log out) |
| **Live connection indicator** | Small dot/glyph in the top bar showing *Live*, *Reconnecting…* or *Offline* (it reflects the real-time stream state) |
| **App bar (bottom command bar)** | Windows 8-style bar that slides up from the bottom. It shows the context actions for the current page and for the selected tile(s): circular glyph buttons with labels. Opened by right-click, long-press, or a visible "…" handle. It's always visible on phones |
| **Flyouts** | Small panels attached to a button, used for quick forms (change status, assign, add member, filters) |
| **Settings-style side pane** | Full-height pane that slides in from the right, used for create/edit forms (new project, new task, new user) and the notifications panel |
| **Dialogs** | Full-width Metro message band across the middle of the screen (title, message, 1–2 buttons). Used for destructive confirmations and the edit-conflict prompt |
| **Toasts** | Slide in from the top-right, auto-dismiss after ~5 s, can be clicked to go to the item. Used for real-time events and action results |
| **Banners** | Full-width strip under the top bar for page-level state (archived project, reconnecting, task updated by someone else) |
| **Progress** | Metro "flying dots" indeterminate indicator for page/route loads. Thin progress bar for in-tile actions |
| **Pivot / tabs** | Metro pivot headers (large text tabs, inactive ones dimmed) for sub-sections inside a project |
| **Semantic zoom** | On tile-heavy screens, a zoom-out control (or pinch / Ctrl + scroll) shows group names only, for quick jumps. Recommended, not required |

---

## 2. Global Requirements (every page)

### 2.1 Navigation & routing

| Route | Page | Access |
|---|---|---|
| `/login` | Login | Public (redirects to `/dashboard` if already logged in) |
| `/dashboard` | Start screen (tiles) | All roles |
| `/projects` | Projects hub | All roles (only projects the user belongs to; all projects for Admin) |
| `/projects/:id` | Project hub | Project members + Admin |
| `/projects/:id/tasks` | Task board | Project members + Admin |
| `/projects/:id/team` | Team | Project members + Admin |
| `/projects/:id/activity` | Project activity | Project members + Admin |
| `/tasks/:id` | Task detail | Project members + Admin |
| `/users` | User management | **Admin only** |
| `/notifications` | Notifications | All roles |
| `/profile` | Profile & settings | All roles |
| `/activity` | System activity | **Admin only** |
| `*` | Not found | – |

- Unauthenticated access to any route other than `/login` → redirect to `/login`, then return to the original URL after login.
- A non-Admin opening `/users` or `/activity` → **"You don't have access"** page (not a blank screen).
- Opening a project or task the user can't see (API 404) → **"Not found or you don't have access"** page, with a link back to Projects.
- The browser back button always works. The URL reflects the current filters/pivot so links can be shared.

### 2.2 Role-aware UI
The UI **hides** actions the user can never perform, but the server still enforces everything. If the server rejects something anyway (403), show a clear message in context ("You don't have permission to delete tasks") and roll back any optimistic change.

| UI element | Admin | Manager | Member | Viewer |
|---|---|---|---|---|
| "New project" tile/button | ✅ | – | – | – |
| Archive / Unarchive / Delete project | ✅ | – | – | – |
| Edit project name/description | ✅ | ✅ | – | – |
| Add/remove members, change roles (MEMBER/VIEWER) | ✅ | ✅ | – | – |
| Grant/revoke MANAGER role | ✅ | – | – | – |
| "New task" tile/button | ✅ | ✅ | – | – |
| Edit all task fields, assign, delete task | ✅ | ✅ | – | – |
| Change status / edit description | ✅ | ✅ | ✅ (own assigned tasks only) | – |
| Drag task between board columns | ✅ | ✅ | ✅ (own assigned tasks only) | – |
| Add comment | ✅ | ✅ | ✅ | – |
| Delete comment | ✅ any | ✅ any in project | ✅ own | – |
| Users page, system activity | ✅ | – | – | – |

- A **role chip** next to the project name always shows the user's role in this project (Admin / Manager / Member / Viewer).
- For **Viewers**, show a subtle "Read-only access" label on project and task pages.

### 2.3 Required states for every data view
Each page, tile and list must design all of these:

| State | Requirement |
|---|---|
| **Loading** | Skeleton tiles in the real tile sizes (no layout jump). Flying-dots indicator for page changes |
| **Empty** | A friendly message + the next action if the role allows it ("No tasks yet. Create the first task" vs. "No tasks yet" for Viewers) |
| **Error** | Message + **Retry** button. Never a raw error code alone |
| **Forbidden (403)** | "You don't have permission to …". Roll back any optimistic change |
| **Not found (404)** | "Not found or you don't have access" |
| **Archived project** | Banner "This project is archived and read-only". All edit actions hidden or disabled. Admin sees **Unarchive** |
| **Offline / reconnecting** | Banner + top-bar indicator. Data stays visible (stale). Refresh automatically on reconnect |
| **Partial data** | Deleted references show placeholders ("Deleted task", "Deactivated user" badge) instead of breaking |

### 2.4 Real-time behaviour (SSE)
- **One live connection per tab**, opened after login and closed on logout.
- Lists, boards, tiles, counters and the notification badge update **without a refresh** when other users change data.
- **Arrival animation:** a new item slides in; an updated tile does a brief **peek-flip** or highlight pulse; a deleted item fades out.
- **Toasts** for events that matter to me: assigned to me, mentioned, my task's status changed, added to or removed from a project. Each toast links to the item.
- Changes I make myself don't produce toasts (only the success state).
- **Reconnect:** show *Reconnecting…*; when back, refresh the current data silently and show *Live* again.
- **Removed from a project while viewing it** → toast "You were removed from <Project>" and redirect to `/projects`.
- **Project deleted while viewing** → toast + redirect to `/projects`.
- **Task deleted while viewing it** → banner "This task was deleted by <Name>", edit actions disabled, button "Back to board".
- **Session revoked** (account deactivated) → full-screen message "Your account has been deactivated", then redirect to `/login`.

### 2.5 Forms (everywhere)
- Inline validation under each field. The same limits as the API: name 1–100, project name 1–120, task title 1–200, description ≤ 10,000, comment 1–5,000, password ≥ 8, valid email, ISO date.
- **Server validation errors (400) map to the matching fields.**
- Submit button shows a busy state and blocks double submission.
- **Unsaved changes guard:** warn before leaving a form with edits.
- Character counters on long text fields.
- Required fields are marked. Errors are announced to screen readers.

### 2.6 Responsiveness
| Width | Layout |
|---|---|
| Desktop (≥ 1280 px) | Horizontal panorama of tile groups. App bar slides up on demand |
| Tablet (768–1279 px) | Horizontal panorama with fewer rows per group, or vertical |
| Phone (< 768 px) | **Vertical** scrolling. Large tiles become wide, wide tiles stay wide, small tiles pair up. App bar is always visible at the bottom. Side panes become full-screen. 16 px side gutters, no horizontal page scroll |

### 2.7 Accessibility
- Full **keyboard** support: arrow keys move between tiles in the grid, Enter/Space flips, Esc flips back or closes, Tab reaches every action. Visible focus ring on everything.
- WCAG AA contrast for all text on tiles, in both themes.
- Live updates are announced through a polite `aria-live` region ("Task 'Login page' moved to Done by Ravi").
- Respect the OS "reduce motion" setting (§1.3).
- All glyph-only buttons have text labels or tooltips plus `aria-label`.
- Touch targets ≥ 44 px.

---

## 3. Page Requirements

### 3.1 `/login`
- Metro-style split screen: a large app title/branding area and the sign-in form.
- Fields: **Email** and **Password** (show/hide toggle). **Sign in** button.
- Errors:
  - "Invalid email or password". The same message for both cases.
  - "Your account has been deactivated. Contact an administrator."
  - "Too many attempts, try again in N seconds" (429).
- Busy state on submit; Enter submits.
- **Demo accounts panel** (for the hackathon demo): a list of seeded accounts per role. Clicking one fills in the form.
- After login → the originally requested URL, or `/dashboard`.

### 3.2 `/dashboard`: Start screen (main tile screen)
The home of the app: a Windows 8 Start screen of mixed-size live tiles, arranged in **named groups** and scrolling horizontally. The content depends on the role.

**Header:** large "Start" or "Hello, <first name>" title, with the date.

**Group "My Work"** (Admin, Manager, Member)

| Tile | Size | Front | Back (on flip) |
|---|---|---|---|
| My Tasks | Large | Count of open tasks assigned to me + live-cycles the 3 most urgent (title, project, due) | Breakdown by status (TODO / IN_PROGRESS / IN_REVIEW) + "Open My Tasks" |
| Overdue | Medium | Number of overdue tasks (emphasized if > 0) | List of the overdue tasks (up to 5), each opens the task |
| Due this week | Medium | Count | List of tasks with due dates |
| Recently completed | Small | Count of my tasks done in the last 7 days | Last 3 completed |

**Group "Projects"** (all roles)
- One **Wide** tile per project I belong to (Admin: all active projects, with a "View all" tile at the end).
  - Front: project name, my role chip, progress (done/total tasks as a bar or ring), member count. Live-cycles the latest activity line.
  - Back: task counts per status, number of overdue tasks, manager name(s), actions **Open**, **Tasks**, **Team**, **Activity**.
  - Flagged "No manager assigned" if the project has zero managers (Admin view).
- **"New project"** Small tile with a plus glyph (Admin only) → opens the create-project pane.

**Group "Notifications"**
- **Notifications** Medium tile: unread count badge + live-cycles the latest 3 unread. Back: list of 5 recent unread with **Mark read** on each, plus **Mark all read** and **Open all**.

**Group "Activity"**
- **Recent activity** Wide tile: live-cycles the latest events across my projects (system-wide for Admin). Back: last 8 events + "Open activity".

**Group "Admin"** (Admin only)
- **Users** Medium tile: active user count, with the number of deactivated users as a secondary figure. Back: counts per system role + **Manage users** + **New user**.
- **System stats** Wide tile: total projects (active/archived), total tasks, tasks completed this week.
- **System activity** Medium tile → `/activity`.

**Group "Quick actions"** (Small tiles, role-dependent): New task (Manager: asks which project), My profile, Toggle theme.

**Requirements**
- All tiles update live when an SSE event affects them (count changes animate).
- **Empty state per role:** a Member with no projects sees a tile "You're not in any projects yet. A project manager will add you." A Viewer sees a read-only version of the same groups without action tiles.
- **Optional:** the user can resize tiles (small / medium / wide) and rearrange them via the app bar or by dragging, saved per user in the browser. Not required for the core build.

### 3.3 `/projects`: Projects hub
- Title "Projects". Group tiles by **Active** and **Archived** (the archived group is shown only for Admin, or when the filter is on).
- Each project is a **Wide tile** with the same front and back as on the dashboard. Archived tiles get an "Archived" ribbon/glyph and a dimmed treatment.
- **Filter/search bar:** search by name, status filter (Active / Archived / All), sort (Name, Recently updated, Created).
- **Pagination:** "Load more" tile at the end of the group (follows the API page size).
- **App bar actions:** New project (Admin), Toggle tile/list view.
- **List view** alternative (table: name, my role, progress, members, updated), for accessibility and density.
- **Create project pane** (Admin): Name*, Description, Managers (multi-select picker of active users with the PROJECT_MANAGER system role). Error: "A project with this name already exists" (409).
- Live: new project I'm added to appears; removal makes the tile fade out; name/archive changes update tiles.

### 3.4 `/projects/:id`: Project hub
Metro **hub page**: big project title, role chip, and a **pivot** across the top: **Overview · Tasks · Team · Activity** (each pivot is its own route).

**Overview content (tile groups):**

| Tile | Size | Front | Back |
|---|---|---|---|
| Progress | Large | Percent done + counts per status | Per-status list with links to the filtered board |
| Overdue | Medium | Count | List of overdue tasks |
| Unassigned | Medium | Count of unassigned tasks (Manager/Admin) | List + quick **Assign** action |
| Team | Wide | Member avatars (up to 8) + count | Members grouped by role + "Manage team" (Manager/Admin) |
| Recent activity | Wide | Live-cycles the latest events | Last 8 events + "Open activity" |
| My tasks here | Medium | My open tasks in this project | List with quick status change |
| About | Wide | Description (truncated) | Full description + created by/date + **Edit** (Manager/Admin) |

**Project actions** (app bar):
- **Edit details** (Manager/Admin): a pane with Name and Description. A version conflict shows the conflict dialog (§4.1).
- **Archive / Unarchive** (Admin): confirmation dialog explaining that the project becomes read-only for everyone.
- **Delete project** (Admin): a strong confirmation dialog that requires typing the project name. It states the number of tasks and comments that will be deleted.

**States:** archived banner; zero-manager warning (Admin); the read-only label for Viewers.

### 3.5 `/projects/:id/tasks`: Task board
Metro panorama where **each status is a column group**: TODO · IN PROGRESS · IN REVIEW · DONE. Each column has a count in its header.

**Task tile** (Medium; Wide when the description is shown):
- Front: title, priority indicator (label + icon), assignee avatar/name (or "Unassigned"), due date (overdue emphasized), comment count glyph.
- Back (flip): short description, status changer, assignee changer (Manager/Admin), priority, due date, **Open** (→ `/tasks/:id`), **Delete** (Manager/Admin, with confirmation).
- A task assigned to me gets a "Mine" marker.

**Interactions**
- **Drag & drop** a task tile between columns to change its status (only roles allowed to change status; for Members only their own tasks). Keyboard alternative: the status changer on the back face.
- The change is applied immediately on screen and **rolled back** on error. A 409 opens the conflict dialog.
- Quick **"+ Add task"** tile at the top of the TODO column (Manager/Admin) opens the create-task pane.

**Toolbar / filters** (reflected in the URL):
- Search by title.
- Assignee filter: Anyone / **Me** / Unassigned / a specific member.
- Priority filter (multi).
- Due filter: overdue / this week / no date / range.
- Sort within columns: updated, due date, priority, created.
- **View switch:** Board (tiles) / **List** (table with the same filters, sortable columns, pagination).

**Create task pane** (Manager/Admin): Title*, Description, Priority (default Medium), Assignee (picker of active project MEMBERs/MANAGERs only, with "Unassigned" allowed), Due date (a past date is allowed with a hint "This date is in the past"), Initial status (default TODO).

**Live:**
- New tasks slide into their column, status changes animate the tile moving to the new column, and deleted tasks fade out. Column counts update.
- If I'm dragging a tile that someone else just changed, my drop runs the normal conflict flow.

**Empty states:** per column ("Nothing in review"). Whole board: "No tasks yet" (+ create for Manager/Admin).

### 3.6 `/tasks/:id`: Task detail
Two-pane Metro layout (stacked on phones):

**Main pane**
- Title (inline-editable for Manager/Admin).
- Description: rich multi-line text, editable by Manager/Admin or the assigned Member.
- Breadcrumb: Project › Task.

**Side pane: properties**
- **Status**: segmented/pivot selector (allowed: Manager/Admin, assigned Member).
- **Assignee**: picker of eligible members (Manager/Admin). Deactivated assignees show a badge.
- **Priority** and **Due date** (Manager/Admin). Overdue is clearly indicated.
- Created by/at, last updated by/at, completed at (when DONE).
- **Delete task** (Manager/Admin): confirmation that says comments will also be deleted.

**Comments section**
- Thread in chronological order (oldest first), with pagination/"Load earlier".
- Each comment: author avatar + name (+ deactivated badge), relative time (exact time on hover), body with **mentions shown as highlighted chips**, **Delete** (own comment; any for Manager/Admin) with confirmation.
- **Composer:** multi-line input with a **@ mention picker**. Typing `@` opens a filtered list of active project members; selecting one inserts a mention chip. Character counter (5,000). Submit with button or Ctrl/Cmd + Enter.
- Composer hidden for Viewers and in archived projects.
- Live: new comments slide in; deleted ones fade out. If I'm scrolled up, show a "New comments ↓" pill.

**Task history:** collapsible list of this task's activity (status changes, reassignments, edits with from → to).

**Concurrency & live updates on this page**
- If someone else updates the task while I'm **viewing**: the fields update in place and briefly highlight, plus a toast "Updated by <Name>".
- If someone else updates it while I'm **editing**: banner "<Name> just changed this task. Review changes" (a heads-up before I hit a conflict).
- Saving with a stale version → **conflict dialog** (§4.1).
- Task deleted → banner, editing disabled, "Back to board".
- I get unassigned while editing (Member) → banner "You're no longer assigned to this task", editing disabled.

### 3.7 `/projects/:id/team`: Team
- Tile groups by role: **Managers · Members · Viewers**. Each person is a **Medium tile** (avatar, name, email, role).
- Back (flip): open-task count in this project, **Change role** (flyout), **Remove from project** (confirmation that states "N tasks assigned to them will become unassigned").
- Manager can change and remove only MEMBER/VIEWER tiles. MANAGER tiles show actions only for Admin.
- **"Add member" tile** (Manager/Admin) opens a flyout:
  - User search picker (active users not already in the project).
  - Role selector, which offers only the roles allowed by that user's system role (e.g. a TEAM_MEMBER user can't be offered MANAGER). Manager can't pick MANAGER.
  - Errors: "Already a member" (409), "User is deactivated", "Role not allowed for this user".
- Changing someone to **Viewer** warns that their tasks will be unassigned.
- Deactivated members show a badge and a dimmed tile.
- Live: members added or removed appear/fade, and role changes move the tile between groups.

### 3.8 `/projects/:id/activity`: Project activity
- Metro **timeline list**, newest first, grouped by day ("Today", "Yesterday", date).
- Each entry: actor avatar + name, an action sentence with linked entities ("Ravi moved **Login page** from To Do → In Progress"), relative time, and an icon per action type.
- References to deleted items appear as plain text with a "(deleted)" label.
- **Filters:** action type (multi), entity type, actor, date range. Reflected in the URL.
- Pagination: "Load more" at the bottom.
- Live: new entries slide in at the top. If I've scrolled down, show a "N new ↑" pill.

### 3.9 `/activity`: System activity (Admin only)
- Same as §3.8, across all projects, plus a **project filter**, user-management events (user created/deactivated, etc.) and a deleted-project record ("Project 'X' deleted, 14 tasks").

### 3.10 `/users`: User management (Admin only)
- Two layouts: **tile grid** (Medium user tiles) and **table list**, with a toggle. The table is the default for density.
- Columns/tile front: avatar, name, email, system role, status (Active/Deactivated), last login, created.
- **Filters:** search (name/email), role, status. Sorting. Pagination.
- **Flip back / row actions:** Edit, Deactivate / Activate, View memberships (list of projects + project roles).
- **New user pane:** Name*, Email*, Temporary password* (with a generate button), System role*. Error: "Email already in use" (409).
- **Edit user pane:** name, email, system role. Changing the role shows a **warning summary** of the consequences ("Will be downgraded from Manager to Member in 2 projects", "5 tasks will be unassigned").
- **Deactivate** confirmation: explains that they'll be logged out immediately and keep their history.
- **Guards with clear messages:**
  - Can't deactivate or demote yourself (the action is hidden on your own row).
  - Can't deactivate or demote the last active Admin.
- Deactivated users are shown dimmed with a badge.

### 3.11 `/notifications`: Notifications
- List view, newest first, grouped by day. Filter pivot: **All · Unread**.
- Each item: type icon, actor avatar, message sentence, project name, relative time, **unread marker**.
- Clicking an item **marks it read** and navigates to the target (task / project). If the target is gone or inaccessible → "This item was deleted or you no longer have access".
- Per-item **Mark read / unread** toggle. **Mark all read** button (only marks what's loaded/visible at that moment).
- Pagination: "Load more".
- Live: new notifications slide in at the top. The badge and unread count stay in sync across tabs.
- Empty states: "You're all caught up" (Unread), "No notifications yet" (All).
- The **top-bar notification glyph** opens a right-side **notification pane** (latest 10, with the same actions + "See all").

### 3.12 `/profile`: Profile & settings
- Large user tile: avatar, name, email, system role (read-only), member since.
- **Edit profile:** name, avatar URL (with a preview).
- **Change password:** current password, new password, confirm. Shows a success message and states that other sessions were signed out.
- **Appearance:** Theme (System / Light / Dark). Reduce motion (overrides the OS setting). Toggle live-tile animation on/off.
- **My projects:** list of my project memberships with project roles.
- **Log out** button.

### 3.13 Error pages
- **404:** large Metro "Page not found" title, with links to Dashboard and Projects.
- **403 / no access:** "You don't have access to this page", with a link to the Dashboard.
- **Global crash fallback:** "Something went wrong", with Reload and Go home.

---

## 4. Cross-Cutting Flows

### 4.1 Edit conflict (HTTP 409)
Triggered when saving a task (or project) that someone else changed after I opened it.
- Metro dialog band: "**<Name> updated this task while you were editing.**"
- **Comparison view**: for each changed field, show *Your change* vs *Latest version*, and mark the fields that both of us changed.
- Actions:
  - **Use latest** discards my edits and loads the current version.
  - **Re-apply my changes** keeps my edits on top of the latest version and lets me review before saving again.
  - **Cancel** keeps me in the form with my edits.
- Same flow for a drag-and-drop status change that conflicts: the tile snaps back and a smaller flyout offers "Move anyway" / "Keep current".

### 4.2 Destructive confirmations
Required for: delete project (type the name to confirm), delete task, delete comment, remove member, deactivate user, archive project, change a member to Viewer, and role changes that unassign tasks.
- Each one states the consequences (counts of affected items).

### 4.3 Optimistic updates
Status changes, drag & drop, mark-as-read and adding comments update the screen immediately. Each shows a pending state and **rolls back with an explanation** if the server rejects it (403, 409, 400).

### 4.4 Session handling
- Expired session renews silently in the background. If renewal fails → redirect to login with the message "Your session expired", then return to the same page after login.
- Logout clears all data, closes the live stream and returns to `/login`.

### 4.5 Search
The top-bar search glyph opens a Metro search pane that searches tasks (by title, in my projects) and projects (by name). Results are grouped by type, and selecting one navigates to it. Keyboard shortcut `/` or Ctrl+K.

---

## 5. Motion Catalogue

| Motion | Where |
|---|---|
| Tile flip (3D, ~300–400 ms) | Clicking any tile |
| Live tile cycle (slide up, every 4–6 s, staggered between tiles) | Tiles with live content |
| Peek / pulse | Tile whose data just changed in real time |
| Turnstile / slide-in page entrance with staggered tiles | Route changes |
| Slide-in from the right | Side panes, notification pane |
| Slide-up from the bottom | App bar |
| Move between columns | Task status changes on the board |
| Fade out + collapse | Deleted / removed items |
| Count roll | Numbers on tiles changing |

All motion is turned off or replaced with simple fades when reduce motion is on.

---

## 6. Requirements Checklist (for review against the brief)

- [ ] Every suggested route exists (§2.1), plus `/activity` for Admin
- [ ] Role-based visibility of every action (§2.2), with server 403s handled gracefully
- [ ] Users: create, read, update, deactivate/activate (§3.10)
- [ ] Projects: create, read, update, archive/unarchive, delete (§3.3, §3.4)
- [ ] Team: add, remove, change project role (§3.7)
- [ ] Tasks: create, read, update, delete, assign, change status (§3.5, §3.6)
- [ ] Comments: create, read, delete, with @mentions (§3.6)
- [ ] Real-time updates on board, task detail, team, activity, notifications and tiles, with no refresh (§2.4)
- [ ] Conflict (409) dialog guiding the user to the latest state (§4.1)
- [ ] Activity log views: project + system (§3.8, §3.9)
- [ ] Notifications with read/unread, live badge, mark all read (§3.11)
- [ ] Loading / empty / error / forbidden / archived / offline states everywhere (§2.3)
- [ ] Light + dark theme, Metro tiles with click-to-flip (§1)
- [ ] Responsive down to phone width (§2.6)
- [ ] Keyboard + screen reader + reduced-motion support (§2.7)
- [ ] Demo accounts on the login screen for quick role switching (§3.1)
