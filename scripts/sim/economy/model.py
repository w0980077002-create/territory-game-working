"""Deterministic proposal estimates. Run from the repository root; no live calls."""
import csv
import itertools
import json
import math
from pathlib import Path

OUT = Path("docs/economy-1.0/tables")
OUT.mkdir(parents=True, exist_ok=True)
AUDIENCES = (100, 1_000, 5_000, 10_000, 50_000, 100_000, 1_000_000)
# MAU / registered, DAU / MAU, D1/D7/D30 cohort retention, payer conversion / MAU,
# non-ship transactions per payer and average ticket, share of payers buying a ship,
# repeat ship units per ship buyer, ad participation, impressions per ad user-day, net eCPM.
MARKET = {
    "cautious": (.12, .16, .22, .07, .03, .01, 1.10, 5, .12, .05, .10, 1, 1),
    "base": (.25, .24, .34, .14, .07, .025, 1.45, 8, .22, .20, .22, 1.6, 3),
    "strong": (.40, .34, .46, .23, .14, .05, 1.80, 12, .32, .35, .30, 2, 6),
}
# Combined effective expense curves are hypotheses including support and infrastructure;
# the tax provision is a sensitivity and does not assert the Ukrainian tax basis.
FIXED_OPEX = {"cautious": 200, "base": 600, "strong": 1500}
SHIP_USD = 5
SHIP_XTR = 250
STAR_USD = .013
EFFECTIVE_PLATFORM_RATE = .65
REFUND_HOLD = .08
NETWORK_FEE_USD = .10
MIN_PAYOUT_USDT = 5
FUND_FRACTION = .20
SEA_BLUE_PER_SEASON = 120
SEASON_DAYS = 90

def write(name, rows):
    rows = list(rows)
    if not rows:
        raise ValueError(name)
    with (OUT / (name+".csv")).open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]),lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: round(value, 5) if isinstance(value, float) else value
                             for key, value in row.items()})

def finance(n, scenario, *, month=1, active=1, income=1, refund=.03, rate=EFFECTIVE_PLATFORM_RATE,
            fund=FUND_FRACTION, load=1, tax=.10):
    mau_share, sticky, d1, d7, d30, conversion, tx, ticket, ship_conv, repeat, ad_share, ad_views, ecpm = MARKET[scenario]
    mau = n * mau_share * active
    dau = mau * sticky
    paying = mau * conversion
    ship_first = paying * ship_conv
    ship_repeat = ship_first * repeat
    other = paying * tx * ticket * income
    ships = (ship_first + ship_repeat) * SHIP_USD * income
    gross = ships + other
    platform = gross * (1-rate)
    refunds = gross * rate * refund
    sales_net = gross - platform - refunds
    # Steady-state uses prior settlements. On launch defer 21/30 of sales
    # under uniform sales timing. Refunds and payout eligibility are modeled separately.
    deferred = sales_net * .7 if month == 1 else 0
    ad_impressions = 30*dau*ad_share*ad_views
    ads = ad_impressions * ecpm/1000 * income
    gross_cleared = sales_net-deferred+ads
    refund_reserve = sales_net*REFUND_HOLD
    infrastructure = 45+.012*mau*load
    operations = FIXED_OPEX[scenario]+.22*paying+.008*mau
    tax_provision = gross_cleared*tax
    available = gross_cleared-refund_reserve-infrastructure-operations-tax_provision
    target_fund = sales_net*fund
    # No discretionary spend if cashflow cannot support principal AND a separate gas reserve.
    reward_principal = min(target_fund, max(0,available)/(1+NETWORK_FEE_USD/MIN_PAYOUT_USDT))
    gas_reserve = reward_principal/MIN_PAYOUT_USDT*NETWORK_FEE_USD
    return dict(
        registered=n,scenario=scenario,month=month,mau=mau,dau=dau,d1=d1,d7=d7,d30=d30,
        conversion=conversion,payers=paying,avg_payment=gross/max(1e-12,(paying*tx+ship_first+ship_repeat)*income),
        arppu=gross/max(1e-12,paying),other_transactions=paying*tx*income,ship_first_units=ship_first*income,
        ship_repeat_units=ship_repeat*income,ship_gross=ships,other_gross=other,gross_sales=gross,
        platform_withheld=platform,refunds=refunds,eligible_sales=sales_net,settlement_deferred=deferred,
        ad_impressions=ad_impressions,ad_revenue=ads,cleared_revenue=gross_cleared,refund_reserve=refund_reserve,
        infrastructure=infrastructure,operations=operations,tax_provision=tax_provision,
        target_reward=target_fund,authorized_new_principal=reward_principal,fee_reserve=gas_reserve,
        unallocated_cash=available-reward_principal-gas_reserve,
    )

