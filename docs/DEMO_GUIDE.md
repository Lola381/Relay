# Demo Guide: Security, Conflicts and Real-Time

A step-by-step script for showing the evaluator these requirements:
- **§5 Real-time collaboration**
- **§6 Server-side authorization**
- **§7 Concurrent updates**

Every demo account uses the password **`Password123!`**.

| Account | Role | Projects |
|---|---|---|
| admin@demo.com | Admin | everything |
| pm@demo.com (Ravi) | Project Manager | manages Website Revamp, Mobile App, Legacy CRM (archived) |
| alice@demo.com | Team Member | Website Revamp, Legacy CRM |
| bob@demo.com | Team Member | Website Revamp, Mobile App |
| carol@demo.com | Team Member | Website Revamp only |
| viewer@demo.com (Vikram) | Viewer | Website Revamp (read-only) |

---

## 0. Setup (before the evaluator arrives, about 2 minutes)

1. **Stop any old servers.** Press Ctrl+C in any terminal still running `npm run dev`.
2. **Reset the demo data**, in terminal 1:
   ```
   npm run db:reset
   npm run dev
   ```
   Wait for `API listening on http://localhost:4000` and `Ready` from the web app.
3. **Keep a second terminal open** in the project folder. You'll use it for `npm run demo:api`.
4. **Open two browser windows side by side:**
   - **Window A:** a normal Edge or Chrome window, at http://localhost:3000.
   - **Window B:** a private (InPrivate or Incognito) window, at http://localhost:3000. It needs to be private so it can hold a separate login.
5. **Open developer tools in both windows.** Press F12, open the **Network** tab, click **Fetch/XHR**, and tick **Preserve log**.

> Two ways to show each point:
> - **Terminal (part 1):** one command shows every rejection, plainly and in one go.
> - **Browser (part 2):** shows the same rules from a user's point of view.
>
> Start with the terminal, then confirm in the browser.

---

## Part 1: Everything in one command (about 3 minutes)

In terminal 2, run:
```
npm run demo:api
```

Talk through the output section by section. Red lines are rejected calls and the yellow line is the 409.

| Section of the output | What to say |
|---|---|
| **1. Authentication** | "No token gets 401, and a forged token gets 401. Every API call needs a valid, signed token." |
| **2. Authorization** (Alice) | "Alice is a Team Member. The app hides these buttons from her, but here we call the API directly, as an attacker would. The server refuses each call with **403** and gives the reason." |
| **Viewer is read-only** | "Viewers can't comment or change anything: **403**." |
| **Admin-only actions** | "Even a Project Manager gets **403** for user management, archiving and the site-wide activity log." |
| **Outsiders get 404** | "Carol isn't on Mobile App. She gets **404**, not 403, so she can't even tell the project exists." |
| **Archived project** | "Archived projects are read-only for everyone, managers included: **403 PROJECT_ARCHIVED**." |
| **Sign-up as Admin / invalid input** | "Bad input gets **400**, naming each bad field. Nobody can sign up as Admin." |
| **3. Concurrent updates** | "Both users opened the task at version 3. A saves first, so the version becomes 4. B saves using version 3 and gets **409 VERSION_CONFLICT**, naming who changed it and including the latest data. B's change is **not** applied." |
| **4. Real-time** | "Alice's live connection (SSE) received the status change, the comment and her notifications the moment they were saved." |

---

## Part 2: The same rules in the app

### Step 1: Sign-in required (401)
1. In **Window B**, type http://localhost:3000/dashboard without signing in.
2. **Show:** the app sends you to the sign-in page.
3. **Optional:** in Network, the call to `refresh` returns **204**, meaning there's no saved login.

### Step 2: Real-time (§5)
1. **Window A:** sign in as **pm@demo.com**, then open **Projects → Website Revamp → Tasks**.
2. **Window B:** sign in as **alice@demo.com** and open the same page.
3. **Show** the green **"Live"** dot in both top bars.
4. **Task creation.** In A, click **New task** (bottom bar). Enter the title "Demo task", choose assignee **Alice Fernandes**, and click **Create task**.
   - **Show:** the task appears in B with no refresh.
   - **Show:** Alice gets a pop-up notification, and her **bell** gets a red badge.
5. **Status change.** In B, Alice changes "Demo task" to **In progress** using the dropdown on its card.
   - **Show:** the card moves in A as well.
6. **Assignment.** In A, click the title "Demo task" to open the side pane, and change **Assignee** to **Bob Mathew**.
   - **Show:** B updates. Alice can no longer change its status, because it isn't hers any more.
