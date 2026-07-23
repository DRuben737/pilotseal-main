# PilotSeal Button Guide (Internal Draft)

This guide is intentionally not published in the PilotSeal navigation. It is a fast reference: search for the task, page, field, or button name you see on screen.

## Quick Q&A: What Do You Want to Do?

| I want to… | Go to | Use |
|---|---|---|
| Sign in | Login | **Sign in** |
| Reset my password | Login | **Forgot password?** |
| Change my profile, medical, or certificate information | Dashboard → Account | The matching **Save** button |
| Add a personal aircraft | Dashboard → My Aircraft | **Add aircraft** |
| Open a tool with an aircraft selected | Tools | Select the aircraft, then open the tool |
| Save a person I work with | Dashboard → People | **Add person** |
| Create an endorsement | Tools → Endorsement Generator | **Generate endorsement** |
| Find an endorsement record | Dashboard → Records | **Open** on the record |
| Create a Flight Brief | Tools → Flight Brief | Complete the brief, then **Finalize brief** |
| Find a finalized Preflight Record | Dashboard → Records | **Open record** |
| Read or clear notifications | Dashboard → Notifications | Open a notification or use **Mark all as read** |
| Control which reminders I receive | Dashboard → Notifications | Notification preferences and **Save preferences** |
| Switch organizations | Dashboard header | **Current organization** selector |
| Add an existing user to my organization | Dashboard → Organization → Members | **Add member** |
| Add someone who has not registered yet | Dashboard → Organization → People and members | **Add person**; the roster entry remains Pending |
| Link my new account to an organization that already listed me | Dashboard or Dashboard → Account → Organization access | **Join organization** |
| Make a member an Organization Admin | Dashboard → Organization → Members | **Make admin**; Owner only |
| Assign Instructor or Student | Dashboard → Organization → Members | The teaching-role selector |
| Transfer organization ownership | Dashboard → Organization → Members | **Transfer ownership**; Owner only |
| Add or edit an organization aircraft | Dashboard → Organization → Aircraft | **Add aircraft** or **Edit** |
| Edit organization MX data | Dashboard → Organization → Aircraft | **Maintenance / MX** |
| Create an organization for an existing user | Dashboard → Access | **Create organization and assign Owner**; Platform Super Admin only |
| Give a Super Admin aircraft to one or more organizations | Dashboard → My Aircraft | **Organizations (number)** on a private aircraft; Platform Super Admin only |
| Grant Platform Super Admin access | Dashboard → Access | **Grant platform access**; Platform Super Admin only |
| Approve an organization endorsement-template change | Dashboard → Endorsements | **Approve** or **Reject**; Platform Super Admin only |

## Access Levels

| Level | What it means |
|---|---|
| User | Manages their own account, personal aircraft, saved people, tools, notifications, and personal records. |
| Organization Member | Can use aircraft and information made available by the selected organization. |
| Organization Admin | Manages members, teaching roles, organization aircraft, MX data, and organization records. |
| Organization Owner | Has all Organization Admin actions and can appoint admins or transfer ownership. |
| Platform Super Admin | Manages platform access, creates organizations for registered users, and approves platform-level endorsement-template changes. This role is separate from organization management. |

## Login

| Field or button | What it does | What happens next |
|---|---|---|
| **Username or email** | Identifies the registered account. | PilotSeal looks up the account without showing a person or company example. |
| **Password** | Enters the account password. | The value is hidden while typing. |
| **Sign in** | Starts an authenticated session. | A successful sign-in opens Dashboard. |
| **Forgot password?** | Starts password recovery for the entered email. | Follow the email link to choose a new password. |
| **Create account** | Opens registration. | Choose the available account type and complete the form. |

## Dashboard Navigation

