"""Export paired economy checkpoints from the reusable audit runner."""
import csv
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
dest = Path(sys.argv[2])
week = "--week" in sys.argv[3:]
variants = ("baseline", "50") if week else ("baseline", "40", "50", "60")
days = (1, 7) if week else (1, 7, 30)
rows = []
for variant in variants:
    for usd in (0, 5):
        run = json.loads((source / f"{variant}-{usd}.json").read_text())
        assert run["dollars"] == usd and run["minutes"] == 90 and run["seed"] == 17
        for point in run["checkpoints"]:
            if point["day"] not in days:
                continue
            if week:
                assert point["activity"]["seconds"] == point["day"] * 5400
                assert point["activity"]["skippedSeconds"] == 0
            row = {
                "supply_reduction": variant, "usd_month": usd, "day": point["day"],
                "stage": point["stage"], "level": point["level"], "cp": point["cp"],
                "engine_seconds": point["activity"]["seconds"], "cave_wins": point["activity"]["caveWins"],
                "campaign_defeats": point["activity"]["defeats"],
                "xtr": point["activity"]["stars"], "purchased_gems": point["activity"]["gemsPurchased"],
            }
            for currency in ("gold", "gems", "chaosite"):
                for direction in ("earned", "spent"):
                    row[f"{currency}_{direction}"] = sum(
                        actions.get(currency, {}).get(direction, 0) for actions in point["flow"].values()
                    )
                row[f"{currency}_balance"] = point["balances"][currency]
            row["mine_chaosite"] = point["flow"].get("mine", {}).get("chaosite", {}).get("earned", 0)
            row["seals_at_20_gems"] = point["purchasingPower"]["gemsIn20GemSeals"]
            row["cave_entries_at_5_chaosite"] = point["balances"]["chaosite"] // 5
            row["gold_in_stage_boss_rewards"] = point["purchasingPower"]["coinsInStageBossAwards"]
            rows.append(row)
assert len(rows) == len(variants) * 2 * len(days)
with dest.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=rows[0], lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
