import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
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
  /** Drawn over the board, such as a dialog. */
  children?: ReactNode;
};

/** A pawn move to the last rank, waiting for the user to pick a piece. */
type Promotion = { fen: string; uci: string };

const PROMOTION_ROLES = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' } as const;

/** a1 is dark. Chessground's squares carry no colour of their own, so the stylesheet needs this. */
const shade = (key: Key) => ((key.charCodeAt(0) + Number(key[1])) % 2 === 0 ? 'dark' : 'light');

/** The last move's from and to squares. */
function lastMoveSquares(uci: string | undefined): [Key, Key] | undefined {
  return uci ? [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key] : undefined;
}

/** Thin wrapper: Chessground is a view of the server's position, never the source of truth. */
export function Board({
  fen,
  lastMove,
  revision,
  orientation,
  movable,
  onMove,
  children,
}: BoardProps) {
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
    const squares = lastMoveSquares(lastMove);
    api.current?.set({
      fen: fen.split(' ')[0],
      orientation,
      turnColor: turn(fen),
      lastMove: squares,
      highlight: { custom: new Map(squares?.map((key) => [key, shade(key)])) },
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
      {children}
    </div>
  );
}
