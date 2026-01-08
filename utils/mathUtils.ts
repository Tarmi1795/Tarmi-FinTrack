
export const evaluateMathExpression = (input: string): string => {
  if (!input) return '';
  
  // 1. Sanitize: Allow only digits, dots, spaces, and operators (+ - * / ( ))
  // This prevents code injection.
  const sanitized = input.replace(/[^0-9.+\-*/\(\)\s]/g, '');

  // 2. Optimization: If no operators, just return the sanitized string (it's just a number)
  if (!/[\+\-\*\/]/.test(sanitized)) return sanitized;

  try {
    // 3. Safe Evaluation using Function constructor
    // We use a strict regex check above, so this is safe from XSS/Injection.
    // 'return (' + sanitized + ')' creates a function that returns the result of the math.
    const result = new Function('"use strict";return (' + sanitized + ')')();

    // 4. Validate Result
    if (isFinite(result) && !isNaN(result)) {
      // Round to 2 decimal places to avoid floating point errors (e.g. 0.1 + 0.2)
      return String(Math.round(result * 100) / 100);
    }
    return input; // Return original if result is Infinity or NaN
  } catch (e) {
    return input; // Return original on syntax error (e.g. "5++5")
  }
};
