import json
import re
import string
import time
from datetime import datetime, timezone
from pathlib import Path

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
                "last": cells[0].get_text(strip=True),
                "first": cells[1].get_text(strip=True),
                "age": cells[2].get_text(strip=True),
                "gender": cells[3].get_text(strip=True),
                "group": cells[4].get_text(strip=True),
                "subgroup": cells[5].get_text(strip=True) if len(cells) > 5 else "",
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
            if len(cells) < 4:
                continue
            # Columns: Dist, Stroke, P/F, Time, Place, Pts, Date, Meet
            dist_raw = cells[0].get_text(strip=True)
            stroke_raw = cells[1].get_text(strip=True)
            time_str = cells[3].get_text(strip=True)
            date_str = parse_date(cells[6].get_text(strip=True)) if len(cells) > 6 else ""
            meet_str = cells[7].get_text(strip=True) if len(cells) > 7 else ""

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
        if len(cells) < 3:
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
        raw_course = cells[1].get_text(strip=True)
        meets.append({
            "id": meet_id,
            "name": cells[0].get_text(strip=True),
            "course": COURSE_MAP.get(raw_course, raw_course),
            "date": parse_date(cells[2].get_text(strip=True)),
        })
    return meets


def main():
    DATA_DIR.mkdir(exist_ok=True)
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
    print(f"Found {len(meets)} meets.")

    (DATA_DIR / "athletes.json").write_text(
        json.dumps(athletes, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (DATA_DIR / "meets.json").write_text(
        json.dumps(meets, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (DATA_DIR / "last_updated.json").write_text(
        json.dumps({"utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}),
        encoding="utf-8",
    )
    print("Done. Data written to data/")


if __name__ == "__main__":
    main()
