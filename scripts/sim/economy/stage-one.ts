import economy from '../../../config/economy-stage-1.json';

const scenario = process.env.SIM_BALANCE ?? '50';
if (scenario === 'baseline') {
  Object.assign(economy, {
    repeatSupplyPercent:100, mineFullReward:{gold:86400,chaosite:720},
    lateCampaignGoldPercent:100,
    lateUpgrade:{fromRank:10,marginalPercent:100},lateCraft:{fromLevel:25,marginalPercent:100},
    shop:{mineReserve:{gold:150,chaosite:10},longMarch:{gold:260,chaosite:15}},
  });
} else {
  const reduction = Number(scenario);
  if (![40,50,60].includes(reduction)) throw new Error('Expected baseline, 40, 50 or 60');
  economy.repeatSupplyPercent = 100 - reduction;
}
void import('./year');
