## Assumptions

- `slots` limits creator approvals, not applications.
- Approval reserves the agreed creator fee. The creator fee becomes immutable after the first creator is selected.
- Campaign edits cannot reduce slots below selected creators or budget below committed funds.
- Cancellation stops discovery, rejects pending applications and blocks further approvals. Selected creators may still submit, be reviewed and receive payment. When no selected work remains unresolved, the campaign becomes completed and stays in read-only history.
- A creator may withdraw before their first deliverable submission. If already selected, the reservation and slot are released.
- Final deliverable rejection releases the reserved money but preserves the selection in campaign history.
- TDS is 1% of the gross agreed creator fee. GST is 18% of the 10% platform fee.
- The wallet is credited only after deliverable approval. Failed withdrawals restore the complete held amount.
- Notification quiet hours are 9 PM through 9 AM in Asia/Kolkata. Jobs created then are scheduled for 9 AM.

## Key decisions

- MongoDB transactions keep campaign reservations, wallet balances, ledger entries and state changes atomic.
- Unique idempotency keys on ledger entries and submission-state validation prevent duplicate credits.
- Wallet balance snapshots and immutable ledger records are separate collections so the current balance is quick to read and every movement remains auditable.
- Mock payout outcomes are selectable rather than random, making success and failure easy to demonstrate and test.
- Notifications use a database-backed queue. A worker claims due jobs and records mock delivery status.
- The dashboards prioritize one-page workflows and inline validation over additional navigation.

## Reducing friction

Instead of copying a multi-step and less transparent campaign flow, I focused on a smaller one-page workflow with visible budgets, clear statuses and fewer navigation steps.

Ideas I implemented:

- One-page campaign creation and editing.
- Available, reserved and paid budget visibility before approving creators.
- Estimated creator take-home before applying.
- Clear selected, active, paid and rejected collaboration counts.
- Inline revision feedback and remaining revision count.
- Auditable wallet ledger and withdrawal history.
- Permanent read-only history for completed and cancelled campaigns.

## Known gaps

- Email, WhatsApp, Instagram validation and payout-provider calls are mocked.
- The notification worker uses process polling rather than a dedicated production queue system.
- Authentication is assignment-grade: there is no email verification, password reset, rate limiting, CSRF token or account recovery.
- Instagram URLs are format-checked but ownership and published content are not verified.
- There is no file upload, messaging, search, pagination or admin console.
- Currency uses rounded decimal rupee values for assignment readability; a production payment system should use integer minor units or a decimal type.
- Deployment configuration is intentionally environment-agnostic and no production infrastructure is bundled.

## AI Prompts

1. **PRD analysis** — “Go through the PRD file and tell me how we can proceed further.”
   - Broke the brief into a plan and identified the risky areas: transactional reservations, workflow transitions, wallet accounting and notification scheduling.

2. **Day 1 implementation** — “Use Mongoose to access MongoDB, TypeScript, Node, Express, React, Next and Tailwind.”
   - Added role-based cookie authentication, campaigns, discovery, applications and transactional approval/reservation logic.

3. **Day 2 implementation** — “Complete the features, including the deliverable workflow, wallet, payouts and notifications.”
   - Added deliverables, two-revision enforcement, final rejection, payout calculations, wallet ledger, controllable withdrawal outcomes and queued notifications.

4. **Currency decision** — “Change all paise-related fields because I want the application to use rupees”
   - Renamed API/model/UI fields to rupees and consistently rounded monetary operations to two decimals.

5. **Debugging and validation**
   - Fixed local CORS across development ports.
   - Kept sessions across tabs with HTTP-only cookies.
   - Fixed Mongoose transactional array creation by using `ordered: true`.
   - Replaced raw API failures with inline campaign, submission, feedback and withdrawal errors.
   - Corrected approved/paid/rejected counters and campaign budget presentation.

6. **Dashboard polish**
   - Added constrained scrolling for campaign, collaboration, wallet, withdrawal and history sections.
   - Added separate selected, active, paid and rejected collaboration statistics.

7. **Day 3 completion** — “Complete campaign editing and cancellation, automated tests, repository cleanup and final polish.”
   - Added safe campaign editing, cancellation and completion states, read-only campaign history, automated integration tests, demo data and repository cleanup.

## Tests for the Three Riskiest Parts

1. **Budget and Slot Reservation**
   - Tested concurrent creator approvals to ensure campaigns cannot exceed available slots or budget. Only one approval succeeds when one slot remains.

2. **Payout and Wallet Accounting**
   - Verified payout calculations, duplicate-payment prevention and wallet ledger entries. Confirmed that failed withdrawals restore the creator’s balance.

3. **Workflow and Notifications**
   - Tested revision limits, role-based authorization, campaign cancellation and selected-creator continuity. Verified that quiet-hour notifications wait until 9 AM IST and respect channel preferences.
