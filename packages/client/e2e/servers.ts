// One server per Playwright worker, since each holds one game; the pairing test gets one more,
// because the token it mints would hold that game through its grace period.
export const BOARD_SERVERS = 4;
export const PAIRING_CODE = '000000';

export const serverPort = (index: number) => 8090 + index;
export const serverURL = (index: number) => `http://localhost:${serverPort(index)}`;
export const pairingURL = serverURL(BOARD_SERVERS);
export const pairedState = (index: number) => `test-results/paired-${index}.json`;
