import seedrandom from 'seedrandom';
import * as crypto from 'crypto';
import { FREE_SQUARE_ROW, FREE_SQUARE_COL } from '@meeting-bingo/config';

interface PhraseSnapshot {
  id: string;
  text: string;
}

interface RulesetSnapshot {
  board_rows: number;
  board_cols: number;
  free_square_enabled: boolean;
  free_square_label: string;
}

export interface GeneratedCell {
  row_index: number;
  col_index: number;
  phrase_text: string;
  phrase_key: string;
  is_free_square: boolean;
}

export interface GeneratedCard {
  seed: string;
  cells: GeneratedCell[];
}

/**
 * Generates a unique bingo card using a seeded Fisher-Yates shuffle.
 * The card is deterministically reproducible from the stored seed.
 */
export function generateCard(
  phrases: PhraseSnapshot[],
  ruleset: RulesetSnapshot,
): GeneratedCard {
  const seed = crypto.randomBytes(16).toString('hex');
  return generateCardFromSeed(seed, phrases, ruleset);
}

export function generateCardFromSeed(
  seed: string,
  phrases: PhraseSnapshot[],
  ruleset: RulesetSnapshot,
): GeneratedCard {
  const { board_rows, board_cols, free_square_enabled, free_square_label } = ruleset;
  const totalCells = board_rows * board_cols;
  const neededPhrases = free_square_enabled ? totalCells - 1 : totalCells;

  // Seeded Fisher-Yates shuffle
  const rng = seedrandom(seed);
  const shuffled = [...phrases];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selected = shuffled.slice(0, neededPhrases);

  const cells: GeneratedCell[] = [];
  let phraseIdx = 0;

  for (let row = 0; row < board_rows; row++) {
    for (let col = 0; col < board_cols; col++) {
      if (free_square_enabled && row === FREE_SQUARE_ROW && col === FREE_SQUARE_COL) {
        cells.push({
          row_index: row,
          col_index: col,
          phrase_text: free_square_label,
          phrase_key: '__FREE__',
          is_free_square: true,
        });
      } else {
        const phrase = selected[phraseIdx++];
        cells.push({
          row_index: row,
          col_index: col,
          phrase_text: phrase.text,
          phrase_key: phrase.id,
          is_free_square: false,
        });
      }
    }
  }

  return { seed, cells };
}
