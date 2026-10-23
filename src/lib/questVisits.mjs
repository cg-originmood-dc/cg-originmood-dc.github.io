/** Dates and timestamps are always displayed in Taiwan time, regardless of device timezone. */
export function taipeiDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
}

export function compactVisitTime(iso) {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Taipei', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).formatToParts(new Date(iso));
  const get = type => parts.find(p => p.type === type).value;
  return `${get('month')}${get('day')} ${get('hour')}:${get('minute')}`;
}

export function readVisitState(raw) {
  if (raw === null) return {doneAt:null, visits:[]};
  const state = JSON.parse(raw);
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  if (!state || !(state.doneAt === null || validTime(state.doneAt)) || !Array.isArray(state.visits) ||
    !state.visits.every(v => v && typeof v.name === 'string' && v.name.trim() && v.name.length <= 80 && validTime(v.time))) {
    throw new Error('Invalid visit record');
  }
  return state;
}

export function registerVisit(state, name, now = new Date()) {
  const clean = name.trim();
  if (!clean || clean.length > 80) throw new Error('Invalid character name');
  if (state.visits.some(v => v.name === clean)) return state;
  const time = now.toISOString();
  return {doneAt:state.doneAt ?? time, visits:[...state.visits, {name:clean, time}]};
}
