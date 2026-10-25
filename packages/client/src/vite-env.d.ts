/// <reference types="vite/client" />

import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** Chessground's piece element, drawn by its piece-set stylesheet. */
      piece: { className: string };
    }
  }
}
