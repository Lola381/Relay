# Demo Guide

A step-by-step script for presenting **relay**, the collaborative project management platform, to the evaluator. Follow it top to bottom. The full run takes **about 20 minutes**; if you're short on time, do only the parts marked ⭐ (about 10 minutes).

| Part | What it proves | Time |
|---|---|---|
| 0. Setup | before the evaluator arrives | 3 min |
| 1. Intro ⭐ | stack and architecture in one breath | 30 s |
| 2. Accounts and sign-up | auth, roles, a new account appearing live | 2 min |
| 3. Admin: projects and users ⭐ | project CRUD, assigning managers, user management | 2 min |
| 4. Manager: team and tasks ⭐ | member CRUD, task CRUD | 2 min |
| 5. Member and viewer views ⭐ | role-aware UI, task details, comments, task history | 2 min |
| 6. Real-time ⭐ | §5 live updates without refresh | 2 min |
| 7. Notifications | bell, full notifications page | 1 min |
| 8. Authorization on the server ⭐ | §6 403 / 404 / 401 from the API itself | 2 min |
| 9. Concurrent updates ⭐ | §7 the 409 conflict flow | 2 min |
| 10. Activity log and dashboard | audit trail, Start screen | 1 min |
| 11. Under the hood | API format, database, code layout, tests | 3 min |
| 12. Small extras | 404 page, Back button, profile, theme | 1 min |

---

## Demo accounts (password for all: `Password123!`)

The sign-in page lists them too. Click one to fill in the form.

| Account | Role | Projects |
|---|---|---|
| admin@demo.com (Neha) | **Admin**, the only one | everything |
| pm@demo.com (Ravi) | Project Manager | manages Website Revamp, Mobile App, Legacy CRM (archived) |
| alice@demo.com | Team Member | Website Revamp, Legacy CRM |
| bob@demo.com | Team Member | Website Revamp, Mobile App |
| carol@demo.com | Team Member | Website Revamp only |
| viewer@demo.com (Vikram) | Viewer | Website Revamp (read-only) |
| meera@demo.com | Viewer | Website Revamp (read-only) |
| inactive@demo.com (Ishaan) | deactivated | can't sign in |

---

## 0. Setup (before the evaluator arrives)

1. **Stop old servers.** Press Ctrl+C in any terminal still running `npm run dev`.
2. **Terminal 1: fresh data, then start:**
   ```
   npm run db:reset
   npm run dev
   ```
   Wait for `API listening on http://localhost:4000` and the web app's `Ready`.
3. **Terminal 2:** open it in the project folder. You'll use it for `npm run demo:api` and `npm test`.
4. **Two browser windows side by side:**
   - **Window A:** a normal Edge or Chrome window, at http://localhost:3000.
   - **Window B:** a **private** (InPrivate or Incognito) window, at http://localhost:3000. It needs to be private so it can hold a separate login.
5. **In both windows:** press F12, open the **Network** tab, click **Fetch/XHR**, and tick **Preserve log**. Dock DevTools at the bottom so the app stays visible.

---

## 1. Intro ⭐ (30 seconds)

> "relay is a project management platform with four roles: Admin, Project Manager, Team Member and Viewer. The front end is Next.js. The separate API is Express with TypeScript, backed by PostgreSQL. **Every permission is checked on the server.** The front end uses the same shared rulebook only to hide buttons. Changes appear live over **Server-Sent Events**. Stale edits are rejected with **HTTP 409**. Every change is recorded in an **activity log** and creates **notifications**."

---

## 2. Accounts and sign-up (2 minutes)

1. **Sign-in required.** In Window B, open http://localhost:3000/dashboard without signing in.
   - **Show:** you're sent to the sign-in page. It lists the demo accounts with their projects.
2. **Window A:** sign in as **admin@demo.com**. Click **Users** in the top bar and keep that page open.
3. **Window B:** click **Create account**. Fill in:
   - **Name:** "Dana Demo"
   - **Email:** dana@demo.com
   - **Password:** `Password123!`
   - **Role:** **Team member**

   Then click **Create account**.
   - **Show:** Dana is signed in straight away, on an empty dashboard because she isn't in any project yet.
   - **Show:** in Window A, **Dana appears in the Users list without a refresh.**
   - **Say:** "Anyone can sign up as Project Manager, Team Member or Viewer, but never as Admin. There is exactly one admin."
4. **Window B:** log out (your name, top right → **Log out**).

---

## 3. Admin: projects and users ⭐ (2 minutes)

