import json
import re
import string
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

if "--build-histories" not in sys.argv:
    import requests
    from bs4 import BeautifulSoup

BASE_URL = "https://sports-tek.active.com/TMOnline"
DB = r"upload\LarkhallAvondaleASC.mdb"
DATA_DIR = Path(__file__).parent.parent / "data"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}
DELAY = 0.5


def make_session():
    session = requests.Session()
    session.headers.update(HEADERS)
    session.get(
        f"{BASE_URL}/index.asp",
        params={"theTeam": "LarkhallAvondaleASC", "REMOTE": "T"},
        timeout=30,
    )
    return session


def get_soup(session, url, params=None):
    resp = session.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def find_data_table(soup):
    t = soup.find("table", id="FieldTable") or soup.find("table", id="fieldtable")
    if t:
        return t
    tables = soup.find_all("table")
    return max(tables, key=lambda t: len(t.find_all("tr"))) if tables else None


def data_rows(table):
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if cells:
            yield cells


def parse_date(date_str):
    try:
        return datetime.strptime(date_str.strip(), "%m/%d/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return date_str.strip()


def parse_dist_course(dist_str, fallback_course=""):
    dist_str = dist_str.strip()
    suffix_map = {"S": "SCM", "L": "LCM", "Y": "Yards"}
    if dist_str and dist_str[-1].upper() in suffix_map:
        return dist_str[:-1], suffix_map[dist_str[-1].upper()]
    return dist_str, fallback_course


STROKE_EXPAND = {
    "Back": "Backstroke",
    "Breast": "Breaststroke",
    "Fly": "Butterfly",
    "Free": "Freestyle",
    "Fr": "Freestyle",
    "IM": "IM",
}

COURSE_MAP = {"S": "SCM", "L": "LCM", "Y": "Yards"}


def fetch_athletes(session):
    athletes = {}
    for letter in string.ascii_uppercase:
        soup = get_soup(session, f"{BASE_URL}/aATHLETE.asp", {"DB": DB, "Letter": letter})
        table = find_data_table(soup)
        if not table:
            time.sleep(DELAY)
            continue
        for cells in data_rows(table):
            if len(cells) < 5:
                continue
            link = next(
                (c.find("a", href=True) for c in cells if c.find("a", href=True) and "ATH=" in c.find("a")["href"].upper()),
                None,
            )
            if not link:
                continue
            m = re.search(r"ATH=(\d+)", link["href"], re.IGNORECASE)
            if not m:
                continue
            ath_id = int(m.group(1))
            if ath_id in athletes:
                continue
            athletes[ath_id] = {
                "id": ath_id,
                "last": cells[1].get_text(strip=True),
                "first": cells[2].get_text(strip=True),
                "age": cells[3].get_text(strip=True),
                "gender": cells[4].get_text(strip=True),
                "group": cells[5].get_text(strip=True),
                "subgroup": cells[6].get_text(strip=True) if len(cells) > 6 else "",
                "pbs": [],
            }
        time.sleep(DELAY)
        print(f"  Letter {letter}: {len(athletes)} athletes so far")
    return list(athletes.values())


def fetch_pbs(session, ath_id):
    url = f"{BASE_URL}/aATHRESULTSWithPSMR.ASP"
    pbs = []
    seen = set()
    for course_param in ("S", "L"):
        soup = get_soup(
            session, url, {"db": DB, "ATH": ath_id, "FASTEST": "1", "Course": course_param}
        )
        table = find_data_table(soup)
        if not table:
            continue
        for cells in data_rows(table):
            if len(cells) < 5:
                continue
            # Columns: [label], Dist, Stroke, P/F, Time, Place, Pts, Date, Meet
            dist_raw = cells[1].get_text(strip=True)
            stroke_raw = cells[2].get_text(strip=True)
            time_str = cells[4].get_text(strip=True)
            date_str = parse_date(cells[7].get_text(strip=True)) if len(cells) > 7 else ""
            meet_str = cells[8].get_text(strip=True) if len(cells) > 8 else ""

            if not time_str or not dist_raw or not stroke_raw:
                continue
            if re.search(r"[xX×]", dist_raw):
                continue  # skip relay legs

            distance, course = parse_dist_course(dist_raw, "SCM" if course_param == "S" else "LCM")
            stroke = STROKE_EXPAND.get(stroke_raw, stroke_raw)
            event = f"{distance} {stroke}"
            key = (event, course)
            if key in seen:
                continue
            seen.add(key)
            pbs.append({"event": event, "course": course, "time": time_str, "date": date_str, "meet": meet_str})
        time.sleep(DELAY)
    return pbs


def fetch_meets(session):
    soup = get_soup(session, f"{BASE_URL}/aMEETS.asp", {"DB": DB})
    table = find_data_table(soup)
    if not table:
        return []
    meets = []
    for cells in data_rows(table):
        if len(cells) < 4:
            continue
        link = next(
            (c.find("a", href=True) for c in cells if c.find("a", href=True) and "MEET=" in c.find("a")["href"].upper()),
            None,
        )
        meet_id = None
        if link:
            m = re.search(r"MEET=(\d+)", link["href"], re.IGNORECASE)
            if m:
                meet_id = int(m.group(1))
        raw_course = cells[2].get_text(strip=True)
        meets.append({
            "id": meet_id,
            "name": cells[1].get_text(strip=True),
            "course": COURSE_MAP.get(raw_course, raw_course),
            "date": parse_date(cells[3].get_text(strip=True)) if len(cells) > 3 else "",
        })
    return meets


def _parse_meet_results_page(table):
    rows = []
    for cells in data_rows(table):
        if len(cells) < 8:
            continue
        athlete_idx = next(
            (i for i, c in enumerate(cells) if "," in c.get_text()),
            None,
        )
        if athlete_idx is None:
            continue
        offset = athlete_idx
        if len(cells) < offset + 8:
            continue
        athlete_raw = cells[offset].get_text(strip=True)
        last, first = (p.strip() for p in athlete_raw.split(",", 1))
        dist_raw   = cells[offset + 4].get_text(strip=True)
        stroke_raw = cells[offset + 5].get_text(strip=True)
        time_str   = cells[offset + 7].get_text(strip=True)
        place_str  = cells[offset + 8].get_text(strip=True) if len(cells) > offset + 8 else ""

        if not time_str or not dist_raw or not stroke_raw:
            continue
        if re.search(r"[xX×]", dist_raw):
            continue

        ath_link = cells[offset].find("a", href=True)
        ath_id = None
        if ath_link:
            m = re.search(r"ATH=(\d+)", ath_link["href"], re.IGNORECASE)
            if m:
                ath_id = int(m.group(1))

        stroke = STROKE_EXPAND.get(stroke_raw, stroke_raw)
        rows.append({
            "ath_id": ath_id,
            "last":   last,
            "first":  first,
            "gender": cells[offset + 1].get_text(strip=True),
            "age":    cells[offset + 2].get_text(strip=True),
            "event":  f"{dist_raw} {stroke}",
            "time":   time_str,
            "place":  "" if place_str in ("—", "-") else place_str,
        })
    return rows


MEET_PAGE_SIZE = 1000  # Request large pages so most meets fit in a single request


def fetch_meet_results(session, meet_id):
    results = []
    seen = set()
    page = 1

    while True:
        params = {
            "db": DB, "MEET": meet_id,
            "thePage": page, "PageSize": MEET_PAGE_SIZE,
        }
        soup = get_soup(session, f"{BASE_URL}/aMeetRESULTS.ASP", params)
        table = find_data_table(soup)
        new_count = 0
        if table:
            for row in _parse_meet_results_page(table):
                key = (row["last"], row["first"], row["event"], row["time"])
                if key not in seen:
                    seen.add(key)
                    results.append(row)
                    new_count += 1

        if new_count < MEET_PAGE_SIZE:
            break
        page += 1
        time.sleep(DELAY)

    return results


def build_athlete_histories(athletes, meets, meet_results_dir):
    name_to_id = {(a["first"].lower(), a["last"].lower()): a["id"] for a in athletes}
    histories = {}

    for meet in meets:
        if meet["id"] is None:
            continue
        result_file = meet_results_dir / f"{meet['id']}.json"
        if not result_file.exists():
            continue
        try:
            results = json.loads(result_file.read_text(encoding="utf-8"))
        except Exception:
            continue
        for row in results:
            ath_id = row.get("ath_id") or name_to_id.get(
                (row["first"].lower(), row["last"].lower())
            )
            if not ath_id:
                continue
            histories.setdefault(ath_id, []).append({
                "meet_id": meet["id"],
                "meet":    meet["name"],
                "date":    meet["date"],
                "course":  meet["course"],
                "event":   row["event"],
                "time":    row["time"],
                "place":   row.get("place", ""),
            })

    from datetime import date as _date
    today = _date.today()
    if today.month >= 9:
        season_start = f"{today.year}-09-01"
        season_end   = f"{today.year + 1}-06-30"
    else:
        season_start = f"{today.year - 1}-09-01"
        season_end   = f"{today.year}-06-30"

    ath_results_dir = meet_results_dir.parent / "athlete_results"
    ath_results_dir.mkdir(exist_ok=True)
    badges_by_id = {}
    season_swims_by_id = {}
    for ath_id, races in histories.items():
        races.sort(key=lambda r: r.get("date") or "")
        (ath_results_dir / f"{ath_id}.json").write_text(
            json.dumps(races, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        meet_names = {r["meet"] for r in races}
        badges = []
        if any(re.search(r"WoS Regional", n, re.IGNORECASE) for n in meet_names):
            badges.append("regional")
        if any(re.search(r"\bWD\b", n) for n in meet_names):
            badges.append("district")
        if any(re.search(r"Scottish\s+(National|Summer|Schools)", n, re.IGNORECASE) for n in meet_names):
            badges.append("national")
        if badges:
            badges_by_id[ath_id] = badges
        swims = sum(1 for r in races if season_start <= (r.get("date") or "") <= season_end)
        if swims:
            season_swims_by_id[ath_id] = swims
    print(f"  Built history files for {len(histories)} athletes")
    return badges_by_id, season_swims_by_id


def main():
    DATA_DIR.mkdir(exist_ok=True)
    meet_results_dir = DATA_DIR / "meet_results"
    meet_results_dir.mkdir(exist_ok=True)

    print("Starting Sports-Tek scrape…")
    session = make_session()

    print("Fetching athlete list (A–Z)…")
    athletes = fetch_athletes(session)
    print(f"Found {len(athletes)} athletes. Fetching PBs…")
    for i, ath in enumerate(athletes, 1):
        print(f"  [{i}/{len(athletes)}] {ath['first']} {ath['last']}")
        ath["pbs"] = fetch_pbs(session, ath["id"])

    print("Fetching meets list…")
    meets = fetch_meets(session)
    print(f"Found {len(meets)} meets. Fetching meet results…")
    for i, meet in enumerate(meets, 1):
        if meet["id"] is None:
            continue
        print(f"  [{i}/{len(meets)}] {meet['name']}")
        results = fetch_meet_results(session, meet["id"])
        (meet_results_dir / f"{meet['id']}.json").write_text(
            json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        time.sleep(DELAY)

    (DATA_DIR / "meets.json").write_text(
        json.dumps(meets, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (DATA_DIR / "last_updated.json").write_text(
        json.dumps({"utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}),
        encoding="utf-8",
    )

    print("Building per-athlete race histories…")
    badges_by_id, season_swims_by_id = build_athlete_histories(athletes, meets, meet_results_dir)
    for ath in athletes:
        ath["badges"]       = badges_by_id.get(ath["id"], [])
        ath["season_swims"] = season_swims_by_id.get(ath["id"], 0)
    (DATA_DIR / "athletes.json").write_text(
        json.dumps(athletes, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print("Done. Data written to data/")


if __name__ == "__main__":
    if "--build-histories" in sys.argv:
        athletes = json.loads((DATA_DIR / "athletes.json").read_text(encoding="utf-8"))
        meets    = json.loads((DATA_DIR / "meets.json").read_text(encoding="utf-8"))
        print("Building athlete history files from existing data…")
        badges_by_id, season_swims_by_id = build_athlete_histories(athletes, meets, DATA_DIR / "meet_results")
        for ath in athletes:
            ath["badges"]       = badges_by_id.get(ath["id"], [])
            ath["season_swims"] = season_swims_by_id.get(ath["id"], 0)
        (DATA_DIR / "athletes.json").write_text(
            json.dumps(athletes, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print("Done.")
    else:
        main()
