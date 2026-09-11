import assert from 'node:assert/strict';
import test from 'node:test';

const otpModule = await import('../src/ui/otp-input.js').catch(() => ({}));

test('creates exactly six empty OTP digit slots', () => {
  assert.equal(typeof otpModule.createOtpDigits, 'function');
  assert.deepEqual(otpModule.createOtpDigits(), ['', '', '', '', '', '']);
});

test('fills pasted digits across the six slots and points focus at the last filled slot', () => {
  assert.equal(typeof otpModule.fillOtpDigits, 'function');
  assert.deepEqual(
    otpModule.fillOtpDigits(['', '', '', '', '', ''], 0, '95 74-2572'),
    { digits: ['9', '5', '7', '4', '2', '5'], focusIndex: 5 }
  );
});

test('fills a complete six-digit paste from the first slot regardless of focused slot', () => {
  assert.deepEqual(
    otpModule.fillOtpDigits(['', '', '', '', '', ''], 2, '123456'),
    { digits: ['1', '2', '3', '4', '5', '6'], focusIndex: 5 }
  );
});

test('advances focus after entering one digit', () => {
  assert.equal(typeof otpModule.fillOtpDigits, 'function');
  assert.deepEqual(
    otpModule.fillOtpDigits(['1', '', '', '', '', ''], 1, '2'),
    { digits: ['1', '2', '', '', '', ''], focusIndex: 2 }
  );
});

test('keeps digits in their original slots while editing a gap', () => {
  assert.deepEqual(
    otpModule.fillOtpDigits(['1', '', '3', '', '', ''], 1, '2'),
    { digits: ['1', '2', '3', '', '', ''], focusIndex: 2 }
  );
});

test('keeps focus on the same box when its digit is cleared', () => {
  assert.deepEqual(
    otpModule.fillOtpDigits(['1', '2', '', '', '', ''], 1, ''),
    { digits: ['1', '2', '', '', '', ''], focusIndex: 1 }
  );
});

test('backspace on an empty slot clears and returns to the previous slot', () => {
  assert.equal(typeof otpModule.backspaceOtpDigits, 'function');
  assert.deepEqual(
    otpModule.backspaceOtpDigits(['1', '2', '', '', '', ''], 2),
    { digits: ['1', '', '', '', '', ''], focusIndex: 1 }
  );
});

test('renders six accessible single-digit inputs', () => {
  assert.equal(typeof otpModule.renderOtpFields, 'function');
  const html = otpModule.renderOtpFields(['1', '2', '', '', '', '']);

  assert.equal((html.match(/data-otp-index=/g) ?? []).length, 6);
  assert.match(html, /aria-label="验证码第1位"/);
  assert.match(html, /aria-label="验证码第6位"/);
  assert.match(html, /maxlength="1"/);
  assert.match(html, /value="1"/);
  assert.match(html, /value="2"/);
});
