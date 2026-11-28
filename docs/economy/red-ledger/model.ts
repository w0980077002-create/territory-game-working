/** Offline acceptance model. One unit is 0.0001 USDT. No network or payout dependencies. */
interface Balance { available: bigint; held: bigint }
interface Withdrawal {
  player: string;
  amount: bigint;
  destination: string;
  created: number;
  state: 'requested' | 'approved' | 'rejected' | 'paid';
  tx?: string;
}
export interface Ledger {
  reserve: bigint;
  feeReserve: bigint;
  fund: bigint;
  wallets: Record<string, Balance>;
  withdrawals: Record<string, Withdrawal>;
  operations: Record<string, string>;
  transactions: Record<string, boolean>;
}

export const freshLedger = (): Ledger => ({
  reserve: 0n, feeReserve: 0n, fund: 0n,
  wallets: {}, withdrawals: {}, operations: {}, transactions: {},
});
const minimum = 50_000n;
const reviewWindow = 14 * 86_400_000;
const id = /^[A-Za-z0-9_-]{1,80}$/;
const txHash = /^[a-f0-9]{64}$/;

type Command =
  | {kind: 'fund'; principal: bigint; fees: bigint; ref: string}
  | {kind: 'award'; player: string; amount: bigint; event: string}
  | {kind: 'spend'; player: string; sku: 'appearance'; amount: bigint}
  | {kind: 'request'; player: string; amount: bigint; destination: string; at: number}
  | {kind: 'approve'; request: string; at: number}
  | {kind: 'reject'; request: string; at: number}
  | {kind: 'settle'; request: string; tx: string; fee: bigint};

/** The future adapters must supply authenticated identities and verified proof. Commands are trusted test inputs here. */
export function apply(state: Ledger, op: string, command: Command): Ledger {
  if (!id.test(op)) throw Error('invalid_operation');
  const signature = JSON.stringify(command, (_, value) => typeof value === 'bigint' ? 'units:' + value : value);
  if (Object.hasOwn(state.operations, op)) {
    if (state.operations[op] !== signature) throw Error('operation_conflict');
    return state;
  }
  const next = structuredClone(state);
  const wallet = (player: string): Balance => {
    if (!id.test(player)) throw Error('invalid_player');
    if (!Object.hasOwn(next.wallets, player)) {
      Object.defineProperty(next.wallets, player, {value: {available: 0n, held: 0n}, enumerable: true});
    }
    return next.wallets[player];
  };
  const positive = (amount: bigint) => {
    if (amount <= 0n) throw Error('invalid_amount');
  };
  switch (command.kind) {
    case 'fund':
      if (!txHash.test(command.ref) || Object.hasOwn(next.transactions, command.ref)) throw Error('duplicate_funding');
      if (command.principal < 0n || command.fees < 0n || command.principal + command.fees === 0n) throw Error('invalid_funding');
      next.transactions[command.ref] = true;
      next.reserve += command.principal;
      next.fund += command.principal;
      next.feeReserve += command.fees;
      break;
    case 'award':
      positive(command.amount);
      if (!id.test(command.event) || Object.hasOwn(next.operations, 'event:' + command.event)) throw Error('duplicate_award');
      if (next.fund < command.amount) throw Error('unfunded');
      next.fund -= command.amount;
      wallet(command.player).available += command.amount;
      next.operations['event:' + command.event] = op;
      break;
    case 'spend': {
      if (command.sku !== 'appearance' || command.amount !== 300n) throw Error('wrong_price');
      const account = wallet(command.player);
      if (account.available < command.amount) throw Error('insufficient');
      account.available -= command.amount;
      next.fund += command.amount;
      break;
    }
    case 'request': {
      if (command.amount < minimum || !id.test(command.destination) || !Number.isSafeInteger(command.at) || command.at < 0) throw Error('invalid_request');
      if (Object.values(next.withdrawals).some(r => r.player === command.player && ['requested', 'approved'].includes(r.state))) throw Error('request_pending');
      const account = wallet(command.player);
      if (account.available < command.amount) throw Error('insufficient');
      account.available -= command.amount;
      account.held += command.amount;
      Object.defineProperty(next.withdrawals, op, {value: {player: command.player, amount: command.amount,
        destination: command.destination, created: command.at, state: 'requested'}, enumerable: true});
      break;
    }
    case 'approve':
    case 'reject':
    case 'settle': {
      if (!Object.hasOwn(next.withdrawals, command.request)) throw Error('unknown_request');
      const request = next.withdrawals[command.request];
      const account = wallet(request.player);
      if (command.kind === 'approve') {
        if (request.state !== 'requested' || !Number.isSafeInteger(command.at) ||
          command.at < request.created || command.at > request.created + reviewWindow) throw Error('approval_unavailable');
        request.state = 'approved';
      } else if (command.kind === 'reject') {
        if (request.state !== 'requested' || !Number.isSafeInteger(command.at) || command.at < request.created) throw Error('rejection_unavailable');
        request.state = 'rejected';
        account.held -= request.amount;
        account.available += request.amount;
      } else {
        if (request.state !== 'approved' || !txHash.test(command.tx) || Object.hasOwn(next.transactions, command.tx) ||
          command.fee < 0n || next.feeReserve < command.fee) throw Error('settlement_unavailable');
        request.state = 'paid';
        request.tx = command.tx;
        next.transactions[command.tx] = true;
        account.held -= request.amount;
        next.reserve -= request.amount;
        next.feeReserve -= command.fee;
      }
      break;
    }
  }
  Object.defineProperty(next.operations, op, {value: signature, enumerable: true});
  assertBacked(next);
  return next;
}

export function assertBacked(state: Ledger): void {
  if (state.reserve < 0n || state.feeReserve < 0n || state.fund < 0n) throw Error('negative_reserve');
  const balances = Object.values(state.wallets);
  if (balances.some(({available, held}) => available < 0n || held < 0n)) throw Error('negative_balance');
  const obligations = balances.reduce((sum, {available, held}) => sum + available + held, 0n);
  if (obligations + state.fund !== state.reserve) throw Error('backing_mismatch');
}
