// U18k — week-over-week delta formatting for traffic stat cards.

export interface WeekOverWeekDelta {
  currentWeek: number;
  priorWeek: number;
}

export const formatWeekOverWeekDelta = (
  delta: WeekOverWeekDelta
): { label: string; tone: 'up' | 'down' | 'flat' | 'new' } => {
  const { currentWeek, priorWeek } = delta;
  if (priorWeek <= 0 && currentWeek > 0) {
    return { label: 'new this week', tone: 'new' };
  }
  if (priorWeek <= 0) {
    return { label: '0% vs last week', tone: 'flat' };
  }
  const change = Math.round(((currentWeek - priorWeek) / priorWeek) * 100);
  if (change === 0) return { label: '0% vs last week', tone: 'flat' };
  if (change > 0) return { label: `+${change}% vs last week`, tone: 'up' };
  return { label: `${change}% vs last week`, tone: 'down' };
};
