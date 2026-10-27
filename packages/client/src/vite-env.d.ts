/// <reference types="vite/client" />

import type { Key } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** Chessground's piece element, drawn by its piece-set stylesheet. */
      piece: { key?: Key; className: string; role?: string; 'aria-label'?: string };
    }
  }
}