| Button | Who sees it | What it does |
|---|---|---|
| **Overview** | Signed-in users | Returns to the Dashboard summary. |
| **My Aircraft** | Signed-in users | Opens personal, shared, and available organization-aircraft views. |
| **People** | Signed-in users | Opens saved students, instructors, and other contacts. |
| **Records** | Signed-in users | Opens endorsement and finalized Preflight records the user is allowed to see. |
| **Notifications** | Signed-in users | Opens the unified inbox and notification preferences. |
| **Account** | Signed-in users | Opens profile, medical, certificate, password, and account controls. |
| **Organization** | Organization members; management controls depend on role | Opens the selected organization. |
| **Aircraft** | Platform Super Admin | Opens platform-wide shared-aircraft controls. It is not the daily organization MX editor. |
| **Endorsements** | Platform Super Admin | Opens platform endorsement-template approvals and administration. |
| **Access** | Platform Super Admin | Opens platform administrators and organization creation. |
| **New** | Signed-in users | Opens the menu for starting a supported PilotSeal task. |
| **Sign out** | Signed-in users | Ends the current session on this device. |

## Organization Selector

| Control | What it does | Important detail |
|---|---|---|
| **Current organization** | Changes the active organization context. | Organization aircraft, members, and records update to the selected organization. |
| Organization name option | Selects that organization. | If access was removed, it disappears and PilotSeal falls back to another available organization. |

## My Aircraft

| Button or field | What it does | Important detail |
|---|---|---|
| **Add aircraft** | Creates a personal aircraft entry. | It does not create an organization aircraft. |
| **Save aircraft** | Saves an aircraft available to the user into their personal list. | Personal saved state does not replace organization MX data. |
| **Edit** | Opens editable aircraft fields when the user has permission. | Organization aircraft must be edited from Organization management. |
| **Organizations (number)** | Opens the organization-access checklist for a private aircraft owned by the signed-in Platform Super Admin. | Select one or more organizations. The number shows how many organizations currently have access; ownership stays with the Super Admin. |
| **Save organization access** | Replaces the selected aircraft's organization-access list with the checked organizations. | Uncheck every organization and save to remove all organization access. |
| **Delete / Remove** | Removes the selected personal entry or saved relationship. | Removing a saved aircraft does not delete the platform or organization aircraft. |
| Aircraft source label | Shows whether the aircraft is Shared, Personal, or Organization. | The same aircraft is shown once when sources overlap. |

## People

| Button or field | What it does | Important detail |
|---|---|---|
| **Add person** | Creates a personal saved-person record. | This does not add the person to an organization. |
| **Edit** | Changes the saved information. | Only the owner of the personal record can edit it. |
| **Set as default CFI** | Uses this instructor as the default where supported. | The selection can prefill instructor details in tools. |
| **Remove** | Deletes the saved-person relationship. | It does not delete the other person’s PilotSeal account. |

## Records

| Button | What it does | Important detail |
|---|---|---|
| **Open / Open record** | Opens the full saved record. | A finalized Preflight Record shows the snapshots saved at Finalize time. |
| **Revise** | Copies an eligible finalized brief into a new draft. | The original record remains unchanged. |
| Record filters | Narrows records by available student, aircraft, date, type, or status. | Access still depends on user and organization roles. |

## Notifications

| Button or control | What it does | Important detail |
|---|---|---|
| Notification row | Opens the related PilotSeal page when a destination exists. | Opening can mark it as read. |
| **Mark as read** | Clears the unread state for one notification. | The notification remains in history. |
| **Mark all as read** | Clears all currently unread notifications. | It does not delete them. |
| Preference toggle | Enables or disables that reminder category. | Security-critical messages may remain required. |
| **Save preferences** | Stores the selected notification settings. | The settings apply to the signed-in account. |

## Account

| Button | What it does | Important detail |
|---|---|---|
| Profile **Save** | Saves identity and profile fields. | Empty required fields show an inline error instead of a global popup. |
| Medical **Save** | Saves medical information used by supported reminders. | Reminder delivery follows notification preferences. |
| Certificate **Save** | Saves certificate details. | Use the displayed section for the relevant certificate. |
| **Change password** | Updates the account password. | The user must meet the password requirements shown on screen. |
| **Delete account** | Starts permanent account deletion. | An Owner must transfer every organization before deletion can continue. |

## Organization: Members

