export const OTP_LENGTH = 6;

export function createOtpDigits(value = '') {
  const digits = String(value).replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
  return Array.from({ length: OTP_LENGTH }, (_, index) => digits[index] ?? '');
}

function copyOtpDigits(currentDigits) {
  if (!Array.isArray(currentDigits)) return createOtpDigits(currentDigits);
  return Array.from(
    { length: OTP_LENGTH },
    (_, index) => /^\d$/.test(currentDigits[index] ?? '') ? currentDigits[index] : ''
  );
}

export function fillOtpDigits(currentDigits, startIndex, value) {
  const normalizedValue = String(value).replace(/\D/g, '').slice(0, OTP_LENGTH);
  const isCompleteCode = normalizedValue.length === OTP_LENGTH;
  const insertionIndex = isCompleteCode ? 0 : startIndex;
  const digits = isCompleteCode ? createOtpDigits() : copyOtpDigits(currentDigits);
  const incoming = normalizedValue.slice(0, OTP_LENGTH - insertionIndex);

  [...incoming].forEach((digit, offset) => {
    digits[insertionIndex + offset] = digit;
  });

  return {
    digits,
    focusIndex: incoming.length
      ? Math.min(insertionIndex + incoming.length, OTP_LENGTH - 1)
      : insertionIndex
  };
}

export function backspaceOtpDigits(currentDigits, index) {
  const digits = copyOtpDigits(currentDigits);
  const targetIndex = digits[index] || index === 0 ? index : index - 1;
  digits[targetIndex] = '';
  return { digits, focusIndex: targetIndex };
}

export function renderOtpFields(currentDigits, { disabled = false } = {}) {
  const digits = copyOtpDigits(currentDigits);
  return `
    <div class="otp-input-group" data-otp-group role="group" aria-label="六位验证码">
      ${digits.map((digit, index) => `
        <input
          id="otp-digit-${index}"
          class="otp-digit"
          data-otp-index="${index}"
          type="text"
          inputmode="numeric"
          autocomplete="${index === 0 ? 'one-time-code' : 'off'}"
          aria-label="验证码第${index + 1}位"
          maxlength="1"
          value="${digit}"
          ${disabled ? 'disabled' : ''}
        >`).join('')}
    </div>`;
}
