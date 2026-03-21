# Meeting Bingo — Product, Technical, Security, and Deployment Specification

## 1. Purpose

Meeting Bingo is a secure, real-time web application for running bingo games during live meetings.

A meeting owner creates a meeting, defines bingo phrases, generates a controlled invite link, and starts one or more bingo games within that meeting. Participants join through the invite, authenticate with a nickname and password, receive a unique bingo card, and mark phrases as they are heard. The system tracks marks, phrase repetition counts, rankings, winner state, chat, and a complete event log for later export and analysis.

The implementation stack is:

* Ubuntu 24.04 LTS on Linode VPS
* Node.js current production LTS line
* Next.js with App Router for the frontend
* NestJS for API and real-time backend
* PostgreSQL as the primary database

Node’s official guidance is to use LTS for production; the Next.js App Router is the current primary routing model; NestJS explicitly separates authentication and authorization concerns; and PostgreSQL natively supports TLS-encrypted client/server connections. ([Node.js][1])

---

## 2. Product Summary

The application supports four major phases:

1. **Meeting setup**

   * Owner creates a meeting with name, scheduled start, and scheduled end.
   * Owner defines a phrase pool and game rules.
   * Owner generates one or more expiring invite links.

2. **Join and lobby**

   * Participants join only through a valid invite link.
   * Participants must register or log in with nickname + password.
   * Participants can rejoin in-progress meetings through a personal “join in progress meeting” list.

3. **Live bingo gameplay**

   * Owner starts a game within a meeting.
   * Each participant gets a unique bingo card.
   * Participants increment or decrement phrase counts on their own card.
   * First mark counts for winning; subsequent increments only count toward analytics.
   * Ranking updates in real time.
   * Winner is declared when a valid horizontal, vertical, or diagonal line is completed.

4. **Post-game analysis and export**

   * Owner can start another game in the same meeting.
   * Owner can change terms between games.
   * Owner can export event and chat data.
   * Owner is shown suggested AI analysis prompts with copy buttons.

---

## 3. Non-Goals

These are explicitly out of scope for v1:

* Anonymous participation
* Public game discovery
* Email-based invitations or recovery flows
* Audio transcription or speech recognition
* Automatic phrase detection from meeting audio
* External OAuth identity providers as the primary auth path
* Mobile native apps
* Cross-meeting social graph features
* Enterprise multi-tenant SaaS billing/admin controls

---

## 4. Core Decisions Locked In

These are now fixed requirements.

### 4.1 Identity

* Nicknames are **globally unique**.
* Authentication is based on **nickname + password**.
* A user may create meetings or join meetings through invite links.
* There is no open registration directory or public listing of games.

### 4.2 Join Policy

* Late joiners are allowed to join an in-progress meeting.
* If a game is already active when they join, they may join that game and receive a card, but they will likely be behind. This is expected behavior.

### 4.3 Win Logic

Winning is based only on whether a phrase square has been marked at least once.

Supported win patterns:

* horizontal row
* vertical column
* diagonal line only when board shape permits a meaningful diagonal rule

For v1, use a **square board only**. Default is 5x5. This avoids ambiguous diagonal behavior on non-square or even-dimension boards.

### 4.4 Phrase Count Logic

* The **first click** marks the square for win purposes.
* Additional clicks on the same square increase a repetition count for analytics only.
* Decrement reduces count to a minimum of 0.
* If count returns to 0, the square is considered unmarked again.

### 4.5 Ranking Logic

Ranking is computed by **minimum number of additional first-marks needed to complete any allowed win pattern**.

Tie-breaker:

* the player whose most recent add event completed the current closest state earlier ranks higher

This must be computed server-side.

### 4.6 Meeting/Game Lifecycle

* A meeting can contain multiple games.
* Only the owner can:

  * start a game
  * start a new game
  * extend a game or meeting
  * end a meeting early
* If the owner disconnects, the game continues.
* The meeting remains joinable/playable until meeting end time plus **5 minutes grace** unless the owner closes it earlier or extends it.

### 4.7 Chat Rate Limit

* Chat limit: **3 messages per 10 seconds per user per meeting**
* Server-enforced, not just client-enforced

### 4.8 Data Deletion