| Button or field | Who can use it | What it does |
|---|---|---|
| **Add member** | Owner or Organization Admin | Adds an already registered user by exact email. Organization Admin adds the user as Member. |
| **Add person** | Owner or Organization Admin | Adds an organization roster record by email. A verified existing account links immediately; otherwise the record remains Pending. |
| **Edit details** | Owner or Organization Admin | Changes only the organization display name, teaching role, internal ID, and organization notes. It never overwrites the user’s personal Profile. |
| **Remove** on a Pending account | Owner or Organization Admin | Archives the pending roster entry before it is linked. |
| **Make admin** | Owner | Changes a Member to Organization Admin. |
| **Remove admin** | Owner | Changes an Organization Admin back to Member. |
| Teaching-role selector | Owner or Organization Admin | Sets **Instructor**, **Student**, or no teaching role for that organization. |
| **Remove member** | Owner or Organization Admin, within role limits | Removes only the organization relationship. The user account and personal data remain. |
| **Transfer ownership** | Owner | Makes the selected member the Owner and changes the previous Owner to Organization Admin. |

An Organization Admin cannot appoint another Organization Admin, remove the Owner, or transfer ownership. The final Owner cannot be removed or downgraded without a valid transfer.

## Organization Access

| Button or status | Who sees it | What it does |
|---|---|---|
| **Available organizations** | A signed-in user whose verified email was prelisted | Shows only organizations that already added that exact email. It never exposes the global organization directory. |
| **Join organization** | The matching verified account | Links the Pending roster record, creates Member access, and applies the preassigned Student/Instructor role. |
| **Pending account** | Organization Owner/Admin | Means no verified PilotSeal account currently matches the roster email. |
| **Linked member** | Organization Owner/Admin | Means the roster entry and PilotSeal account are connected. |

If the user registered first, adding their verified email links them immediately. If the organization added the person first, the user chooses **Join organization** after registering and verifying the same email. Personal Profile data and organization-only data remain separate.

## Organization: Aircraft and MX

| Button or field | Who can use it | What it does |
|---|---|---|
| **Add aircraft** | Owner or Organization Admin | Creates an aircraft inside the selected organization. |
| **Edit** | Owner or Organization Admin | Updates organization-aircraft information. |
| **Delete** | Owner or Organization Admin | Deletes the organization aircraft after confirmation, subject to record constraints. |
| **Maintenance / MX** | Owner or Organization Admin | Opens current meter, inspection, registration, and operational-status fields. |
| **Manage MX** | Owner or Organization Admin | Edits the shared MX record for an aircraft assigned by a Platform Super Admin. Aircraft identity and W&B fields remain read-only. |
| **Save MX** | Owner or Organization Admin | Stores the current organization MX source of truth. |
| **Correct meter** | Owner or Organization Admin | Corrects or resets a meter and requires a reason for the history record. |
| **Add inspection** | Owner or Organization Admin | Adds a custom date/hour inspection definition or aircraft assignment. |

Members can read organization aircraft and MX status but cannot edit formal MX data. Finalizing an organization Flight Brief can advance the current meter through the protected workflow; it cannot change inspection due values.

An aircraft assigned by a Platform Super Admin remains owned by that Super Admin and may be available to several organizations. All authorized organizations see the same aircraft identity and MX master record. Only the Platform Super Admin can add or remove organization access.

## Flight Brief / Preflight Record

| Button or field | What it does | Important detail |
|---|---|---|
| Aircraft selector | Chooses the aircraft used for the brief. | Organization-meter updates occur only for an aircraft in the active organization. |
| **Current Hobbs/Tach** | Records the observed meter reading. | A value below the stored current reading blocks Finalize. |
| **Observed at** | Records when the meter was read. | It becomes part of meter history. |
| **Estimated Hobbs increase** | Calculates projected return meter and MX margin. | It is optional. ETE never substitutes for this value. |
| **Save draft** | Saves an editable draft. | Only the creator can see the draft. |
| **Finalize brief** | Locks the brief into a Preflight Record and saves snapshots. | Repeated clicks or retries do not advance the meter twice. |
| **Revise** | Creates a new draft from a finalized record. | The earlier version remains immutable and becomes superseded after the revision is finalized. |

An Instructor can open finalized briefs for Students in the same organization. Instructors cannot see drafts or edit a Student’s record. Organization Owners and Admins can open all finalized briefs in their organization.

## Endorsements