Window A, signed in as **admin@demo.com**:

1. **Create a project.** Go to **Projects** and click **New project** in the bottom bar.
   - **Name:** "Launch Demo"
   - **Description:** anything
   - **Managers:** tick **Ravi Kumar**

   Then click **Create project**.
2. **Edit it.** Open the project, click **Edit** (bottom bar), change the description, and save.
3. **User management.** Go to **Users**:
   - **Change a role:** set Dana's role to **Viewer**, then back to **Team member**.
   - **Try to demote Ravi to Team member.** It's **refused**, because he manages projects. A Team Member can't hold the Manager role.
   - **Deactivate and reactivate.** Click **Deactivate** on Dana, then **Reactivate**. Deactivating signs her out everywhere immediately.
   - **Optionally, create a user:** click **New user** in the bottom bar.
4. **Mention for later (part 8):** archive and delete exist on the project's Overview page. They're Admin-only, and delete asks you to type the project's name to confirm.

---

## 4. Manager: team and tasks ⭐ (2 minutes)

Window A: log out, then sign in as **pm@demo.com** (Ravi). Open **Launch Demo**.

1. **Team tab → Add to project:**
   - Search **Carol**, choose **Member**, and click **Add member**.
   - Search **Meera**, choose **Viewer**, and click **Add member**.
   - Search **Dana**, choose **Member**, and click **Add member**.
   - **Say:** "The role choices depend on the person's account role. A Viewer account can only be added as Viewer, and only an Admin can make someone a project Manager."
   - Change someone's role or remove them using the menu on their tile.
2. **Tasks tab → New task** (bottom bar). Create two tasks:
   - "Design landing page": **High** priority, assignee **Carol**, due date next week.
   - "Write release notes": assignee **Dana**.
3. **Edit a task.** Click the title "Design landing page" to open the side pane. Change the priority and click **Save changes**.
4. **Change a status.** Use the dropdown on a card.
5. **Delete a task.** Create a quick third task, click its 🗑 icon, and confirm.

---

## 5. Member and viewer views ⭐ (2 minutes)

1. **Window B:** sign in as **carol@demo.com**.
   - **Show:** **Launch Demo** is in her Projects list. On the **Dashboard**, under **My work**, she sees "Design landing page". Her bell shows "Ravi Kumar assigned you…".
   - Open the project's **Tasks** tab: she sees every task. She can move **only her own** task; the dropdown on Dana's task is disabled. There's no New task, Edit or Delete.
   - **Open her task:**
     - She **can** change the status, edit the description, and comment.
     - Title, priority and due date are **locked** (only managers can change them).
     - **Post a comment:** choose **@ Mention… → Ravi Kumar**, type "on it", and click **Comment**.
   - **Task history:** at the bottom of the pane, expand **Task history**. It shows who created the task, assigned it, changed the priority and commented, newest first.
2. **Viewer.** Log out, sign in as **meera@demo.com**, and open the same board.
   - **Show:** every detail is visible, but everything is read-only: the dropdowns are disabled and there's no comment box.

---

## 6. Real-time (§5) ⭐ (2 minutes)

Window A: **pm@demo.com**. Window B: **carol@demo.com**. Both on **Launch Demo → Tasks**.

1. **Show** the green **"Live"** dot in both top bars.
2. **Task creation.** In A, create the task "Live demo", assigned to **Carol**.
   - **Show:** it appears in B instantly. Carol gets a pop-up, and her bell gets a red badge.
3. **Status change.** In B, Carol moves "Live demo" to **In progress**.
   - **Show:** the card moves in A.
4. **Assignment.** In A, open "Live demo" and change the assignee to **Dana**.
   - **Show:** in B, Carol's status dropdown on that card becomes disabled immediately.
5. **Comment.** In A, set the assignee back to Carol and post a comment that @mentions Carol.
   - **Show:** her notification appears at once, and the comment shows up in her open task pane.
6. **Under the hood (optional).** In B's Network tab, clear the Fetch/XHR filter and click the `events?ticket=…` request, then open its **EventStream** tab. Make a change in A, and a new line appears: `task.updated`, `comment.created`, `notification.created`…

> **Why SSE?** All live traffic goes from server to browser, and every change is already a REST call. SSE is plain HTTP, so it uses the same auth and CORS setup and needs no extra library, and the browser reconnects on its own. Events are only sent **after the database commit**, so rolled-back changes are never broadcast. Recipients are computed at send time from **current** project membership: someone removed from a project stops receiving its events immediately. The stream uses a single-use, 30-second ticket because `EventSource` can't send an Authorization header.

