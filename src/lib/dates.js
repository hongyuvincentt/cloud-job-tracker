const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed.getTime();
}

export function todayLocal() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDueMeta(date, today = todayLocal()) {
  const dueTime = parseDateOnly(date);
  const todayTime = parseDateOnly(today);

  if (dueTime === null || todayTime === null) {
    return { text: '未设置跟进日期', state: 'none', days: null };
  }

  const days = Math.round((dueTime - todayTime) / DAY_MS);
  if (days < 0) {
    return { text: `已逾期 ${Math.abs(days)} 天`, state: 'overdue', days };
  }
  if (days === 0) {
    return { text: '今天跟进', state: 'soon', days };
  }
  if (days <= 7) {
    return { text: `${days} 天内跟进`, state: 'soon', days };
  }
  return { text: `${days} 天后跟进`, state: 'future', days };
}
