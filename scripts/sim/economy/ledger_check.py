"""Executable integer-unit accounting example. It never sends or authorizes a real payment."""
import csv
from collections import defaultdict
from pathlib import Path

UNIT = 10_000
MINIMUM = 5 * UNIT

class Model:
    def __init__(self, principal, gas_units):
        self.cash = principal
        self.gas = gas_units
        self.funds = defaultdict(int)
        self.wallets = defaultdict(int)
        self.requests = {}
        self.issued = set()
        self.confirmed = set()

    @property
    def locked(self):
        return sum(amount for _, amount, state in self.requests.values()
                   if state in {"review", "submitted"})

    @property
    def available(self):
        return self.cash - sum(self.funds.values()) - sum(self.wallets.values()) - self.locked

    def reserve(self, event, amount):
        if not 0 < amount <= self.available:
            return False
        self.funds[event] += amount
        return True

    def award(self, event, award, player, amount):
        if (event, award) in self.issued or not 0 < amount <= self.funds[event]:
            return False
        self.funds[event] -= amount
        self.wallets[player] += amount
        self.issued.add((event, award))
        return True

    def withdraw(self, request, player, amount):
        if request in self.requests or not MINIMUM <= amount <= self.wallets[player]:
            return False
        self.wallets[player] -= amount
        self.requests[request] = (player, amount, "review")
        return True

    def set_submitted(self, request, fee):
        player, amount, state = self.requests[request]
        if state != "review" or not 0 < fee <= self.gas:
            return False
        self.gas -= fee
        self.requests[request] = (player, amount, "submitted")
        return True

    def confirm(self, request, chain_id, transferred, matches_verified_recipient):
        player, amount, state = self.requests[request]
        if (
            state != "submitted" or chain_id in self.confirmed
            or transferred != amount or not matches_verified_recipient
        ):
            return False
        self.cash -= amount
        self.requests[request] = (player, amount, "confirmed")
        self.confirmed.add(chain_id)
        return True

    def reject(self, request):
        player, amount, state = self.requests[request]
        if state != "review":
            return False
        self.wallets[player] += amount
        self.requests[request] = (player, amount, "rejected")
        return True

    def snapshot(self, name):
        assert min(self.cash, self.available, self.gas, *self.wallets.values(), *self.funds.values()) >= 0
        return dict(step=name, cash_1e4_usdt=self.cash, free=self.available, reserved=sum(self.funds.values()),
                    player_available=sum(self.wallets.values()), player_locked=self.locked,
                    gas_abstract_units=self.gas, confirmed_count=len(self.confirmed))

model = Model(30*UNIT, 2)
rows = [model.snapshot("prefunded")]
assert model.reserve("league", 20*UNIT)
assert not model.reserve("over-allocation", 11*UNIT)
assert model.award("league", "first", "hero-a", 12*UNIT+300)
assert not model.award("league", "first", "hero-a", 12*UNIT+300)
assert model.award("league", "second", "hero-b", 5*UNIT)
assert not model.award("league", "excess", "hero-c", 3*UNIT)
rows.append(model.snapshot("fractional_awards"))
assert not model.withdraw("tiny", "hero-a", 300)
assert model.withdraw("a", "hero-a", 5*UNIT)
assert not model.withdraw("a", "hero-a", 5*UNIT)
assert model.withdraw("b", "hero-b", 5*UNIT)
assert model.reject("b")
assert not model.reject("b")
assert model.withdraw("b-new", "hero-b", 5*UNIT)
rows.append(model.snapshot("reserved_withdrawals"))
assert not model.set_submitted("a", 3)
assert model.set_submitted("a", 1)
assert not model.set_submitted("a", 1)
assert not model.reject("a")
assert not model.confirm("a", "chain1", 5*UNIT-1, True)
assert not model.confirm("a", "chain1", 5*UNIT, False)
assert model.confirm("a", "chain1", 5*UNIT, True)
assert not model.confirm("a", "chain1", 5*UNIT, True)
assert model.set_submitted("b-new", 1)
assert not model.confirm("b-new", "chain1", 5*UNIT, True)
rows.append(model.snapshot("one_confirmed_one_in_flight"))
assert model.confirm("b-new", "chain2", 5*UNIT, True)
assert model.wallets["hero-a"] == 7*UNIT+300
rows.append(model.snapshot("reconciled"))
with Path("docs/economy-1.0/tables/ledger_check.csv").open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=list(rows[0]),lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
print("Ledger example: all reserve, duplicate, locked balance, amount and reconciliation assertions passed.")
