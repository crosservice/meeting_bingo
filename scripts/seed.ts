import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://meeting_bingo:changeme@localhost:5432/meeting_bingo';

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create a test owner user (password: "TestPass1")
      // In real usage Argon2id would hash this, but for seed data we insert a placeholder hash
      const {
        rows: [owner],
      } = await client.query(
        `INSERT INTO users (nickname, password_hash, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT DO NOTHING
         RETURNING id, nickname`,
        ['testowner', '$argon2id$placeholder_hash_for_seed_data'],
      );

      if (!owner) {
        console.log('Seed data already exists (testowner user found). Skipping.');
        await client.query('ROLLBACK');
        return;
      }

      console.log(`Created user: ${owner.nickname} (${owner.id})`);

      // Create a test participant
      const {
        rows: [participant],
      } = await client.query(
        `INSERT INTO users (nickname, password_hash, status)
         VALUES ($1, $2, 'active')
         RETURNING id, nickname`,
        ['testplayer', '$argon2id$placeholder_hash_for_seed_data'],
      );
      console.log(`Created user: ${participant.nickname} (${participant.id})`);

      // Create a test meeting
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      const {
        rows: [meeting],
      } = await client.query(
        `INSERT INTO meetings (owner_user_id, name, scheduled_start_at, scheduled_end_at, status)
         VALUES ($1, $2, $3, $4, 'scheduled')
         RETURNING id, name`,
        [owner.id, 'Test Meeting', now.toISOString(), oneHourLater.toISOString()],
      );
      console.log(`Created meeting: ${meeting.name} (${meeting.id})`);

      // Create owner membership
      await client.query(
        `INSERT INTO meeting_memberships (meeting_id, user_id, role, access_status)
         VALUES ($1, $2, 'owner', 'active')`,
        [meeting.id, owner.id],
      );

      // Create a phrase set with sample phrases
      const {
        rows: [phraseSet],
      } = await client.query(
        `INSERT INTO phrase_sets (meeting_id, name, created_by_user_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [meeting.id, 'Default Phrases', owner.id],
      );

      const samplePhrases = [
        'Let me share my screen',
        'Can you hear me?',
        'You are on mute',
        'Let us circle back',
        'Take this offline',
        'Synergy',
        'Low-hanging fruit',
        'Move the needle',
        'Deep dive',
        'Action items',
        'Bandwidth',
        'Touch base',
        'Leverage',
        'Pivot',
        'Circle back',
        'End of day',
        'Parking lot',
        'Next steps',
        'Alignment',
        'Drill down',
        'Unpack that',
        'Value add',
        'Best practice',
        'Win-win',
        'Going forward',
      ];

      for (const phrase of samplePhrases) {
        const normalized = phrase.toLowerCase().replace(/\s+/g, ' ').trim();
        await client.query(
          `INSERT INTO phrases (phrase_set_id, text, normalized_text)
           VALUES ($1, $2, $3)`,
          [phraseSet.id, phrase, normalized],
        );
      }
      console.log(`Created ${samplePhrases.length} phrases in set ${phraseSet.id}`);

      // Create a default ruleset
      await client.query(
        `INSERT INTO rulesets (meeting_id, name)
         VALUES ($1, 'Default')`,
        [meeting.id],
      );
      console.log('Created default ruleset');

      await client.query('COMMIT');
      console.log('\nSeed completed successfully.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
