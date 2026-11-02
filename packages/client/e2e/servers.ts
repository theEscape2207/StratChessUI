// One server per Playwright worker, since a worker's tests share a paired browser and so its one
// game; the pairing test gets one more, so that the tokens it mints stay out of their way.
export const BOARD_SERVERS = 4;
export const PAIRING_CODE = '000000';

export const serverPort = (index: number) => 8090 + index;
export const serverURL = (index: number) => `http://localhost:${serverPort(index)}`;
export const pairingURL = serverURL(BOARD_SERVERS);
export const pairedState = (index: number) => `test-results/paired-${index}.json`;