---

## 7. Notifications (1 minute)

Window B (Carol):
1. **Click the bell:** the latest notifications, an unread badge, and **Mark all read**.
2. Click **See all notifications** (or **Notifications** in the top bar):
   - **Show:** the list is grouped by day (Today, Yesterday…), with **All** and **Unread · N** tabs.
   - **Show:** **Mark read / Mark unread** on each item, plus **Load more**.
   - **Show:** clicking an item marks it read and opens that task.
3. In A, do something to Carol's task. **Show:** the new notification appears at the top of B's list live.

---

## 8. Authorization on the server (§6) ⭐ (2 minutes)

**Terminal 2:**
```
npm run demo:api
```
It sends the calls an attacker could make by hand and prints the server's answers. Red means rejected; yellow is the 409.

| Output section | What to say |
|---|---|
| **1. Authentication** | "No token gets 401. A forged token gets 401." |
| **2. Authorization (Alice)** | "Alice is a Team Member. The UI never shows her these buttons, so we call the API **directly**. Creating a task, moving Bob's task, renaming, reassigning, deleting, or adding a manager: each is **403**, with the reason." |
| **Viewer is read-only** | "Commenting or changing a status is **403**." |
| **Admin-only** | "Even a Project Manager gets **403** for user management, archiving and the system activity log." |
| **Outsiders get 404** | "Carol isn't on Mobile App, so she gets **404**, not 403. She can't tell the project exists." |
| **Archived project** | "Read-only for everyone, managers included: **403 PROJECT_ARCHIVED**." |
| **Sign-up as Admin / bad input** | "**400**, naming each bad field." |

**The same thing in the browser (optional):**
1. In Window B, signed in as a Team Member, open Network, right-click any `tasks` request, and choose **Copy → Copy as fetch**.
2. Paste it into the **Console**. Change the method to `"POST"`, the URL to `http://localhost:4000/api/v1/projects/00000000-0000-4000-9000-000000000001/tasks`, and the body to `JSON.stringify({ title: "hack" })`. Press Enter.
3. **Show:** Network shows **403 "Only project managers can create tasks."**

**Outsider in the UI:** in Window B as **carol@demo.com**, open http://localhost:3000/projects/00000000-0000-4000-9000-000000000002 (Mobile App). It shows **"Project not found"**, and Network shows a **404**.

**Archived project in the UI:** as pm, go to Projects, set the **Status** filter to **Archived**, and open **Legacy CRM**. It shows a read-only banner, with no New task button, and the status dropdowns are disabled.

---

## 9. Concurrent updates (§7) ⭐ (2 minutes)

1. Window A: **pm@demo.com**. Window B: **admin@demo.com**. Open the **same task's** side pane in both windows.
   - **Point out** the line "**Version N** · last changed by …".
2. **Window A:** change the **Title** and click **Save changes**.
   - **Show:** "Task saved". Network shows **200** and the version is now N+1.
3. **Window B, without reloading:** change the **Description** and click **Save changes**.
   - **Show:** the warning box: **"Ravi Kumar changed this task while you were editing."** A's new title is now shown, and B's edited description is **kept** in the box.
   - **Show:** Network shows **409 VERSION_CONFLICT**. In the Response, `details.current` holds the latest task, and `yourVersion` / `currentVersion` show the mismatch.
4. **Window B:** click **Save changes** again. This deliberately re-applies the change on top of the latest version, so nothing is silently overwritten.
5. **Optional, same for projects:** open **Edit** on the project Overview in both windows and save in A, then B. B gets a conflict view offering **Use latest** or **Re-apply only my changes**.