7. **Comment.** In A, change the assignee back to Alice. Then, at the bottom of the pane:
   - Choose **@ Mention… → Alice Fernandes**.
   - Type "please check this", and click **Comment**.
   - **Show:** Alice's bell says "Ravi Kumar mentioned you on 'Demo task'". Clicking the notification opens the task with the comment.
8. **Under the hood (optional).** In B's Network tab, clear the filter and click the `events?ticket=…` request, then open its **EventStream** tab. Make another change in A: a new line appears in B, for example `task.updated` or `comment.created`.

> **Why SSE?** Live traffic only goes from server to browser, and every change is already a normal API call. SSE is plain HTTP, so it uses the same authentication and CORS setup, and the browser reconnects on its own. Events are only sent after the change is saved to the database. Recipients are worked out at send time from current project membership.

### Step 3: Permissions in the UI, enforced by the server (§6)
1. **Window B (Alice, Team Member)** on the Website Revamp board:
   - There's no **New task** button and no Edit, Archive or Delete buttons.
   - The status dropdown is **disabled** on Bob's tasks; she can only move her own.
   - In a task pane, the title, priority and due date are locked, but she can edit the description of her own task.
2. **Viewer.** Sign B out (avatar → Log out), then sign in as **viewer@demo.com** and open the same board.
   - Everything is read-only: the status dropdowns are disabled and there's no comment box. Clicking a task still shows all its details.
3. **Outsider gets 404.** Sign B in as **carol@demo.com**, then open http://localhost:3000/projects/00000000-0000-4000-9000-000000000002 (Mobile App).
   - **Show:** "Project not found". In Network, the call returns **404**.
4. **Archived project.** In A (pm), go to **Projects**, set the **Status** filter to **Archived**, and open **Legacy CRM**.
   - **Show:** the "Archived project" read-only banner. There's no New task button, and on the Tasks tab every status dropdown is disabled.
5. **Proving it's the server and not just hidden buttons** (this is what the `demo:api` script does). To show one call by hand:
   - **Copy a request as Alice.** In B, signed in as Alice, open Network, right-click any `tasks` request, and choose **Copy → Copy as fetch**.
   - **Edit it.** Paste it into the **Console** tab. Change the method to `"POST"`, the URL to `.../api/v1/projects/00000000-0000-4000-9000-000000000001/tasks`, and the body to `JSON.stringify({ title: "hack" })`. Press Enter.
   - **Show:** in Network, the response is **403 "Only project managers can create tasks."**

### Step 4: Concurrent updates and the 409 (§7)
1. Sign **A in as pm@demo.com** and **B in as admin@demo.com**. Open Website Revamp → Tasks in both.
2. In **both windows**, click the **same task title** to open its side pane. Point out the line **"Version N · last changed by …"** at the bottom of the details.
3. **Window A:** change the **Title** (for example, add " v2") and click **Save changes**.
   - **Show:** "Task saved". In Network, the PATCH returns **200** and the version goes up by 1.
4. **Window B:** without reloading, change the **Description** and click **Save changes**.
   - **Show:** a warning box: **"Ravi Kumar changed this task while you were editing."** The latest title from A is now shown, and B's edited description is still in the box.
   - **Show:** in Network, the PATCH returns **409 VERSION_CONFLICT**. In its Response, `details.current` is the latest task, and `yourVersion` / `currentVersion` show the mismatch.
5. **Window B:** click **Save changes** again. This saves on purpose over the latest version, so nothing is silently overwritten.
6. **Optional, same for projects:** open **Edit** on the project's Overview in both windows and save in A, then in B.
   - **Show:** B gets the conflict view, offering **Use latest** or **Re-apply only my changes**.

---

## If something goes wrong
| Problem | Fix |
|---|---|
| "Project not found" on a page that should work | Data was reset while the page was open, or the server restarted: reload the page |
| The "Live" dot is red | Wait 3 seconds (it reconnects), or reload |
| `npm run demo:api` says it can't reach the API | Start `npm run dev` first |
| Port 3000/4000 already in use | An old `npm run dev` is still running: Ctrl+C it, or `taskkill /PID <pid> /F` |
| The demo data is messy | `npm run db:reset`, then reload both windows |

## Backup: the automated proof
`npm test` runs **265 API tests** against a separate test database. They cover:
- the full role × action permission matrix;
- 401, 403 and 404 behaviour;
- version conflicts;
- archive rules;
- token rotation.