* The game owner can delete meeting/game data they own.
* Deletion behavior should support both:

  * soft delete immediately for application behavior
  * deferred hard delete through retention job

### 4.9 Threat Model

Assume:

* casual misuse by participants
* malicious participant behavior
* brute-force attempts
* token leakage attempts
* replay/spam/flood actions
* and **possible VPS compromise**

Do not rely on “the server is trusted” as the sole security boundary.

### 4.10 Deployment Script Requirement

A Python deployment script must:

* provision the app on Ubuntu 24.04 LTS
* install dependencies
* configure reverse proxy
* obtain and configure Let’s Encrypt TLS
* perform VPS hardening
* preserve root SSH and password SSH access
* be idempotent
* produce a step-by-step final status summary with pass/fail state for each step

---

## 5. Recommended Technical Architecture

## 5.1 Overall Shape

Use a single repo and a single deployment unit with clear internal boundaries:

* **Frontend**: Next.js App Router
* **Backend API**: NestJS REST API
* **Realtime**: NestJS WebSocket gateway
* **Database**: PostgreSQL
* **Background jobs**: scheduled workers inside the backend process or a companion worker process
* **Reverse proxy**: Nginx
* **TLS**: Let’s Encrypt certificates terminated at Nginx

This is simpler and more reliable for v1 than splitting into microservices.

## 5.2 Language

Use **TypeScript**, not plain JavaScript, across frontend and backend. NestJS fully supports TypeScript and is built around it. ([NestJS Documentation][2])

## 5.3 Real-Time Transport

Use WebSockets with authenticated socket sessions for:

* card updates
* ranking updates
* chat
* winner announcement
* revoke events
* meeting/game state transitions

---

## 6. Functional Requirements

## 6.1 Meeting Management

Owners can:

* create a meeting
* edit meeting metadata before start
* define start and end times
* optionally extend a meeting while it is live
* close a meeting manually
* view all games within a meeting
* delete a meeting they own

Meeting fields:

* meeting name
* scheduled start datetime
* scheduled end datetime
* actual start datetime
* actual end datetime
* grace-close duration default 5 minutes
* status

Statuses:

* `draft`
* `scheduled`
* `open`
* `in_progress`
* `ended`
* `closed`
* `deleted`

## 6.2 Invite Links

Owners can:

* generate invite links
* set expiry time
* revoke invite links
* limit invite usage optionally
* view usage count

Invite rules:

* link alone is not sufficient for access
* invite requires registration or login
* invite token stored only as a secure hash
* raw invite token never stored after creation
* expired or revoked tokens are unusable
* invite validation responses must avoid information leakage

## 6.3 Registration and Authentication

Users can:

* register with nickname + password
* log in with nickname + password
* rejoin active meetings via their personal “join in progress” list
* log out
* refresh session securely

Rules:

* nickname must be globally unique
* passwords must be hashed using Argon2id
* access tokens short-lived
* refresh tokens rotated
* session revocation supported
* cookies preferred over localStorage for browser auth

NestJS supports multiple authentication strategies, and the system should keep authentication and authorization separate by design. ([NestJS Documentation][3])

## 6.4 Join In Progress Meeting List

Each authenticated user must have a page or panel showing:

* meetings they own that are still active or joinable
* meetings they joined that are still active or joinable
* status of each
* button to re-enter directly

This list is required for drop/reconnect resilience.

Eligibility window:

* active meeting
* or ended-but-still-open during grace period
* excludes revoked memberships

## 6.5 Phrase Pool

Owner can:

* create phrase entries
* edit phrase text
* delete phrase entries before game snapshot
* create a new phrase set for a later game

Rules:

* phrases normalized for duplicate detection
* warn on duplicates or near-duplicates
* minimum phrase count enforced before game start

For a 5x5 board:

* 24 required if free square enabled
* 25 required if no free square

## 6.6 Ruleset

Ruleset fields:

* board size
* free square enabled boolean
* free square label
* win patterns enabled
* late-join behavior enabled
* chat enabled boolean
* join grace behavior
* ranking mode

v1 constraints:

* board size: 5x5 only
* win patterns: horizontal, vertical, diagonal
* free square optional
* no custom pattern editor in v1

## 6.7 Game Lifecycle

Within a meeting, owner can:

* create game definition
* start game
* close game
* start another game using same terms
* start another game using new terms

Game creation on start:

* ruleset is snapshotted
* phrase pool is snapshotted
* unique card generated for each eligible participant
* late joiners joining an active game get a fresh card based on the game snapshot

Statuses:

* `draft`
* `active`
* `won`
* `closed`
* `expired`

## 6.8 Bingo Card Behavior

Each participant’s primary screen is their own card.

Each square shows:

* phrase text
* current count
* plus button
* minus button

Behavior:

* plus increments count
* minus decrements count, min 0
* count > 0 means square is marked for win logic
* free square is auto-marked at game start if enabled
* visual distinction for marked, unmarked, and free squares

Card generation:

* one unique randomized card per participant per game
* no duplicate phrase on a single card
* card randomness should be reproducible through a stored seed

## 6.9 Winner Detection

Winner is the first participant whose card satisfies any enabled pattern:

* row
* column
* diagonal

Server behavior:

* authoritative winner detection after each valid mutation
* winner declared exactly once
* winner snapshot stored atomically
* all clients receive winner event

Display on win:

* winning nickname
* winning card with counts visible
* game-complete UI state
* owner options for next action

## 6.10 Ranking Display

Each participant sees a right-hand sidebar with:

* time since meeting start
* time until meeting end
* current ranking list
* miniature view of rank #1 player’s card
* compact chat window

Ranking entry format:

* `#1 Nickname: 1 phrase until win`
* `#2 Nickname: 3 phrases until win`

Ranking computation:

* minimum number of first-marks required to satisfy any win pattern
* tie broken by timestamp of the last add event that established current distance

## 6.11 Chat

Chat is scoped to the current meeting, optionally visible in active game context.

Features:

* send message
* receive messages live
* compact scrolling view
* owner moderation tools
* chat logging and export

Rate limit:

* max 3 messages per 10 seconds per user

Moderation:

* owner can hide messages
* owner can revoke participants
* basic anti-spam/profanity filtering recommended

---

## 7. UI Requirements

## 7.1 Participant Interface

Primary layout:

### Main area

* full-size bingo card
* large tap/click targets
* count visible per square
* visual state changes immediately after server acknowledgment
* optimistic UI allowed, but server remains authoritative

### Right sidebar

* elapsed meeting time
* remaining meeting time
* rankings
* mini card for current #1 player
* chat

### Top or footer status bar

* connection status
* current game state
* current meeting state
* “reconnecting” indicator
* revoked-access screen if permissions removed

## 7.2 Owner Interface

Owner dashboard must include:

* meeting summary
* phrase pool editor
* ruleset editor
* invite management
* participant roster
* revoke participant control
* active game control panel
* winner display
* restart/new-game controls
* export controls
* AI prompt suggestion panel
* moderation panel
* privacy and logging notices

## 7.3 Rejoin Flow UX

When a user reconnects:

* system restores current meeting/game state
* system restores card counts from server
* system restores chat history window
* system returns them to the correct active screen

---

## 8. Data Model

## 8.1 User

Fields:

* id
* nickname
* password_hash
* status
* created_at
* updated_at
* last_login_at
* deleted_at nullable

## 8.2 Meeting

Fields:

* id
* owner_user_id
* name
* scheduled_start_at
* scheduled_end_at
* actual_start_at nullable
* actual_end_at nullable
* grace_minutes default 5
* status
* created_at
* updated_at
* deleted_at nullable

## 8.3 MeetingInvite

Fields:

* id
* meeting_id
* token_hash
* expires_at
* max_uses nullable
* current_uses
* revoked_at nullable
* created_by_user_id
* created_at

## 8.4 MeetingMembership

Fields:

* id
* meeting_id
* user_id
* role (`owner`, `participant`)
* access_status (`active`, `revoked`, `left`)
* joined_at
* revoked_at nullable
* revoked_by_user_id nullable
* deleted_at nullable

## 8.5 PhraseSet

Fields:

* id
* meeting_id
* name
* created_by_user_id
* created_at
* updated_at
* deleted_at nullable

## 8.6 Phrase

Fields:

* id
* phrase_set_id
* text
* normalized_text
* is_active
* created_at
* updated_at
* deleted_at nullable

