import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
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

/** A pawn move to the last rank, waiting for the user to pick a piece. */
type Promotion = { fen: string; uci: string };

const PROMOTION_ROLES = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' } as const;

/** Thin wrapper: Chessground is a view of the server's position, never the source of truth. */
export function Board({ fen, lastMove, revision, orientation, movable, onMove }: BoardProps) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api | undefined>(undefined);
  const [promotion, setPromotion] = useState<Promotion>();
  const [redraw, setRedraw] = useState(0);
  // Keyed by position, so a picker left open is gone once the server moves the game on.
  const choosing = promotion?.fen === fen ? promotion : undefined;

  const handleMove = useEffectEvent((orig: Key, dest: Key) => {
    const piece = api.current?.state.pieces.get(dest);
    if (piece?.role === 'pawn' && (dest[1] === '1' || dest[1] === '8')) {
      api.current?.set({ movable: { color: undefined } });
      setPromotion({ fen, uci: `${orig}${dest}` });
    } else {
      onMove(`${orig}${dest}`);
    }
  });

  useEffect(() => {
    api.current = Chessground(element.current!, {
      movable: { free: false, events: { after: (orig, dest) => handleMove(orig, dest) } },
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
  }, [fen, lastMove, revision, redraw, orientation, movable]);

  const cancel = () => {
    setPromotion(undefined);
    setRedraw((r) => r + 1);
  };

  return (
    <div className="board-frame">
      <div ref={element} className="board" data-testid="board" />
      {choosing && (
        // Pieces are drawn by Chessground's stylesheet, which applies inside a cg-wrap.
        <div className="promotion cg-wrap" onClick={cancel}>
          {Object.entries(PROMOTION_ROLES).map(([role, letter]) => (
            <button
              key={role}
              type="button"
              aria-label={`Promote to ${role}`}
              onClick={(event) => {
                event.stopPropagation();
                setPromotion(undefined);
                onMove(`${choosing.uci}${letter}`);
              }}
            >
              <piece className={`${role} ${turn(fen)}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
