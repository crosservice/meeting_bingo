# Buffs & Mini-Games — Feature Roadmap

Future feature for Meeting Bingo that adds a layer of strategic interaction through buffs (power-ups that affect gameplay) and mini-games (quick challenges to earn buffs). Players can also vote to allocate buffs to others, weighted by ranking position.

---

## Buffs System

### Buff Types

| Buff | Target | Effect | Duration |
|------|--------|--------|----------|
| **Scramble Random** | Random opponent | Randomly rearranges the phrase positions on their card | Instant |
| **Scramble Chosen** | Specific opponent | Same as above but you pick who | Instant |
| **Freeze Random** | Random opponent | Disables +/- buttons on their card | 60 seconds |
| **Freeze Chosen** | Specific opponent | Same as above but you pick who | 60 seconds |
| **Reveal Line** | Self | Highlights your closest-to-winning line | 30 seconds |
| **Double Mark** | Self | Next mark counts as +2 instead of +1 | Next click |
| **Shield** | Self | Blocks the next incoming debuff against you | Until used |
| **Peek** | Specific opponent | View their current card state briefly | 15 seconds |

### Buff Rules

- Each player can hold a maximum of 3 buffs at a time
- Buffs expire if unused after 5 minutes
- Some buffs are offensive (target others), some are defensive (self)
- Free square cannot be scrambled or affected by debuffs
- Buff usage is logged in the event audit trail for export
- Scramble preserves marked/unmarked state but moves phrases to new positions
- Freeze shows a visual overlay on the target's card ("Frozen! Xx seconds remaining")

### Data Model

```
buff_inventory
  id UUID PK
  game_id UUID FK -> games
  user_id UUID FK -> users
  buff_type TEXT CHECK (buff_type IN ('scramble_random', 'scramble_chosen', ...))
  acquired_via TEXT ('mini_game', 'vote', 'bonus')
  acquired_at TIMESTAMPTZ
  expires_at TIMESTAMPTZ
  used_at TIMESTAMPTZ NULL
  target_user_id UUID NULL FK -> users
  metadata_json JSONB NULL

buff_events (append-only)
  id UUID PK
  game_id UUID FK -> games
  actor_user_id UUID FK -> users
  target_user_id UUID NULL FK -> users
  buff_type TEXT
  action TEXT ('acquired', 'used', 'expired', 'blocked')
  occurred_at TIMESTAMPTZ
  metadata_json JSONB NULL
```

---

## Mini-Games

Quick side-games that players can initiate during an active bingo game to earn buffs. Each mini-game runs independently of the main bingo game.

### Mini-Game Types

#### 1. Roulette Wheel
- Player spins a wheel with segments: buff (various types), nothing, lose-a-buff
- Cooldown: one spin per 3 minutes per player
- Visual: animated spinning wheel overlay
- Outcomes weighted: common buffs 40%, rare buffs 10%, nothing 40%, penalty 10%

#### 2. Guess the Number
- System picks a random number 1-100
- Player gets 5 guesses with hot/cold feedback
- Win condition: guess correctly within 5 tries
- Reward: random buff
- Cooldown: one attempt per 2 minutes

#### 3. Rock Paper Scissors
- Challenge another player in the same meeting
- Best of 3 rounds
- Winner gets a buff, loser gets nothing
- Both players must accept the challenge within 30 seconds
- Maximum 1 active challenge per player at a time

#### 4. Speed Click
- 10 random phrases flash on screen for 0.5 seconds each
- Player must click/tap while each is visible
- Score based on accuracy: 8+ correct = buff
- Cooldown: once per 5 minutes

#### 5. Trivia
- A general knowledge question with 4 multiple choice answers
- 15 second timer
- Correct answer = buff
- Cooldown: once per 3 minutes
- Question pool stored server-side, randomized per player

### Mini-Game Data Model

```
mini_game_sessions
  id UUID PK
  game_id UUID FK -> games
  mini_game_type TEXT
  initiator_user_id UUID FK -> users
  opponent_user_id UUID NULL FK -> users (for RPS)
  status TEXT ('pending', 'active', 'completed', 'expired')
  result_json JSONB
  buff_awarded TEXT NULL
  started_at TIMESTAMPTZ
  completed_at TIMESTAMPTZ NULL

mini_game_events (append-only)
  id UUID PK
  session_id UUID FK -> mini_game_sessions
  user_id UUID FK -> users
  action TEXT
  data_json JSONB
  occurred_at TIMESTAMPTZ
```