| Button | Who can use it | What it does |
|---|---|---|
| **Generate endorsement** | User | Creates the endorsement output from the entered information. |
| **Save record** | User; automatic where required by organization workflow | Stores the endorsement record. Organization-member generation must create a record. |
| **Edit my record** | Record owner | Updates the user-editable saved record. |
| **Submit change** | Organization manager | Sends an organization endorsement-template change for Platform Super Admin review. |
| **Approve** | Platform Super Admin | Accepts the proposed template change. |
| **Reject** | Platform Super Admin | Rejects the proposal and records the decision. |

## Platform Access

Only accounts with `profiles.role = admin` can open this page or call its protected operations.

| Button or field | What it does | Validation and result |
|---|---|---|
| **Create organization and assign Owner** | Creates an organization and assigns an existing registered user as Owner in one transaction. | Requires organization name, exact registered email, and reason. Nothing is created if any part fails. |
| **Organizations** on a private aircraft | Opens the organization-access checklist for that aircraft. | Select any number of organizations. Saving does not transfer ownership or duplicate the aircraft. |
| **Save organization access** | Replaces the aircraft’s organization-access list with the checked organizations. | Removed organizations lose future access immediately; finalized historical records remain. |
| Organization directory | Lists organizations, Owner, member count, and creation time. | It is visible only to Platform Super Admins. |
| **Grant platform access** | Changes an existing account into a Platform Super Admin. | Requires exact registered email and reason. It does not change organization roles. |
| **Revoke** | Opens the platform-access removal confirmation. | A Super Admin cannot revoke their own access. |
| **Confirm revocation** | Removes Platform Super Admin access. | Account and organization memberships stay unchanged; the final Super Admin cannot be removed. |
| **Cancel** | Closes the revocation confirmation without changes. | No access change is made. |

## Aircraft Assignments (Platform Super Admin)

This workspace lists only private aircraft owned by the signed-in Platform Super Admin. Global Shared aircraft and aircraft owned by another administrator are intentionally excluded.

| Control | What it does | Important detail |
|---|---|---|
| Search | Filters by tail number or aircraft model. | Search combines with every other active filter. |
| All models | Limits the table to one Aircraft Model. | This does not create an automatic model-wide authorization rule. |
| All organizations | Shows aircraft that currently give access to the selected organization. | Clear this filter to see the complete eligible fleet. |
| Any access status | Filters to Assigned or Unassigned aircraft. | Assigned means at least one organization currently has access. |
| Row checkbox | Selects one aircraft. | Selection remains available while paging through the current filtered result. |
| Header checkbox | Selects or clears every aircraft on the current page. | The default page size is 25. |
| **Select all filtered aircraft** | Selects the complete filtered result. | The result must contain 200 aircraft or fewer. Narrow the filters if it is larger. |
| **Manage** | Starts an Add access action for that single aircraft. | It is a shortcut; the same validation as a bulk action still applies. |
| **Add access** | Opens the organization picker and adds the selected relationships. | Existing organization access is preserved; duplicate relationships are ignored. |
| **Remove access** | Opens the organization picker and removes only the selected relationships. | Access for organizations not selected in this operation remains unchanged. |
| Organization checkbox | Includes that organization in the pending batch. | One or more organizations must be selected before Save is enabled. |
| Preview counters | Shows aircraft, organization, and maximum relationship-change counts. | The actual changed count may be lower when a relationship already has the requested state. |
| **Save** | Opens the final confirmation. | No database change occurs until the confirmation button is used. |
| **Add access** / **Remove access** in confirmation | Runs the complete batch as one transaction. | If any aircraft or organization is no longer valid, the entire batch fails with no partial changes. |
| **Cancel** | Closes the drawer or confirmation. | No access relationship is changed. |
| **Clear** | Clears the selected-aircraft set. | Filters and the current page remain unchanged. |

Batch assignment never transfers ownership, changes `private` visibility, or overwrites unrelated organization access. Every actual relationship change is written to the Audit Log.

## Search Terms

Use your editor or browser search for these terms: `aircraft`, `MX`, `Hobbs`, `Tach`, `brief`, `preflight`, `endorsement`, `member`, `Instructor`, `Student`, `Owner`, `admin`, `organization`, `notification`, `password`, `medical`, `certificate`, `Approve`, `Finalize`, or the exact button label shown on screen.