## 8.7 Ruleset

Fields:

* id
* meeting_id
* name
* board_rows
* board_cols
* free_square_enabled
* free_square_label
* horizontal_enabled
* vertical_enabled
* diagonal_enabled
* late_join_enabled
* created_at
* updated_at

## 8.8 Game

Fields:

* id
* meeting_id
* created_by_user_id
* phrase_set_snapshot_json
* ruleset_snapshot_json
* status
* started_at
* ended_at nullable
* winner_user_id nullable
* winning_card_snapshot_json nullable
* created_at
* updated_at

## 8.9 GameCard

Fields:

* id
* game_id
* user_id
* card_seed
* generated_at
* updated_at

## 8.10 CardCell

Fields:

* id
* game_card_id
* row_index
* col_index
* phrase_text
* phrase_key
* is_free_square
* current_count
* created_at
* updated_at

## 8.11 PhraseMarkEvent

Immutable append-only event table.

Fields:

* id
* game_id
* game_card_id
* user_id
* card_cell_id
* delta (`+1`, `-1`)
* resulting_count
* occurred_at
* client_event_id
* request_id
* session_id
* ip_hash optional

## 8.12 ChatMessage

Fields:

* id
* meeting_id
* game_id nullable
* user_id
* nickname_snapshot
* message_text
* moderation_status
* created_at
* edited_at nullable
* hidden_at nullable
* hidden_by_user_id nullable

## 8.13 AuditEvent

Fields:

* id
* actor_user_id nullable
* entity_type
* entity_id
* action
* metadata_json
* occurred_at

## 8.14 ExportJob

Fields:

* id
* meeting_id
* requested_by_user_id
* export_type
* status
* file_path
* created_at
* expires_at
* completed_at nullable
* failed_at nullable
* error_message nullable

---

## 9. Source of Truth and State Model

The source of truth for gameplay must be:

1. immutable mark events
2. derived card state computed from those events

Do not make the mutable card row the sole source of truth. It should be a projection/cache for fast reads.

Reason:

* replayability
* auditability
* dispute handling
* analytics
* deterministic export

---

## 10. API Requirements

## 10.1 Auth

* `POST /auth/register`
* `POST /auth/login`
* `POST /auth/logout`
* `POST /auth/refresh`
* `GET /auth/me`

## 10.2 Meetings

* `POST /meetings`
* `GET /meetings/:meetingId`
* `PATCH /meetings/:meetingId`
* `POST /meetings/:meetingId/extend`
* `POST /meetings/:meetingId/close`
* `DELETE /meetings/:meetingId`

## 10.3 Join In Progress

* `GET /me/meetings/in-progress`

## 10.4 Invites

* `POST /meetings/:meetingId/invites`
* `GET /invites/:token/validate`
* `POST /invites/:token/join`
* `POST /meetings/:meetingId/invites/:inviteId/revoke`

## 10.5 Phrase Sets and Rulesets

* `POST /meetings/:meetingId/phrase-sets`
* `PATCH /phrase-sets/:phraseSetId`
* `DELETE /phrase-sets/:phraseSetId`
* `POST /phrase-sets/:phraseSetId/phrases`
* `PATCH /phrases/:phraseId`
* `DELETE /phrases/:phraseId`
* `POST /meetings/:meetingId/rulesets`
* `PATCH /rulesets/:rulesetId`

## 10.6 Games

* `POST /meetings/:meetingId/games`
* `POST /games/:gameId/start`
* `POST /games/:gameId/close`
* `GET /games/:gameId`
* `GET /games/:gameId/cards/me`
* `GET /games/:gameId/rankings`

## 10.7 Gameplay

* `POST /games/:gameId/cards/me/cells/:cellId/increment`
* `POST /games/:gameId/cards/me/cells/:cellId/decrement`

## 10.8 Chat

* `GET /meetings/:meetingId/chat`
* `POST /meetings/:meetingId/chat`
* `POST /chat/:messageId/hide`

## 10.9 Membership

* `GET /meetings/:meetingId/participants`
* `POST /meetings/:meetingId/participants/:userId/revoke`

## 10.10 Export

* `POST /meetings/:meetingId/exports`
* `GET /exports/:exportId`
* `GET /meetings/:meetingId/analysis-prompts`

