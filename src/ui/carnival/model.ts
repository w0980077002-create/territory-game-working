const pad = (n: number) => String(n).padStart(2, '0');
/** «3д 12:15:08», «12:15:08». */
export function countdown(ms: number) {
  const left = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(left / 86_400), h = Math.floor(left % 86_400 / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
  return (days ? days + 'д ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
}
/** Short form for the HUD chip: «3д 12ч», «5ч 20м», «18м». */
export function shortCountdown(ms: number) {
  const left = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(left / 1440), h = Math.floor(left % 1440 / 60), m = left % 60;
  return days ? days + 'д ' + h + 'ч' : h ? h + 'ч ' + m + 'м' : m + 'м';
}