> **How it works:** every task and project has an integer `version`, and each edit sends the version it started from. The server locks the row, compares the versions, and on a mismatch returns 409 with the latest data and the editor's name. Saves that change nothing don't bump the version. Indirect changes do bump it (for example, unassigning a removed member's tasks), so stale edits still fail. The terminal script (part 8, section **3**) shows the same 200 → 409 sequence.

---

## 10. Activity log and dashboard (1 minute)

1. **Project activity:** open the project's **Activity** tab. Everything done in this demo is listed with who did it and when, and it updates live.
2. **System activity:** as admin, click **Activity** in the top bar. It covers every project, plus user management and deleted projects.
3. **Dashboard:** click **Dashboard**. The tiles show:
   - **My work:** my open tasks; overdue ones are red.
   - **Projects:** with progress.
   - **Updates:** the unread notification count.
   - Admin also gets **Users** and **Activity** tiles.

   They all update live.
4. **Say:** "The activity log is append-only. Each entry is written in the same database transaction as the change itself, so the log can't miss a change or record one that didn't happen."

---

## 11. Under the hood (3 minutes)

**API format.** Open [API_REFERENCE.md](API_REFERENCE.md) (Ctrl+Shift+V for preview in VS Code):
- every success is `{ data }`; lists also carry `meta` (page, pageSize, total, totalPages);
- every error is `{ error: { code, message, details } }`;
- the status code table;
- the full endpoint list with who can call each one.

In DevTools, click any request and show **Headers** (`Authorization: Bearer …`), **Payload** (`version` on edits) and **Response**.

**Code layout.** In the same file, under "Code layout" and "What happens to one request", click through:
1. [tasks.routes.ts](../apps/api/src/modules/tasks/tasks.routes.ts): HTTP only, plus input validation.
2. [tasks.service.ts](../apps/api/src/modules/tasks/tasks.service.ts): row locks → permission check → version check → write, then activity, notifications and an event.
3. [tx.ts](../apps/api/src/lib/tx.ts): events are published only after commit.
4. [permissions.ts](../packages/shared/src/permissions.ts): **one rulebook**, enforced by the API and only used for hiding buttons on the web.

**Database (PostgreSQL 17).** In terminal 2, run `npm run db:studio` and open the printed link (local.drizzle.studio).
- Show the tables: users, projects, project_members, tasks, comments, notifications, activity_logs, refresh_tokens.
- Show a task's `version` before and after an edit.
- **Say:** "The schema comes from versioned SQL migrations and `npm run db:reset` rebuilds it with seed data. The database enforces rules itself:
  - an assignee must be a member of the project (a two-column foreign key);
  - emails are unique regardless of case;
  - nobody is notified about their own action;
  - passwords and refresh tokens are stored only as hashes."

**Tests.** In terminal 2, run `npm test`:
- **284 API tests** against a separate test database.
- They cover the full role × action permission matrix, 401/403/404, version conflicts and archive rules.
- They also cover token rotation and reuse detection, comments, notifications, user management, sign-up, the dashboard, and SSE delivery to the right people only.

---

## 12. Small extras (1 minute)

- **404 page:** open http://localhost:3000/anything. It shows **"Page not found"** with links home.
- **Back button between accounts:** log out and sign in as someone else, then press the browser's **Back** button. You **don't** get back into the previous user's screens.
- **Profile & password:** your name (top right) → **Profile & password**. You can edit your name and avatar and change your password; changing it signs out your other sessions. You can't change your own role or email.
- **Light/dark theme:** the sun/moon button in the top bar. It's remembered for next time.
- **Phone layout:** in DevTools, press Ctrl+Shift+M and pick a phone. The tiles stack and the top bar collapses.

---

## Likely evaluator questions

| Question | Answer |
|---|---|
| Why 404 instead of 403 for non-members? | So a user can't discover which projects exist. Members who aren't allowed to do something get 403 with a reason. |
| What if two people save at the exact same moment? | Both requests lock the row in a fixed order (project, then task). The second one waits, then sees the new version and gets 409. |
| Can a removed member still get live updates? | No. Recipients are computed per event from current membership, and every refetch is permission-checked again. |
| What happens when an account is deactivated? | Its login tokens are revoked immediately, and every API request re-reads the user, so even an unexpired access token stops working. |
| How are sessions stored? | A 15-minute access token kept in memory only. The refresh token is an httpOnly cookie, rotated on every use and stored as a hash. Reusing an old refresh token revokes the whole login. |
| Where are the docs? | [README](../README.md), [ARCHITECTURE](ARCHITECTURE.md), [API_REFERENCE](API_REFERENCE.md), [API_DESIGN](API_DESIGN.md), [DATA_MODEL](DATA_MODEL.md) |

---

## If something goes wrong

| Problem | Fix |
|---|---|
| "Project not found" on a page that should work | The data was reset while the page was open: reload |
| "Live" dot is red | Wait 3 seconds (it reconnects), or reload |
| `npm run demo:api` can't reach the API | Start `npm run dev` first |
| Port 3000/4000 already in use | An old `npm run dev` is still running: Ctrl+C it, or `taskkill /PID <pid> /F` (find the PID with `netstat -ano \| findstr :4000`) |
| Demo data is messy | `npm run db:reset`, then reload both windows |
| Sign-up says the email is taken | Use a different email, or reset the data |
