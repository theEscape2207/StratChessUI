import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { useEffect, useEffectEvent, useRef } from 'react';
import { legalDests, turn, type Color } from '@stratchess-ui/shared';

type BoardProps = {
  fen: string;
  lastMove?: string;
  /** Bumped to redraw the same position, e.g. after the server rejects a move. */
  revision: number;
  orientation: Color;
  /** The side the user may move now; undefined locks the board. */
  movable?: Color;
  onMove: (uci: string) => void;
};

/** Thin wrapper: Chessground is a view of the server's position, never the source of truth. */
export function Board({ fen, lastMove, revision, orientation, movable, onMove }: BoardProps) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api | undefined>(undefined);
  const handleMove = useEffectEvent(onMove);

  useEffect(() => {
    api.current = Chessground(element.current!, {
      movable: {
        free: false,
        events: {
          // Promotion choice is M1 work; until then a pawn reaching the last rank promotes to a queen.
          after: (orig, dest) => {
            const piece = api.current?.state.pieces.get(dest);
            const promotes = piece?.role === 'pawn' && (dest[1] === '1' || dest[1] === '8');
            handleMove(`${orig}${dest}${promotes ? 'q' : ''}`);
          },
        },
      },
    });
    return () => api.current?.destroy();
  }, []);

  useEffect(() => {
    api.current?.set({
      fen: fen.split(' ')[0],
      orientation,
      turnColor: turn(fen),
      lastMove: lastMove ? [lastMove.slice(0, 2) as Key, lastMove.slice(2, 4) as Key] : undefined,
      movable: { color: movable, dests: legalDests(fen) as Map<Key, Key[]> },
    });
  }, [fen, lastMove, revision, orientation, movable]);

  return <div ref={element} className="board" data-testid="board" />;
}
