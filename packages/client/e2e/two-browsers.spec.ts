import { PAIRING_CODE } from './servers.ts';
import { expect, test } from './fixtures.ts';
import { expectFen, expectMoves, newGame, openSettled, playAndAwaitReply } from './helpers.ts';

test('two paired browsers play at once, each seeing only its own game', async ({
  page,
  browser,
  baseURL,
  hasTouch,
}) => {
  const paired = await fetch(`${baseURL}/api/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: PAIRING_CODE }),
  });
  const { token } = (await paired.json()) as { token: string };
  const localStorage = [{ name: 'pairing-token', value: token }];
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [{ origin: baseURL!, localStorage }] },
  });
  const other = await context.newPage();

  await openSettled(page);
  await newGame(page);
  await openSettled(other);
  await newGame(other);

  await Promise.all([
    playAndAwaitReply(page, 'e2e4', hasTouch),
    playAndAwaitReply(other, 'd2d4', false),
  ]);
  await Promise.all([
    playAndAwaitReply(page, 'g1f3', hasTouch),
    playAndAwaitReply(other, 'c2c4', false),
  ]);

  await expectMoves(page, ['e4', 'a5', 'Nf3', 'a4']);
  await expectMoves(other, ['d4', 'a5', 'c4', 'a4']);
  await expectFen(page, 'rnbqkbnr/1ppppppp/8/8/p3P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3');
  await expectFen(other, 'rnbqkbnr/1ppppppp/8/8/p1PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3');
  await expect(other.getByTestId('notice')).toHaveCount(0);
  await context.close();
});
