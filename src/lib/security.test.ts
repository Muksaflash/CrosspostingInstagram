import { describe, it } from 'node:test';
import assert from 'node:assert';
import { safeCompare } from './security.ts';

describe('safeCompare', () => {
  it('should return true for identical strings', () => {
    assert.strictEqual(safeCompare('password123', 'password123'), true);
  });

  it('should return false for different strings of same length', () => {
    assert.strictEqual(safeCompare('password123', 'password456'), false);
  });

  it('should return false for strings of different lengths', () => {
    assert.strictEqual(safeCompare('password123', 'password'), false);
  });

  it('should return true for identical empty strings', () => {
    assert.strictEqual(safeCompare('', ''), true);
  });

  it('should return false if one string is empty and the other is not', () => {
    assert.strictEqual(safeCompare('', 'a'), false);
    assert.strictEqual(safeCompare('a', ''), false);
  });

  it('should return false if the first argument is null or undefined', () => {
    assert.strictEqual(safeCompare(null, 'password'), false);
    assert.strictEqual(safeCompare(undefined, 'password'), false);
  });

  it('should return false if the second argument is null or undefined', () => {
    assert.strictEqual(safeCompare('password', null), false);
    assert.strictEqual(safeCompare('password', undefined), false);
  });

  it('should return false if both arguments are null or undefined', () => {
    assert.strictEqual(safeCompare(null, null), false);
    assert.strictEqual(safeCompare(undefined, undefined), false);
    assert.strictEqual(safeCompare(null, undefined), false);
  });

  it('should handle strings with special characters', () => {
    assert.strictEqual(safeCompare('!@#$%^&*()', '!@#$%^&*()'), true);
    assert.strictEqual(safeCompare('!@#$%^&*()', '!@#$%^&*(!'), false);
  });

  it('should handle long strings', () => {
    const longString = 'a'.repeat(1000);
    assert.strictEqual(safeCompare(longString, longString), true);
    assert.strictEqual(safeCompare(longString, 'a'.repeat(999) + 'b'), false);
  });
});