---

## 11. WebSocket Events

Use authenticated sockets and re-check authorization for every privileged event.

Server events:

* `meeting.updated`
* `meeting.extended`
* `meeting.closed`
* `game.started`
* `game.updated`
* `card.updated`
* `ranking.updated`
* `chat.created`
* `chat.hidden`
* `game.won`
* `participant.revoked`
* `session.invalidated`

Client events:

* `card.increment`
* `card.decrement`
* `chat.send`
* `presence.ping`

---

## 12. Concurrency and Consistency Requirements

This is where most weak implementations fail.

### 12.1 Server Authoritative Writes

All gameplay writes must be:

* validated server-side
* applied transactionally
* sequenced by database commit order

### 12.2 Winner Race Prevention

When multiple participants could theoretically complete a win simultaneously:

* use a DB transaction
* lock the game row or use equivalent concurrency control
* allow only one winner record to be written

### 12.3 Idempotency

Gameplay and chat mutations should carry:

* `client_event_id`
* request timestamp
* auth/session context

Server should reject or ignore exact duplicates.

### 12.4 Replay Protection

Prevent repeated resubmission of the same event from:

* network retries
* browser double-clicks
* malicious automation

### 12.5 Clock Authority

Server time is authoritative for:

* winner order
* ranking tie-breakers
* meeting/game timers
* invite expiry

---

## 13. Security Specification

## 13.1 Authentication Security

* Argon2id password hashing
* strong password policy
* JWT access tokens short-lived
* refresh token rotation
* session invalidation on logout/revocation
* secure, HttpOnly cookies preferred
* anti-enumeration auth errors

## 13.2 Authorization Security

* meeting-scoped access checks on every route and socket action
* owner-only enforcement for invite management, revoke actions, exports, meeting extension, meeting close, and new game start
* revoked users instantly blocked from future actions
* reauthorization on reconnect

## 13.3 Transport Security

* HTTPS only
* HSTS enabled
* secure cookies only
* WSS only for WebSockets
* PostgreSQL connection over TLS

PostgreSQL explicitly supports SSL/TLS for encrypted client/server communications. ([PostgreSQL][4])

## 13.4 Secrets Management

* no secrets in repo
* environment files only on server
* support encrypted secret storage where practical
* database credentials rotated periodically
* raw invite tokens never persisted
* export files stored outside public web root

## 13.5 Abuse Controls

* login rate limiting
* registration rate limiting
* invite validation rate limiting
* gameplay action throttling
* chat rate limit 3 messages per 10 seconds
* spam/profanity heuristics
* duplicate submission protection
* CSRF protection if cookie auth is used
* CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy headers
* audit logging for privileged actions

## 13.6 VPS Compromise Assumption

Because VPS compromise is in-scope, the system should minimize blast radius:

* run app as non-root service user
* isolate secrets by file permissions
* restrict database access to localhost/private interface
* use least-privilege DB user for app
* encrypt backups
* hash IPs in logs where possible
* keep audit logs append-only where feasible
* separate deploy and runtime users if practical

Root SSH and password SSH must remain enabled per requirement, so compensating controls must include:

* strong root password expectations
* fail2ban or equivalent for SSH abuse detection
* firewalling
* package updates
* SSH login logging and alertable auth failure logs
* non-root app runtime
* service confinement where practical

## 13.7 Privacy and Warning Language

These warnings must appear visibly in relevant screens.

### Chat warning

> Do not post confidential, personal, regulated, privileged, or other non-public information in chat. Chat messages are logged and may be exported by the meeting owner.

### Gameplay warning

> Phrase selections, counts, timestamps, and participation activity are logged for gameplay, ranking, analytics, and export.

### Admin warning

> You are responsible for any data entered into this meeting, including phrase lists, chat, participant access decisions, exports, and downstream AI analysis. Do not use this system for confidential, personal, regulated, or restricted information.

### Export warning

> Exports may contain participant nicknames, timestamps, chat records, gameplay events, rankings, and winning card data. Handle exports as controlled records.

### Registration notice

> Your nickname, authentication activity, meeting participation, chat messages, and gameplay actions may be stored to operate the service, enforce security, and generate meeting/game exports for the meeting owner.

### Invite/join notice

