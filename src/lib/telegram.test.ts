import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateTelegramData } from './telegram.ts';
import { createHmac } from 'node:crypto';

/**
 * Helper to calculate Telegram-style hash using Node.js crypto
 * to create a known good value for testing.
 */
function calculateTestHash(data: Record<string, string>, botToken: string): string {
  const dataCheckString = Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

describe('validateTelegramData', () => {
  const botToken = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ';

  it('should validate correctly signed data', async () => {
    const data = {
      auth_date: '1623830400',
      user: JSON.stringify({ id: 12345, first_name: 'Test', username: 'testuser' }),
    };

    const hash = calculateTestHash(data, botToken);
    const initData = new URLSearchParams({ ...data, hash }).toString();

    const isValid = await validateTelegramData(initData, botToken);
    assert.strictEqual(isValid, true, 'Should be valid');
  });

  it('should return false for incorrectly signed data (wrong hash)', async () => {
    const initData = 'auth_date=1623830400&user={"id":123}&hash=wronghash';
    const isValid = await validateTelegramData(initData, botToken);
    assert.strictEqual(isValid, false, 'Should be invalid due to wrong hash');
  });

  it('should return false if hash is missing', async () => {
    const initData = 'auth_date=1623830400&user={"id":123}';
    const isValid = await validateTelegramData(initData, botToken);
    assert.strictEqual(isValid, false, 'Should be invalid due to missing hash');
  });

  it('should return false for malformed data', async () => {
    const initData = 'not-a-query-string';
    const isValid = await validateTelegramData(initData, botToken);
    assert.strictEqual(isValid, false, 'Should be invalid for malformed data');
  });

  it('should return false if bot token is different', async () => {
    const data = { auth_date: '1623830400' };
    const hash = calculateTestHash(data, botToken);
    const initData = new URLSearchParams({ ...data, hash }).toString();

    const isValid = await validateTelegramData(initData, 'wrong-token');
    assert.strictEqual(isValid, false, 'Should be invalid with wrong bot token');
  });

  it('should handle special characters in data', async () => {
    const data = {
      auth_date: '1623830400',
      user: JSON.stringify({ id: 12345, name: 'Special & Character = Test' }),
    };

    const hash = calculateTestHash(data, botToken);
    const initData = new URLSearchParams({ ...data, hash }).toString();

    const isValid = await validateTelegramData(initData, botToken);
    assert.strictEqual(isValid, true, 'Should handle special characters correctly');
  });
});