write("finance", (finance(n,case,month=month) for n,case,month in itertools.product(AUDIENCES,MARKET,[1,6])))
write("finance_sensitivity", (
    {"project_share":rate,"reward_fraction":fund,"effective_tax_assumption":tax,
     **finance(n,"base",month=6,rate=rate,fund=fund,tax=tax)}
    for n,rate,fund,tax in itertools.product(AUDIENCES,[.40,.52,.65,.80],[.10,.20,.30],[0,.10,.20])
))
STRESS = {
    "month_3_no_new_users": {"active":.65**3},
    "month_6_no_new_users": {"active":.65**6},
    "income_minus_50pct": {"income":.50},
    "income_minus_90pct": {"income":.10},
    "refund_35pct": {"refund":.35},
    "refund_70pct": {"refund":.70},
    "load_x10": {"load":10},
    "load_x100": {"load":100},
}
write("finance_stress", ({"stress": label, **finance(n,case,month=6,**args)}
                        for n,case,(label,args) in itertools.product(AUDIENCES,MARKET,STRESS.items())))
write("payout_queue", (
    dict(prior_funded_principal=principal,request_share=share,minimum_usdt=minimum,
         max_requests=math.floor(principal*share/minimum),fees_at_010=math.floor(principal*share/minimum)*.10,
         fees_at_050=math.floor(principal*share/minimum)*.50,
         reviewers_required_at_8_min=math.ceil(math.floor(principal*share/minimum)*8/(14*6*60)))
    for principal,share,minimum in itertools.product([300,3_000,30_000,300_000],[.25,1],[3,5])
))

# Ship rewards per completed trip at level 1, baseline hull, before multipliers.
# Longer voyages are less rewarding per hour. Blue is a pilot max, denominated in whole units.
ROUTES = {
    1:(110,0,1,0,65), 4:(380,1,2,1,210), 8:(680,2,3,2,350),
    12:(960,2,4,3,480), 24:(1680,3,6,5,780),
}
HULLS = {
    "scout": (1.00, 1.00, 1.20, 1.00),
    "merchant": (1.20, 1.00, 1.00, 1.00),
    "warship": (1.00, 1.00, 1.15, 1.10),
    "north_dragon": (1.05, 1.00, 1.10, 1.10),
    "odin_flagship": (1.05, 1.00, 1.05, 1.20),
}
LEVEL = (1,1.12,1.24,1.36,1.48)
UPGRADE = ((1200,6),(3000,10),(6400,18),(12000,30))
UPGRADE_ON_DAY = (7,30,90,180)
DAYS = (0,7,30,90,180,365)
SALVAGE = {"conservative":(250,.15), "balanced":(480,.30), "generous":(700,.45)}
# Day 0 consists of acquisition only. Day d includes d completed-day opportunities.
def voyage(hours, level, hull):
    gold, blue, material, seals, repair = ROUTES[hours]
    g,b,m,s = HULLS[hull]
    k=LEVEL[level-1]
    return (math.floor(gold*g*k), math.floor(blue*b*k), math.floor(material*m*k),
            math.floor(seals*s*k), math.ceil(repair*(1+(level-1)*.08)))

