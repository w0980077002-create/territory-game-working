import type {Player} from '../core/types';
import {updateCarnival} from '../saga/carnival';
import {bumpCount} from '../saga/save';

/** Simulated play from three days of a closed carnival, for the isolated acceptance save. */
export function acceptedMailCarnival(player: Player) {
  const days = [
    {'win:campaign':3, horn:3, 'carnival:salvage':2, 'carnival:equip':1},
    {'win:campaign':5, 'win:farm':5, 'carnival:battleGold':150},
    {craft:2, 'carnival:salvage':4, 'win:farm':6},
  ];
  let before = player;
  for (const [index,counters] of days.entries()) {
    const next = structuredClone(before);
    for (const [key,amount] of Object.entries(counters)) bumpCount(next,key,amount);
    next.carnival = updateCarnival(before,next,Date.UTC(2026,9,index+1));
    before = next;
  }
  return updateCarnival(before,before,Date.UTC(2026,9,8));
}
