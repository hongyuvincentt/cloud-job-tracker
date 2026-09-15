const CHINA_TIME_ZONE = 'Asia/Shanghai';

function chinaParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: CHINA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).map(part => [part.type, part.value])
  );
}

export function chinaDateKey(date = new Date()) {
  const parts = chinaParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function chinaHour(date = new Date()) {
  return Number(chinaParts(date).hour);
}

export function countApplicationsForChinaDate(applications, dateKey) {
  return applications.filter(application => {
    if (!application.createdAt) return false;
    const createdAt = new Date(application.createdAt);
    return !Number.isNaN(createdAt.valueOf()) && chinaDateKey(createdAt) === dateKey;
  }).length;
}

export function goalMessage({ completed, target, chinaHour: hour }) {
  if (completed >= target) {
    return { tone: 'complete', text: '今日目标完成，打卡已记录。继续保持！' };
  }
  const remaining = Math.max(target - completed, 0);
  if (hour >= 22) {
    return { tone: 'final', text: `今天还差 ${remaining} 个岗位，再不完成，连续打卡就要中断了。` };
  }
  if (hour >= 20) {
    return { tone: 'evening', text: `今天还差 ${remaining} 个岗位，抓紧完成今日目标吧。` };
  }
  return { tone: 'progress', text: `今天还差 ${remaining} 个岗位，稳稳推进就好。` };
}

function previousDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function currentCheckinStreak(checkins, todayKey) {
  const completedDates = new Set(checkins.map(checkin => checkin.checkinDate));
  let cursor = completedDates.has(todayKey) ? todayKey : previousDate(todayKey);
  let streak = 0;
  while (completedDates.has(cursor)) {
    streak += 1;
    cursor = previousDate(cursor);
  }
  return streak;
}
