# Backend tour in PowerShell: every API area, plus the 401/403/404/400/409 failures.
# Needs the API running (npm run dev). Run it all:  powershell -ExecutionPolicy Bypass -File scriptsackend-tour.ps1
# or paste it section by section into a PowerShell window. It creates a throwaway project and deletes it at the end.

$API = "http://localhost:4000/api/v1"

function Call($Method, $Path, $Token, $Body) {
  $headers = @{}
  if ($Token) { $headers.Authorization = "Bearer $Token" }
  $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 10 } else { $null }
  try {
    $r = Invoke-WebRequest -Uri "$API$Path" -Method $Method -Headers $headers -Body $json -ContentType 'application/json' -UseBasicParsing
    Write-Host "$($r.StatusCode) $Method $Path" -ForegroundColor Green
    if ($r.Content) { return ($r.Content | ConvertFrom-Json) }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "$code $Method $Path" -ForegroundColor Red
    Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
  }
}
function Login($Email) { (Call POST /auth/login $null @{ email = $Email; password = 'Password123!' }).data.accessToken }

# --- 1. health + login
(Call GET /health).data | Format-List
$admin = Login admin@demo.com
$pm    = Login pm@demo.com
$alice = Login alice@demo.com
$carol = Login carol@demo.com
$meera = Login meera@demo.com
(Call GET /auth/me $alice).data | Format-List

# --- 2. read
$projects = (Call GET "/projects" $pm).data
$projects | Select-Object name, status, myRole, version | Format-Table
$web = ($projects | Where-Object name -eq 'Website Revamp').id
(Call GET "/projects/$web/members" $pm).data | ForEach-Object { [pscustomobject]@{ name = $_.user.name; role = $_.role; openTasks = $_.openTaskCount } } | Format-Table
(Call GET "/projects/$web/tasks?pageSize=50" $pm).data | Select-Object title, status, priority, version, @{n='assignee';e={$_.assignee.name}} | Format-Table

# --- 3. create
$proj = (Call POST /projects $admin @{ name = "PS Demo $(Get-Random)"; description = 'Created from PowerShell'; managerIds = @('00000000-0000-4000-8000-000000000002') }).data
$proj | Select-Object id, name, version | Format-Table
Call POST "/projects/$($proj.id)/members" $pm @{ userId = '00000000-0000-4000-8000-000000000007'; role = 'MEMBER' } | Out-Null
Call POST "/projects/$($proj.id)/members" $pm @{ userId = '00000000-0000-4000-8000-000000000008'; role = 'VIEWER' } | Out-Null
$task = (Call POST "/projects/$($proj.id)/tasks" $pm @{ title = 'Task from PowerShell'; priority = 'HIGH'; assigneeId = '00000000-0000-4000-8000-000000000007'; dueDate = '2026-12-31' }).data
$task | Select-Object id, title, status, version | Format-Table
$comment = (Call POST "/tasks/$($task.id)/comments" $carol @{ body = 'On it @[Ravi Kumar](00000000-0000-4000-8000-000000000002)' }).data

# --- 4. update
$task = (Call PATCH "/tasks/$($task.id)/status" $carol @{ version = $task.version; status = 'IN_PROGRESS' }).data
$task | Select-Object title, status, version | Format-Table
$task = (Call PATCH "/tasks/$($task.id)" $pm @{ version = $task.version; priority = 'URGENT' }).data
$task | Select-Object title, priority, version | Format-Table
$proj = (Call PATCH "/projects/$($proj.id)" $pm @{ version = $proj.version; description = 'Edited' }).data

# --- 5. 401 / 403 / 404 / 400
Call GET /projects
Call GET /projects 'forged.token.value'
Call POST "/projects/$($proj.id)/tasks" $carol @{ title = 'Sneaky' }
Call DELETE "/tasks/$($task.id)" $carol
Call POST "/tasks/$($task.id)/comments" $meera @{ body = 'viewer comment' }
Call POST /users $pm @{ name = 'X'; email = 'x@demo.com'; password = 'Password123!'; role = 'ADMIN' }
Call GET "/projects/00000000-0000-4000-9000-000000000002" $carol
Call POST "/projects/00000000-0000-4000-9000-000000000003/tasks" $pm @{ title = 'In archived' }
Call POST "/projects/$($proj.id)/tasks" $pm @{ title = ''; dueDate = 'tomorrow' }
Call POST /auth/register $null @{ name = 'Mallory'; email = 'mallory@demo.com'; password = 'Password123!'; role = 'ADMIN' }

# --- 6. 409
$v = $task.version
$a = (Call PATCH "/tasks/$($task.id)" $pm @{ version = $v; title = 'Edited by A' }).data
"A saved: version $v -> $($a.version)"
Call PATCH "/tasks/$($task.id)" $admin @{ version = $v; title = 'Edited by B' }

# --- 7. activity, notifications, dashboard, me
(Call GET "/tasks/$($task.id)/activity" $pm).data | Select-Object action, @{n='by';e={$_.actor.name}}, createdAt | Format-Table
(Call GET "/projects/$($proj.id)/activity" $pm).data | Select-Object action, @{n='by';e={$_.actor.name}} | Format-Table
$n = Call GET /notifications $carol
"Carol unread: $($n.unreadCount)"
$n.data | Select-Object type, @{n='from';e={$_.actor.name}}, readAt | Format-Table
Call POST /notifications/read-all $carol
(Call GET /dashboard $pm).data.myTasks | Format-List
(Call GET /dashboard $admin).data.system | Format-List
(Call GET /me $carol).data | Format-List

# --- 8. delete
Call DELETE "/comments/$($comment.id)" $carol
Call DELETE "/tasks/$($task.id)" $pm
Call POST "/projects/$($proj.id)/archive" $admin | Out-Null
Call DELETE "/projects/$($proj.id)" $admin
