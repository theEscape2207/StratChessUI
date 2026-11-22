import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import {
  expectFen,
  expectYourMove,
  openSettled,
  playAndAwaitReply,
  scriptedServer,
  showNewGameForm,
  submitNewGame,
} from './helpers.ts';

// GameScreen's breakpoint, the min-width of app.css's media query.
const DESKTOP = 960;

// White mates with Rb8. The fake-play engine scores a mate in one as a mate and anything else by
// material, so h3 gives up a won game, and the position search's best move scores #1.
const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/r4PPP/1R4K1 w - - 0 1';

const feedback = (page: Page) => page.getByTestId('move-feedback');
const played = (page: Page) => page.getByTestId('feedback-played');
const bestRow = (page: Page) => page.getByTestId('feedback-best');
const bestWas = (page: Page) => page.getByTestId('feedback-best-was');
const isDesktop = (page: Page) => page.viewportSize()!.width >= DESKTOP;

test('a blunder shows against the best move: two rows on a desktop, one on a phone', async ({
  page,
  hasTouch,
}) => {
  await openSettled(page);
  await showNewGameForm(page);
  await page.getByRole('combobox', { name: 'Engine' }).selectOption('fake-play');
  await page.getByRole('combobox', { name: 'Limit' }).selectOption('depth');
  await page.getByLabel('Start position').fill(MATE_IN_ONE);
  await page.getByLabel('Move Feedback').check();
  await submitNewGame(page);
  await expectFen(page, MATE_IN_ONE);
  await expectYourMove(page);
  await playAndAwaitReply(page, 'h2h3', hasTouch);

  await expect(played(page).getByRole('img', { name: 'blunder' })).toHaveText('??');
  await expect(played(page).locator('.feedback-head')).toHaveText('h3 is a blunder');
  await expect(played(page).getByTestId('feedback-chip')).toHaveText('0.00');
  await expect(played(page).getByTestId('feedback-chip')).toHaveClass(/white/);

  if (isDesktop(page)) {
    await expect(bestWas(page)).toBeHidden();
    await expect(bestRow(page).getByRole('img', { name: 'best' })).toHaveText('★');
    await expect(bestRow(page).locator('.feedback-head')).toHaveText(/^\S+ is best$/);
    await expect(bestRow(page).getByTestId('feedback-chip')).toHaveText('#1');
    // Numbered from the position before h3, starting with the best move.
    const best = (await bestRow(page).locator('.feedback-head b').textContent())!;
    await expect(bestRow(page).getByTestId('feedback-pv')).toHaveText(new RegExp(`^1\\. ${best} `));
  } else {
    await expect(bestRow(page)).toBeHidden();
    await expect(bestWas(page)).toHaveText(/^Best was \S+ \(#1\)$/);
    // One row: the badge's height, the headline and "Best was" beside it, and the padding.
    expect((await feedback(page).boundingBox())!.height).toBeLessThanOrEqual(64);
    // The buttons under it are still on the first screen.
    const undo = page.getByRole('button', { name: 'Undo' });
    const bottom = await undo.evaluate((el) => el.getBoundingClientRect().bottom + scrollY);
    expect(bottom).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sideways).toBe(0);
});

test("it stays while the engine thinks, and goes with the human's next move", async ({ page }) => {
  const server = await scriptedServer(page);
  // 1. e4, the human playing white, after a hint: no praise, so no badge, but the score stays.
  server.game({
    humanColor: 'white',
    moves: ['e2e4'],
    verdicts: [null],
    feedback: [{ score: { cp: 35 } }],
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    lastMove: 'e2e4',
    phase: 'thinking',
    analysis: true,
  });
  await expect(played(page).locator('.feedback-head')).toHaveText('e4');
  await expect(played(page).getByRole('img')).toHaveCount(0);
  await expect(played(page).getByTestId('feedback-chip')).toHaveText('+0.35');
  await expect(bestRow(page)).toHaveCount(0);
  await expect(bestWas(page)).toHaveCount(0);

  // 1... e5 2. Nf3, best and so with no best row, as the engine replies to it.
  const nf3 = {
    humanColor: 'white' as const,
    moves: ['e2e4', 'e7e5', 'g1f3'],
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    lastMove: 'g1f3',
    phase: 'thinking' as const,
    analysis: true as const,
  };
  server.game({
    ...nf3,
    verdicts: [null, null, null],
    feedback: [{ score: { cp: 35 } }, null, null],
  });
  await expect(feedback(page)).toHaveCount(0);
  server.game({
    ...nf3,
    verdicts: [null, null, 'best'],
    feedback: [{ score: { cp: 35 } }, null, { score: { cp: -120 } }],
  });
  await expect(played(page).locator('.feedback-head')).toHaveText('Nf3 is best');
  await expect(played(page).getByTestId('feedback-chip')).toHaveText('-1.20');
  await expect(played(page).getByTestId('feedback-chip')).toHaveClass(/black/);
  await expect(bestRow(page)).toHaveCount(0);

  // The engine's best line runs on one line, cut short on a desktop; a phone shows no line.
  server.game({
    ...nf3,
    verdicts: [null, null, 'mistake'],
    feedback: [
      { score: { cp: 35 } },
      null,
      {
        score: { cp: -120 },
        best: { score: { cp: 40 }, pv: ['Nc3', 'Nc6', 'Nf3', 'Nf6', 'Bb5', 'Bb4', 'O-O', 'O-O'] },
      },
    ],
  });
  await expect(played(page).locator('.feedback-head')).toHaveText('Nf3 is a mistake');
  if (isDesktop(page)) {
    const pv = bestRow(page).getByTestId('feedback-pv');
    await expect(pv).toHaveText('2. Nc3 Nc6 3. Nf3 Nf6 4. Bb5 Bb4 5. O-O O-O');
    expect(await pv.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect((await pv.boundingBox())!.height).toBeLessThanOrEqual(16);
    await expect(bestRow(page).getByTestId('feedback-chip')).toHaveText('+0.40');
  } else {
    await expect(bestWas(page)).toHaveText('Best was Nc3 (+0.40)');
    await expect(bestRow(page)).toBeHidden();
  }
});