def ship_lifecycle(days, hull, provenance, option, cadence):
    acquisition_gold, acquisition_materials = (12_000,40) if provenance=="crafted" else (0,0)
    stars = SHIP_XTR if provenance.startswith("stars") else 0
    level=1
    season_blue=0
    gross=blue=materials=seals=repairs=upgrade_gold=upgrade_materials=0
    for day in range(1, days+1):
        if day in UPGRADE_ON_DAY:
            gold, mats = UPGRADE[level-1]
            upgrade_gold += gold
            upgrade_materials += mats
            level += 1
        if cadence == "six_4h":
            trips = [4]*6
        elif cadence == "irregular":
            trips = [24] if day % 2 == 0 else []
        else:
            trips = [24]
        if (day-1) % SEASON_DAYS == 0:
            season_blue = 0
        daily_blue = 0
        for hours in trips:
            g,b,m,s,r=voyage(hours,level,hull)
            gross += g
            daily_blue += b
            materials += m
            seals += s
            repairs += r
        granted = min(4,daily_blue,SEA_BLUE_PER_SEASON-season_blue)
        blue += granted
        season_blue += granted
    base, rate = SALVAGE[option]
    #% rate applies to actual inputs, never to resale price or estimated value.
    cap = max(0,base- blue) if provenance=="stars_final" else 0
    salvage_gold = math.floor((acquisition_gold+upgrade_gold)*rate)
    salvage_materials = math.floor((acquisition_materials+upgrade_materials)*rate)
    assert salvage_gold <= acquisition_gold+upgrade_gold and salvage_materials <= acquisition_materials+upgrade_materials
    assert stars or cap == 0
    assert cap == 0 or cap+blue <= base
    return dict(day=days,hull=hull,origin=provenance,option=option,cadence=cadence,
                level=level,acquisition_gold=acquisition_gold,acquisition_materials=acquisition_materials,
                paid_xtr=stars,gross_gold=gross,trip_blue=blue,trip_materials=materials,sea_seals=seals,
                repair_gold=repairs,upgrade_gold=upgrade_gold,upgrade_materials=upgrade_materials,
                salvage_blue=cap,salvage_gold=salvage_gold,salvage_materials=salvage_materials,
                net_gold=gross-repairs-upgrade_gold-acquisition_gold+salvage_gold,
                net_material=materials-upgrade_materials-acquisition_materials+salvage_materials,
                total_game_blue=blue+cap,withdrawable=0)
write("ship_lifecycle", (ship_lifecycle(*args) for args in itertools.product(
    DAYS,HULLS,("starter","crafted","stars_pending","stars_final"),SALVAGE,("daily_24h","six_4h","irregular"))))
write("ship_routes", (dict(hull=hull,level=level,hours=hours,
    **dict(zip(("gross_gold","blue","material","seal","repair_gold"),voyage(hours,level,hull))))
    for hull,level,hours in itertools.product(HULLS,range(1,6),ROUTES)))
