"""Collect complete seasonal profile outputs and verify expected cashflow arithmetic."""
import csv
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path

folder = Path(sys.argv[1])
name = sys.argv[2]
output = Path("docs/economy-1.0/tables")
runs = [json.loads(p.read_text()) for p in sorted(folder.glob("*.json"))]
if not runs:
    raise SystemExit("No completed profiles")
by_cohort_day = defaultdict(list)
seen_runs = set()
requested_end = int(sys.argv[3]) if len(sys.argv) > 3 else 365
currency_fields = ("gold","gems","tokens","chaosite","redDiamonds")
starting = json.loads(Path("config/test-balance.v1.json").read_text())["new_player_test_start"]
initial = {**starting,"tokens":starting["test_shop_tokens"],"redDiamonds":0}
with (output/f"players_{name}.jsonl").open("w",encoding="utf-8") as fp:
    for run in runs:
        key = (run["minutes"],run["dollars"],run["seed"],run["hero"])
        assert key not in seen_runs
        seen_runs.add(key)
        budget = run.get("lateSecondsPerMinute",60)
        last_day = requested_end or run["checkpoints"][-1]["day"]
        checkpoint_days = sorted({last_day,*(day for day in (1,7,14,30,60,90,180,365) if day <= last_day)})
        assert [row["day"] for row in run["checkpoints"]] == list(checkpoint_days)
        for row in run["checkpoints"]:
            assert 0 < row["level"] and 0 < row["stage"] and 0 < row["cp"]
            budget_seconds = row["day"]*run["minutes"]*60
            # Older scratch runs rounded both halves independently.
            assert abs(row["activity"]["seconds"] + row["activity"]["skippedSeconds"] - budget_seconds) <= 1
            row["activity"]["skippedSeconds"] = budget_seconds - row["activity"]["seconds"]
            verified_flows = {}
            for currency in currency_fields:
                total_in = sum(source.get(currency, {}).get("earned",0) for source in row["flow"].values())
                total_out = sum(source.get(currency, {}).get("spent",0) for source in row["flow"].values())
                assert math.isclose(initial[currency]+total_in-total_out,row["balances"][currency])
                verified_flows[currency] = {"earned":total_in,"spent":total_out}
            packed = {"minutes":key[0],"usd_month":key[1],"seed":key[2],"hero":key[3],
                      "late_seconds_per_minute":budget,**row,"totals":verified_flows}
            fp.write(json.dumps(packed,ensure_ascii=False,separators=(",",":"))+"\n")
            by_cohort_day[(key[0],key[1],row["day"])].append(packed)

def measures(row):
    activity = row["activity"]
    return {
        "level":row["level"],"cp":row["cp"],"stage":row["stage"],
        "seconds_in_battle_engine":activity["seconds"],"seconds_unmodeled":activity["skippedSeconds"],
        "campaign_wins":activity["wins"],"campaign_defeats":activity["defeats"],"cave_wins":activity["caveWins"],
        "paid_xtr":activity["stars"],"purchased_gems":activity["gemsPurchased"],
        "active_shop_offers":sum(offer["status"]=="available" for offer in row["offers"]),
        "regular_gear_upgrades":sum(item["upgrade"] for item in row["equipment"]),
        "dark_items_equipped":sum(bool(item) for item in row["darkEquipment"]),
        "followers":len(row["companions"]),"follower_levels":sum(f["lv"] for f in row["companions"].values()),
        "relic_levels":sum(row["relics"].values()),"rune_ranks":sum(row["runes"]["ranks"]),
        "profession_xp":(row["profession"] or {}).get("xp",0),
        "fleet_count":len(row["fleet"]),"fleet_levels":sum(boat["level"] for boat in row["fleet"]),
        **row["balances"],**row["purchasingPower"],
        **{currency+"_"+kind:value for currency,types in row["totals"].items() for kind,value in types.items()},
    }

with (output/f"players_{name}_summary.csv").open("w",encoding="utf-8",newline="") as fp:
    writer = csv.DictWriter(fp,fieldnames=["minutes","usd_month","day","n","metric","median","min","max",
                                           "min_seed","max_seed","level_100_reached"],lineterminator="\n")
    writer.writeheader()
    for (minutes,usd,day), rows in sorted(by_cohort_day.items()):
        for metric in measures(rows[0]):
            values = sorted((measures(row)[metric],row["seed"]) for row in rows)
            writer.writerow(dict(minutes=minutes,usd_month=usd,day=day,n=len(rows),metric=metric,
                                 median=statistics.median(v for v,_ in values),min=values[0][0],max=values[-1][0],
                                 min_seed=values[0][1],max_seed=values[-1][1],
                                 level_100_reached=sum(row["day100"] is not None for row in rows)))
print(f"{len(runs)} complete profiles, {len(by_cohort_day)} cohort-day snapshots")
