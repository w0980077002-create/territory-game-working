import economy from '../../config/economy-stage-1.json';

export function repeatSupply(amount: number): number {
  return Math.round(amount * economy.repeatSupplyPercent / 100);
}

/** Scale the preview and settlement together at the source. */
export function repeatReward<T extends {gems?: number; chaosite?: number}>(reward: T): T {
  return {
    ...reward,
    ...(reward.gems === undefined ? {} : {gems: repeatSupply(reward.gems)}),
    ...(reward.chaosite === undefined ? {} : {chaosite: repeatSupply(reward.chaosite)}),
  };
}

/** The early price is a floor. Only the part above it gets the late price factor. */
export function lateGoldPrice(price: number, earlyPrice: number, marginalPercent: number): number {
  return Math.round(Math.min(price, earlyPrice) + Math.max(0, price - earlyPrice) * marginalPercent / 100);
}
