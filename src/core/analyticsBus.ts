/**
 * Product analytics hook. Game code reports facts here without knowing about the network;
 * the W066 sender (src/community/analytics.ts) attaches itself only for signed Telegram players.
 * Values are numbers, booleans or short lowercase tokens — never names, ids or free text.
 */
export type AnalyticsKind='enter'|'session'|'stage'|'battle'|'purchase'|'error';
export type AnalyticsData=Record<string,string|number|boolean>;
type Sink=(kind:AnalyticsKind,data:AnalyticsData)=>void;
let sink:Sink|undefined;
export function setAnalyticsSink(next?:Sink){sink=next}
export function track(kind:AnalyticsKind,data:AnalyticsData){try{sink?.(kind,data)}catch{/* analytics never breaks play */}}
