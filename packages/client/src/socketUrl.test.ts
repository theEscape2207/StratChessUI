import { expect, it } from 'vitest';
import { gameSocketUrl } from './socketUrl.ts';

it('opens a secure socket from a page served over HTTPS, a plain one over HTTP', () => {
  expect(gameSocketUrl({ protocol: 'https:', host: 'chess.example.org' }, 'abc')).toBe(
    'wss://chess.example.org/ws?token=abc',
  );
  expect(gameSocketUrl({ protocol: 'http:', host: '192.168.1.20:8080' }, 'abc')).toBe(
    'ws://192.168.1.20:8080/ws?token=abc',
  );
});

it('escapes the token', () => {
  expect(gameSocketUrl({ protocol: 'http:', host: 'h' }, 'a+b/c=')).toBe(
    'ws://h/ws?token=a%2Bb%2Fc%3D',
  );
});
