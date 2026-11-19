/**
 * QA stand for the carnival UI, dev server only (not part of the build): the real game with the festive
 * HUD medal and the carnival window mounted from scripts/qa/carnival-fixture.ts. Claims here update only the
 * in-memory fixture so layout, states and double taps can be checked before Codex's core lands.
 * Open: /scripts/qa/carnival-preview.html?testProfile=<name>[&day=<1..7>&points=<n>]
 */
import {useEffect, useState, useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {createRoot} from 'react-dom/client';
import '../../src/main';
import {useGame} from '../../src/core/store';
import {CarnivalButton, CarnivalPanel} from '../../src/ui/carnival/CarnivalPanel';
import {carnivalVisible, type CarnivalView} from '../../src/ui/carnival/model';
import {carnivalFixture} from './carnival-fixture';

const query = new URLSearchParams(location.search);
const day = Number(query.get('day') ?? 4), points = Number(query.get('points') ?? 340);
let view: CarnivalView = carnivalFixture(Date.now(), {daysAgo: day - 1 + 11 / 24 + 44 / 1440, points, progressDays: day - 1});
const listeners = new Set<() => void>();
const commit = (next: CarnivalView) => {view = next; listeners.forEach(fn => fn())};
const log: string[] = [];
Object.assign(window, {__carnival: {get view() {return view}, log, set: commit}});

const actions = {
  claimTask(id: string) {
    const task = view.tasks.find(t => t.id === id);
    log.push('task:' + id);
    if (!task || task.claimed || task.progress < task.goal) return;
    commit({...view, points: view.points + task.points, tasks: view.tasks.map(t => t === task ? {...t, claimed: true} : t)});
  },
  claimTier(at: number) {
    const tier = view.tiers.find(t => t.points === at);
    log.push('tier:' + at);
    if (!tier || tier.claimed || view.points < at) return;
    commit({...view, tiers: view.tiers.map(t => t === tier ? {...t, claimed: true} : t)});
  },
  go(route: string) {log.push('go:' + route); useGame.getState().open(route === 'campaign' || route === 'dungeon' ? null : route)},
};

function useElement(selector: string) {
  const [el, setEl] = useState<Element | null>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {const next = document.querySelector(selector); setEl(prev => prev === next ? prev : next); frame = requestAnimationFrame(tick)};
    tick();
    return () => cancelAnimationFrame(frame);
  }, [selector]);
  return el;
}

function Stand() {
  const current = useSyncExternalStore(fn => {listeners.add(fn); return () => listeners.delete(fn)}, () => view);
  const panel = useGame(s => s.panel), hero = useGame(s => s.p.heroClass);
  const game = useElement('.game'), body = useElement('.saga-modal[data-panel="carnival"] .panel-content');
  const art = {berserker: 'winged_helmet_warrior', ranger: 'strongman_boulder', runologist: 'whitebeard_mage'}[hero];
  return <>
    {game && carnivalVisible(current, Date.now()) && createPortal(<CarnivalButton view={current} style={{right: 0, top: 226}} onOpen={() => useGame.getState().open('carnival')}/>, game)}
    {panel === 'carnival' && body && createPortal(<CarnivalPanel view={current} actions={actions} hero={art}/>, body)}
  </>;
}
createRoot(document.getElementById('carnival-qa')!).render(<Stand/>);