> Access to a meeting is controlled by invite and account authentication. Meeting owners can revoke access at any time.

### Rejoin notice

> In-progress meetings may appear in your rejoin list while they remain active or within the post-end grace period.

---

## 14. Export Specification

Owner-only capability.

Supported export formats:

* JSON
* CSV bundle
* ZIP containing structured exports

Export contents:

* meeting metadata
* meeting owner
* phrase sets
* ruleset snapshots
* participant roster and status
* card assignments
* card layouts
* mark event log
* derived final card states
* winner metadata
* ranking snapshots if captured
* chat transcript
* audit events relevant to meeting
* timestamps in UTC

Export delivery:

* async export job
* downloadable for limited time
* owner authentication required
* file removed after expiry

---

## 15. AI Prompt Suggestion Feature

Owner sees a panel of suggested prompts after a game or meeting ends.

Each prompt must include:

* copy button
* plain text body
* optional placeholder substitutions

Suggested prompts:

1. **Winner path**
   “Analyze this Meeting Bingo export and explain exactly how the winner won, including the completed line, event order, and phrase sequence.”

2. **Phrase frequency**
   “Identify the most frequently reported phrases in this meeting and show which phrases repeated far more than the rest.”

3. **Player behavior**
   “Compare participants by marking behavior, responsiveness, aggressiveness, and possible over-reporting or under-reporting.”

4. **Timeline**
   “Construct a time-based narrative of the meeting using phrase marks and chat activity. Highlight topic shifts and bursts of repetition.”

5. **Phrase clustering**
   “Find which phrases tended to appear near each other in time and propose likely thematic clusters.”

6. **Card fairness**
   “Evaluate whether the card generation and phrase distribution produced any materially easier or harder cards.”

7. **Rhetorical signals**
   “Infer dominant rhetorical habits in the meeting from the phrase marks and chat transcript.”

8. **Anomaly detection**
   “Identify suspicious or anomalous participant behavior, including spam-like marking or improbable chat/gameplay timing.”

9. **Next game optimization**
   “Propose a stronger phrase list for a future game based on what actually happened in this meeting.”

10. **Social dynamics**
    “Analyze the chat and gameplay for leadership patterns, humor, convergence, confusion, and dissent.”

---

## 16. Operational Requirements

## 16.1 Logging

Maintain:

* application logs
* auth logs
* audit logs
* deployment logs
* reverse proxy logs
* system service logs

Logs should be structured JSON where practical.

## 16.2 Monitoring

Provide:

* health endpoint
* readiness endpoint
* database connectivity check
* websocket heartbeat health
* disk usage warning
* TLS certificate expiry warning
* backup status reporting

## 16.3 Backups

Required:

* PostgreSQL backups
* export retention policy
* encrypted backup storage
* restore procedure documented
* backup job verification

## 16.4 Retention

Default recommendations:

* gameplay and chat retained until owner deletes
* delete action performs soft delete immediately
* scheduled hard delete after retention delay unless configured otherwise
* audit trail retained longer than gameplay data where operationally needed

---

## 17. Deployment Automation Specification

A Python deployment script is required.

## 17.1 Goals

* low-touch deployment
* idempotent
* safe to rerun
* clear final status summary
* no destructive reset unless explicitly requested by a flag

## 17.2 Responsibilities

The deployment script must:

1. validate environment
2. install system packages
3. install Node.js LTS
4. install PostgreSQL client tools as needed
5. install Nginx
6. install Certbot / Let’s Encrypt tooling
7. create application directories
8. create non-root service user for app runtime
9. create/update environment files
10. install app dependencies
11. build frontend/backend
12. run database migrations
13. configure systemd services
14. configure Nginx reverse proxy
15. obtain/renew TLS certificates
16. configure firewall
17. apply hardening tasks except preserving root SSH and password SSH
18. configure log rotation
19. configure backup job stubs or actual jobs
20. run post-deploy health checks
21. print a full step breakdown with pass/fail and error detail

## 17.3 Idempotency Requirements

Each step must:

* detect prior completion
* skip or update safely
* avoid duplicate service definitions
* avoid duplicate cron/systemd timer entries
* avoid duplicate firewall rules
* safely reissue certificate setup only when needed

## 17.4 Required Final Report

