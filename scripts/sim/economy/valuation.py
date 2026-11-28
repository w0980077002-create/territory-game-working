"""Price and acquisition worksheet sourced from the generated catalog."""
import csv
import json
import math
from pathlib import Path

ROOT = Path("docs/economy-1.0")
CATALOG = json.loads((ROOT / "catalog.json").read_text())
STAGE = next(row for row in CATALOG["rules"]["stageSamples"] if row["stage"] == 60)
RULES = {
    "item.perk": ("Уникальный эффект боя", "См. конкретный бой или гарантию в perks", "Условная гарантия или региональный бросок"),
    "item.unique": ("Уникальный эффект боя", "Строки drops в core/gear.ts", "Один источник может иметь другие условия"),
    "item.template": ("Базовые характеристики и CP", "Штатный генератор, трофей, крафт", "Зависит от режима, слота и источника"),
    "item.dark": ("Тёмная энергия и условные эффекты боя", "Финал Царства тьмы", "Вес редкости масштабируется этажом"),
    "socket.gem": ("Вклад в стат гнезда", "Случайный цвет в Пещере/лавке, синтез", "1/6 по цвету при выпадении камня"),
    "relic": ("Постоянный стат, условия или боевой эффект", "Открытие за золото и осколки", "Условия открытия конкретной реликвии"),
    "follower": ("Командный эффект, атакующий/защитный", "Стартовые спутники, рынок призыва, призы событий", "Шанс по слоту/порогам гарантий"),
    "rune": ("Модификатор навыка и резонанс", "Свитки, крафт из пыли, события", "1/9 за бросок базового призыва"),
    "set": ("Условные эффекты 2/4/6 частей", "Именованная зона, Рог или крафт", "Сетовый множитель зависит от источника"),
    "consumable": ("Расходуемый боевой эффект", "Лавка и доверенный запас Арены", "Фиксированная покупка"),
    "ship": ("Пассивная выдача красных игровых алмазов", "Старт или постройка за золото", "Покупка / сутки с буфером 12 ч"),
    "profession": ("Изготовление мастерских предметов", "Выбор после этапа 11", "Одна личная профессия"),
    "material": ("Расходуется в кузнице и реликвиях", "Кампания, лавка и обмен 3:1", "Регион и тип волны"),
    "stars": ("Пополнение аккаунта или поддержка", "Платёжный SKU", "Тест требует роли администратора"),
}
RESOURCE_ORIGINS = {
    "gold":"Кампания, шахта, награды, разбор", "gems":"Награды, задания, платный перенос",
    "tokens":"Арена, стартовые тестовые, награды", "chaosite":"Шахта, лавка, награды",
    "horn":"Восстановление и награды", "xp":"Бои, награды и разбор натуральных вещей",
    "redDiamonds":"Корабли",
}
MARKET_VALUES = {
    "material": "80 золота за региональный материал в базовой модели рынка",
    "set": "1,20/0,90 × (цена рецепта + материалы × курс + минуты × доход/мин)",
    "item.server": "Медиана независимых завершённых сопоставимых продаж, после появления выборки",
    "ship": "12 000 золота + 40 материалов для дополнительной постройки, гипотеза",
    "socket.gem": "Целевой цвет 1-го уровня: 180 самоцветов через шесть случайных покупок",
    "consumable": "Действующая цена до измерения спроса и эффекта в боях",
    "relic": "Действующая цена открытия и развития, привязано к герою",
    "follower": "Действующая ступень в душах до замера предельной полезности после уровня 20",
    "rune": "Ориентир 180 свитков за первую целевую руну при независимых бросках",
    "profession": "Действующий вклад материалов и время до роста; рынок оценит изделие",
}

