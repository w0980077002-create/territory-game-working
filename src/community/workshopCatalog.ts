export const professions = {
  smith: {ru:'Кузнец',en:'Smith',own:'craft-ingot',partner:'craft-inlay',product:'workshop-blade'},
  leatherworker: {ru:'Кожевник',en:'Leatherworker',own:'craft-hide',partner:'craft-ingot',product:'workshop-grip'},
  tailor: {ru:'Портной',en:'Tailor',own:'craft-cloth',partner:'craft-hide',product:'workshop-mantle'},
  jeweler: {ru:'Ювелир',en:'Jeweler',own:'craft-inlay',partner:'craft-cloth',product:'workshop-charm'},
} as const;
export type WorkshopState = {profession: keyof typeof professions|null; canGather:boolean;verified:boolean};