write("ship_fleet_cap", (dict(density=density,ships=ships,claimed_days=days,max_per_ship_blue=4,
    in_game_blue_max=((days//SEASON_DAYS)*SEA_BLUE_PER_SEASON+min(SEA_BLUE_PER_SEASON,(days%SEASON_DAYS)*min(8,4*ships)))*density,paid_ship_salvage_blue_max=ships*480*density,
    redeemable_principal_delta=0)
    for density,ships,days in itertools.product(AUDIENCES,[1,3,5],[7,30,365])))

def recipe(supply_minutes, base_gold, grams, seller_capacity, buyers, source, labor_rate, material_quote):
    cost = base_gold+grams*material_quote+supply_minutes*labor_rate
    price = math.ceil(cost*1.20/.9)
    fee = math.ceil(price*.10)
    return dict(recipe_base_gold=base_gold,materials=grams,material_unit_shadow_price=material_quote,
                crafting_minutes=supply_minutes,shadow_gold_per_minute=labor_rate,cost=cost,
                suggested_price=price,fee=fee,profit=price-fee-cost,
                sellable_per_1000_mau=seller_capacity,demand_per_1000_mau=buyers,
                shortage_per_1000_mau=max(0,buyers-seller_capacity),external_revenue=0,inputs_source=source)

recipes=[
    ("smith_set_25",4,1500,12,30,36,"craftPlan effective level 25"),
    ("leatherworker_set_25",4,1500,12,21,28,"craftPlan effective level 25"),
    ("tailor_set_25",4,1500,12,22,24,"craftPlan effective level 25"),
    ("jeweler_set_25",4,1500,12,20,34,"craftPlan effective level 25"),
    ("masterwork_25",6,2250,18,13,19,"craftPlan effective level 25"),
    ("ship_gear",7,2800,20,16,22,"proposal"),
    ("consumable_batch",2,500,4,110,90,"proposal"),
]
write("market_scenarios", ({"recipe":id,"scenario":scenario,
      **recipe(minutes,base,grams,math.floor(capacity*ratio),math.ceil(demand/ratio),source, labor, ore)}
    for id,minutes,base,grams,capacity,demand,source in recipes
    for scenario,ratio,labor,ore in [("abundant",2,20,30),("base",1,40,80),("scarce",.5,120,200)]))
write("market_stress", (dict(real_trades=1000,wash_trades=wash,typical_price=price,fee_percent=10,
     wash_cost=wash*math.ceil(price*.10),external_income=0,
     annual_coin_units_at_start=balance,emission_multiplier=mult,
     gold_emitted=balance*mult,gold_sunk=.85*balance+wash*math.ceil(price*.10),
     gold_supply_delta=balance*mult-.85*balance-wash*math.ceil(price*.10))
     for wash,price,balance,mult in itertools.product([0,1000,10000],[3000],[10_000_000],[1,2,5])))

# Reference outputs are an envelope at constant measured rates from PR #93.
# They are not a prediction of actual annual combat, nor an approved XP rebalance.
xp_config = json.loads(Path("config/test-balance.v1.json").read_text())["progression_test_settings"]

def xp_threshold(level):
    if level <= 25:
        return math.floor(xp_config["level_exp_base"]*xp_config["level_exp_multiplier"]**(level-1)+.5)
    offset=level-25
    return xp_threshold(25)+offset*(1500+60*offset)

def pacing(label, daily_xp_at_90, minutes, utilization):
    xp100=sum(map(xp_threshold,range(1,100)))
    earned=daily_xp_at_90*minutes/90*utilization
    return dict(source=label,minutes=minutes,productive_share=utilization,
                xp_per_day=earned,xp_to_100=xp100,day_100=math.ceil(xp100/earned),
                xp_required_per_day_for_350=xp100/350,
                rate_ratio_for_350=xp100/(350*earned))
write("xp_pacing", (pacing(label,xp,min_per_day,activity_share)
                    for label,xp in [("PR93_campaign",100956),("PR93_farm",105327),("PR93_early_legend",165761)]
                    for min_per_day,activity_share in itertools.product([30,90,180],[.25,.5,.75,1])))

def annual(n, case):
    calendar = [finance(n,case,month=month) for month in range(1,13)]
    summed = ("gross_sales","platform_withheld","refunds","ad_revenue","cleared_revenue","infrastructure",
              "operations","tax_provision","target_reward","authorized_new_principal","fee_reserve",
              "unallocated_cash","ship_first_units","ship_repeat_units")
    return dict(registered=n,scenario=case,year_end_pending_settlement=calendar[0]["settlement_deferred"],
                **{key:sum(month[key] for month in calendar) for key in summed})
write("finance_annual", (annual(n,case) for n,case in itertools.product(AUDIENCES,MARKET)))

def load_budget(n, case, factor):
    cohort = finance(n,case,month=6)
    # A daily active user causes 25 reward/market writes and 60 reads,
    # spread evenly over 24 h, with 6x peak-to-mean. This is a capacity assumption.
    peak = 6*factor/(24*3600)
    return dict(registered=n,scenario=case,load_factor=factor,baseline_dau=cohort["dau"],
                peak_write_rps=cohort["dau"]*25*peak,peak_read_rps=cohort["dau"]*60*peak,
                daily_write_requests=25*cohort["dau"]*factor,daily_read_requests=60*cohort["dau"]*factor)
write("load_budget", (load_budget(n,case,factor)
                      for n,case,factor in itertools.product(AUDIENCES,MARKET,[1,10,100])))

def refund_catchup(n, case, share):
    reference = finance(n,case,month=6)
    historical_claim = reference["gross_sales"]*EFFECTIVE_PLATFORM_RATE*share
    reserve = reference["refund_reserve"]
    uncovered = max(0,historical_claim-reserve)
    return dict(registered=n,scenario=case,prior_month_refund_share=share,
                historical_claim=historical_claim,refund_reserve=reserve,
                uncovered_before_operating_cash=uncovered,
                already_funded_prize_principal_untouched=reference["authorized_new_principal"],
                cash_after_claim_excluding_prize_escrow=reference["unallocated_cash"]-uncovered)
write("refund_catchup", (refund_catchup(n,case,share)
                         for n,case,share in itertools.product(AUDIENCES,MARKET,[.35,.70])))