### Mini-Game UI

- Small icon bar below the bingo card showing available mini-games
- Each game opens as a modal overlay without leaving the bingo page
- Cooldown timers shown per game type
- Buff inventory displayed as small icons near the player's name

---

## Buff Voting System

Players can vote to allocate buffs to other players. The voting system is weighted by ranking position to help trailing players catch up.

### How Voting Works

1. **Vote Trigger**: Owner can start a "buff vote" round at any time during an active game, or they can be triggered automatically every N minutes
2. **Vote Allocation**: Each player gets vote points to distribute:
   - Player in last place: 5 votes
   - Player in second-to-last: 4 votes
   - Middle players: 3 votes
   - Player in second place: 2 votes
   - Player in first place: 1 vote
3. **Voting Period**: 60 seconds to cast all votes
4. **Vote Targets**: Players allocate their votes to other players (not themselves)
5. **Resolution**: The player with the most votes receives a random buff. Second-most votes gets a lesser buff. Ties broken randomly.
6. **Transparency**: Vote totals are shown after the round ends. Individual votes are anonymous.

### Vote Data Model

```
buff_vote_rounds
  id UUID PK
  game_id UUID FK -> games
  started_at TIMESTAMPTZ
  ended_at TIMESTAMPTZ NULL
  status TEXT ('active', 'completed', 'cancelled')
  results_json JSONB NULL

buff_votes
  id UUID PK
  round_id UUID FK -> buff_vote_rounds
  voter_user_id UUID FK -> users
  target_user_id UUID FK -> users
  vote_count INTEGER
  cast_at TIMESTAMPTZ
```

### Vote UI

- Full-screen overlay showing all players with +/- vote allocation buttons
- Remaining vote points displayed prominently
- Live countdown timer
- Results animation showing vote totals and buff awarded

---

## Implementation Phases

### Phase A: Buff Infrastructure
1. Database tables for buff inventory and events
2. Buff service with acquire/use/expire logic
3. WebSocket events for buff notifications
4. Buff inventory UI on the play page
5. Scramble and freeze buff implementations (modify card state server-side)
6. Shield and passive buff logic

### Phase B: Mini-Games
1. Mini-game session management service
2. Roulette wheel (simplest — single-player, no opponent)
3. Guess the number
4. Rock Paper Scissors (requires challenge/accept flow)
5. Speed Click and Trivia
6. Cooldown enforcement
7. Mini-game modal UI components

### Phase C: Voting System
1. Vote round management
2. Vote point calculation from rankings
3. Real-time vote casting via WebSocket
4. Vote resolution and buff award
5. Vote UI overlay
6. Owner controls for triggering votes

### Phase D: Polish
1. Buff animations and sound effects
2. Buff history in export data
3. Buff statistics in post-game analysis
4. AI prompt templates for buff/mini-game analysis
5. Balance tuning (cooldowns, buff power, vote weights)
6. Anti-abuse: rate limits on mini-games, vote manipulation detection

---

## API Endpoints (Planned)

```
# Buffs
GET    /games/:gameId/buffs/me           — my buff inventory
POST   /games/:gameId/buffs/:buffId/use  — use a buff (with target_user_id if needed)

# Mini-games
GET    /games/:gameId/mini-games         — available mini-games + cooldowns
POST   /games/:gameId/mini-games/start   — start a mini-game session
POST   /mini-games/:sessionId/action     — submit a move/guess/spin
POST   /mini-games/:sessionId/accept     — accept RPS challenge

# Voting
POST   /games/:gameId/vote-rounds/start  — owner starts a vote round
GET    /games/:gameId/vote-rounds/active — get active round
POST   /vote-rounds/:roundId/vote        — cast votes
GET    /vote-rounds/:roundId/results     — get results after round ends
```

## WebSocket Events (Planned)

```
# Server -> Client
buff.acquired         — you received a buff
buff.used_on_you      — a buff was used targeting you
buff.expired          — a buff in your inventory expired
card.scrambled        — your card was scrambled (new layout)
card.frozen           — your card is frozen (with duration)
card.unfrozen         — freeze ended
mini_game.challenge   — someone challenged you to RPS
mini_game.result      — mini-game outcome
vote_round.started    — voting round began
vote_round.ended      — results available

# Client -> Server
mini_game.accept      — accept a challenge
mini_game.action      — submit game move
vote.cast             — submit votes
```