At the end, print:

* step name
* status (`PASS`, `SKIP`, `FAIL`)
* short message
* remediation note if failed

Example sections:

* OS validation
* package installation
* Node install
* app build
* DB migration
* Nginx config
* TLS config
* firewall config
* hardening tasks
* service start
* health checks

## 17.5 Hardening Tasks

The script should apply reasonable hardening while leaving root/password SSH intact.

Include:

* unattended security updates where acceptable
* UFW or nftables rules
* fail2ban for SSH and optionally Nginx
* restrictive file permissions
* disable unnecessary services
* journald/log retention configuration
* Nginx hardening headers
* service user isolation
* systemd hardening options where compatible
* Postgres listen restrictions
* database auth policy review
* backup directory permissions

Do **not** disable:

* root SSH login
* password SSH login

## 17.6 Deployment Inputs

Script should accept:

* domain name
* app path
* repo path or artifact path
* environment mode
* DB name
* DB user
* DB password
* TLS email
* ports
* whether to create DB locally
* whether to run seed data
* whether to install backup timers

---

## 18. Recommended Repository Structure

```text
meeting-bingo/
  apps/
    web/                 # Next.js app
    api/                 # NestJS app
  packages/
    ui/
    config/
    types/
    validation/
  infra/
    nginx/
    systemd/
    scripts/
      deploy.py
  prisma-or-migrations/
  docs/
    spec.md
    api.md
    deployment.md
    runbook.md
```

---

## 19. Acceptance Criteria

## 19.1 Authentication

* user can register with globally unique nickname
* user can log in and maintain session
* revoked or logged-out sessions lose access

## 19.2 Meeting and Invite

* owner can create meeting
* owner can create invite link with expiry
* user cannot join without valid invite and auth
* invite token is not stored in plaintext

## 19.3 Gameplay

* owner can start game
* every eligible participant gets a unique card
* late joiners can join active game and receive a card
* plus/minus works with min 0
* first count controls marked state
* repeated counts affect analytics only
* rankings update correctly
* exactly one winner is declared

## 19.4 Rejoin

* dropped users can re-enter through join-in-progress list
* current card state and chat restore correctly

## 19.5 Chat

* chat works in real time
* rate limit enforced at 3 per 10 seconds
* owner can hide messages
* chat is exportable

## 19.6 Export

* owner can export
* non-owner cannot export
* AI prompt list is visible with copy buttons

## 19.7 Security

* all protected routes require auth
* meeting access enforced server-side
* TLS enabled
* secure cookies enabled
* audit log exists for owner/admin actions
* abuse controls present

## 19.8 Deployment

* deploy script can run on fresh Ubuntu 24.04
* rerunning script is safe
* script outputs final step summary
* TLS and reverse proxy are configured
* services are running and health checks pass

---

## 20. Implementation Guidance for the Coding Agent

Build the system in this order:

1. auth and session management
2. meeting, invite, and membership model
3. phrase sets and rulesets
4. game creation and card generation
5. mark-event model and derived card state
6. winner detection and rankings
7. websocket sync
8. chat and moderation
9. export pipeline
10. join-in-progress UX
11. deployment automation
12. hardening and observability

Technical defaults:

* Next.js App Router frontend
* NestJS backend with REST + WebSocket
* PostgreSQL with strict schema and migrations
* UTC timestamps everywhere
* TypeScript throughout
* Node LTS for runtime

Next.js documents the App Router as the current file-system router using modern React capabilities, and NestJS is designed as a scalable Node server framework with TypeScript support. ([Next.js][5])

---

[1]: https://nodejs.org/en/about/previous-releases?utm_source=chatgpt.com "Node.js Releases"
[2]: https://docs.nestjs.com/?utm_source=chatgpt.com "Documentation | NestJS - A progressive Node.js framework"
[3]: https://docs.nestjs.com/security/authentication?utm_source=chatgpt.com "Authentication | NestJS - A progressive Node.js framework"
[4]: https://www.postgresql.org/docs/current/ssl-tcp.html?utm_source=chatgpt.com "18: 18.9. Secure TCP/IP Connections with SSL"
[5]: https://nextjs.org/docs/app?utm_source=chatgpt.com "Next.js Docs: App Router"