def record(row):
    group, id, d = row["category"], row["id"], row["data"]
    use, origin, odds = RULES.get(group, ("", "", ""))
    if group == "item.perk":
        origin = d["source"]
    if group == "resource.solo":
        origin, use = d["source"], d["use"]
    if group == "resource.dark":
        origin = d["source"]
    if group == "wallet.solo":
        origin = RESOURCE_ORIGINS[id]
    if group == "shop":
        origin, use = "Лавка", d["description"]
    if group.startswith("quest.") or group in {"activity","carnival.day","carnival.milestone","progression","event","mastery","honor"}:
        origin, use = "Выполнение условия или событие", "Начисление игровых наград"
    if group == "item.unique":
        odds = {source:[entry["chance"] for entry in entries] for source,entries in d["modeOdds"].items() if entries}
    if group == "follower":
        odds = [next((x["chance"] for x in slot if x["id"]==id),0) for slot in d["offerOdds"]]
    if group == "item.template":
        odds = {"rarity_before_special_cases_at_blessing_1":d["genericRandomRarityAtBlessing1"]}
    if group == "rune":
        odds = d["rankOneRandomOdds"]

    acquire = d.get("unlock")
    free_cap = d.get("limit")
    mean_attempts = None
    time_minutes = None
    expected_cost = None
    estimate = MARKET_VALUES.get(group)
    if group == "socket.gem":
        count = 3**(d["level"]-1)
        mean_attempts = {"random_shop_purchases":6*count}
        if d["level"] <= 3:
            mean_attempts["repeat_realm_finals_type_chance_at_matching_level"] = 10
        expected_cost = {"solo_gems_if_shop_level1_only":180*count,
                         "synthesis_additional_gold":sum(50*i*3**(d["level"]-1-i) for i in range(1,d["level"]))}
        free_cap = "Один цветной камень за успешный бросок; цена по свободному запасу"
    if group == "rune":
        mean_attempts = 9
        expected_cost = {"scroll":9*d["summonScrolls"]}
        free_cap = "30 свитков в день за первые 5 побед, плюс 20 из лавки и призы"
    if group == "ship":
        acquire = {"gold":d["gold"]}
        free_cap = {"diamonds_unclaimed_at_level_5":d["maxStoredHours"]*5}
        expected_cost = acquire
    if group == "set":
        acquire = d["regularCraftAtSample"]
        base = acquire["gold"]+acquire["mats"]*80+4*40
        estimate = {"sample_hero_level_25_gold":math.ceil(base*1.20/.9)}
    if group == "shop":
        acquire = {d["currency"]:d["price"]}
        if d.get("limit"):
            free_cap = {"daily":"Одна покупка в сутки","weekly":"Одна покупка в неделю","once":"Одна покупка за профиль"}[d["limit"]]
        estimate = "Пересчитать по корзине; текущая сравнительная цена в actual_purchase"
    if group == "consumable":
        acquire = {"gold_by_stage":d["pricesGold"]}
    if group == "follower":
        acquire = {"souls":d["souls"]}
        repeat = (1-odds[1])*(1-odds[2])*(1-odds[0])
        if repeat < 1:
            mean_attempts = {"independent_refreshes_before_guarantees":1/(1-repeat)}
    if group == "stars":
        acquire = {"XTR":d["stars"]}
        estimate = {"usd_project_equivalent":d["stars"]*.013,"usd_customer_at_point02":d["stars"]*.02}
        free_cap = 0
    if group == "item.template":
        estimate = {"npc_salvage_floor_gold":d["salvageNaturalDrop"]["gold"],
                    "stage60_boss_rewards":round(d["salvageNaturalDrop"]["gold"]/STAGE["gold"]["boss"],5)}
    if group == "item.unique":
        mean_attempts = {source:1/chances[0] for source,chances in odds.items() if chances[0]>0}
    if group == "material" and id == "dusk":
        origin = "Финал Царства тьмы"
        odds = 1
        mean_attempts = {"first_floor":1}
        runs = json.loads((ROOT/"tables"/"cave_repeats.json").read_text())
        time_minutes = {"first_floor_test_hero":round(sum(run["seconds"] for run in runs)/(60*len(runs)),2)}
        expected_cost = {"chaosite_first_floor":5}
        free_cap = "У босса Пещеры нет суточного предела Камней Сумрака"
        estimate = "Привязанная ценность, текущий расход на усиление и пробуждение"
    if id == "redDiamonds":
        use = "Печать призыва за 20, игровой баланс"
        free_cap = {"per_full_buffer_max_fleet":180}
        estimate = {"units_per_seal":20,"redeemable_usdt":0}
    if group == "market":
        estimate = {"target_fee_percent":10}
    tradable = group == "item.server" or group == "wallet.server" and id == "gold"
    return dict(category=group,id=id,name=row["name"],rarity=d.get("rarity"),utility=use or None,origin=origin or None,
                drop_probability=odds or None,mean_acquisition_attempts=mean_attempts,
                time_minutes=time_minutes,expected_cost=expected_cost,free_availability=free_cap,
                actual_purchase=acquire,actual_sale=d.get("buyPrice"),upgrade=d.get("upgrade",d.get("levels",d.get("upgrades"))),
                craft=d.get("regularCraftAtSample"),salvage=d.get("salvage",d.get("salvageNaturalDrop")),
                marketplace=tradable,recommended_value=estimate,source=row["source"])

rows = [record(row) for row in CATALOG["items"]]
with (ROOT / "tables" / "valuation.csv").open("w",encoding="utf-8",newline="") as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator="\n")
    writer.writeheader()
    writer.writerows({
        key:json.dumps(value,ensure_ascii=False,separators=(",",":")) if isinstance(value,(list,dict)) else value
        for key,value in row.items()
    } for row in rows)
print(len(rows),"valuation rows")
