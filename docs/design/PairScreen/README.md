# PairScreen

The one-time setup a browser goes through before its first game: enter the code the host prints, get
a token the device keeps until the host revokes it.

**Use** as the whole page when the device has no pairing token; never again after pairing succeeds.
It is not a sign-in: there is no account, name or password.

**The consumer supplies** `onPaired(token)`, and the server's rejection reason for the notice line.

**Anatomy** a small wordmark (a 2×2 board-square mark and `panel-title` type), then one `panel`
card: a heading, one sentence of explanation, the code field (numeric keypad, `one-time-code`
autocomplete, 6 digits in large spaced `mono`), one primary **Pair** button, and a `notice` line on
failure.

Hand-written from `packages/client/src/PairForm.tsx` and `packages/server/src/pairing.ts` (a
6-digit code, rotated after repeated wrong attempts). The "(1 of 5)" in the preview is illustrative.
