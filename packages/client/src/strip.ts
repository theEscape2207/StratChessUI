import type { Color, GameState, Role, SearchLimit } from '@stratchess-ui/shared';

export type Side = 'engine' | 'human';

export type Chip = { text: string; raised: boolean };

const IN_PLAY = {
  starting: { engine: 'starting', human: 'waiting', toMove: 'engine' },
  human: { engine: 'waiting', human: 'your move', toMove: 'human' },
  thinking: { engine: 'thinking', human: 'waiting', toMove: 'engine' },
} as const;

/** The status chip on one side's strip; only the side to move's is raised, none after the game. */
export function stripChip(
  game: Pick<GameState, 'phase' | 'result' | 'humanColor'>,
  side: Side,
): Chip {
  if (game.phase !== 'over') {
    const chips = IN_PLAY[game.phase];
    return { text: chips[side], raised: chips.toMove === side };
  }
  if (!game.result) return { text: 'ended', raised: false };
  if (game.result === 'draw') return { text: 'draw', raised: false };
  const humanWon = game.result === game.humanColor;
  return { text: humanWon === (side === 'human') ? 'won' : 'lost', raised: false };
}

export function limitLabel(limit: SearchLimit): string {
  return 'depth' in limit ? `depth ${limit.depth}` : `${limit.movetimeMs} ms`;
}

const ORDER: readonly Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/** Captured pieces cheapest first, as a strip shows them. */
export function sortCaptures(roles: readonly Role[]): Role[] {
  return [...roles].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

/** The `+N` on `color`'s strip: its lead from white's balance, or undefined unless it is ahead. */
export function materialLead(balance: number, color: Color): number | undefined {
  const lead = color === 'white' ? balance : -balance;
  return lead > 0 ? lead : undefined;
}
