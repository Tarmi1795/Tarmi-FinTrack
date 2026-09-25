
import { describe, it, expect } from 'vitest';
import { evaluateMathExpression } from '../utils/mathUtils';

describe('evaluateMathExpression', () => {
  it('returns plain numbers untouched', () => {
    expect(evaluateMathExpression('42')).toBe('42');
    expect(evaluateMathExpression('3.75')).toBe('3.75');
  });

  it('evaluates arithmetic expressions', () => {
    expect(evaluateMathExpression('50*4')).toBe('200');
    expect(evaluateMathExpression('100+50')).toBe('150');
    expect(evaluateMathExpression('1200/4')).toBe('300');
    expect(evaluateMathExpression('(10+5)*2')).toBe('30');
  });

  it('rounds to 2 decimals', () => {
    expect(evaluateMathExpression('0.1+0.2')).toBe('0.3');
    expect(evaluateMathExpression('10/3')).toBe('3.33');
  });

  it('strips disallowed characters (injection-safe)', () => {
    // 'alert' is stripped by the sanitizer → '5+(1)' evaluates to 6
    expect(evaluateMathExpression('5+alert(1)')).toBe('6');
  });

  it('returns the original input on syntax errors', () => {
    expect(evaluateMathExpression('5++5')).toBe('5++5');
    expect(evaluateMathExpression('')).toBe('');
  });

  it('returns original input on Infinity/NaN results', () => {
    expect(evaluateMathExpression('5/0')).toBe('5/0');
  });
});
