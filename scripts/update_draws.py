#!/usr/bin/env python3
"""Fetch new Thai Government Lottery results and append them to data/draws.json.

Checks every calendar day after the latest stored draw up to today (Bangkok time),
so shifted draw dates (2 May, 17 Jan, 30 Dec, holidays) are picked up automatically.
A draw is saved only when every prize category has the exact expected count.
Uses only the Python standard library.
"""
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "draws.json")
BKK = dt.timezone(dt.timedelta(hours=7))
UA = "Mozilla/5.0 (compatible; lotto-checker-updater/1.0; +https://pages.github.com)"

TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
             "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
EXPECT = {"p1": (1, 6), "p2": (5, 6), "p3": (10, 6), "p4": (50, 6), "p5": (100, 6),
          "f3": (2, 3), "l3": (2, 3), "l2": (1, 2)}
KEYS = list(EXPECT)


def log(*a):
    print(*a, flush=True)


# ---------- storage ----------
def load():
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)


def save(draws):
    draws = sorted(draws, key=lambda d: d["date"])
    with open(DATA, "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(d, ensure_ascii=False, separators=(",", ":")) for d in draws) + "\n]\n")


# ---------- validation ----------
def valid(d):
    for k, (n, ln) in EXPECT.items():
        v = d.get(k) or []
        if len(v) != n or len(set(v)) != n or any(len(x) != ln or not x.isdigit() for x in v):
            return False, f"{k}: {len(v)} numbers"
    return True, ""


# ---------- fetching ----------
def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "th,en;q=0.8"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.geturl(), r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 404, url, ""
            log(f"  HTTP {e.code} on {url} (try {i + 1})")
        except Exception as e:  # network hiccup
            log(f"  {type(e).__name__}: {e} (try {i + 1})")
        time.sleep(3 * (i + 1))
    return 0, url, ""


# ---------- parsing ----------
def parse_by_class(page):
    """Strategy 1: sanook marks every winning number with class 'lotto__number', in a fixed order."""
    nums = [html.unescape(re.sub(r"<[^>]+>", "", m)).strip()
            for m in re.findall(r'class="[^"]*\blotto__number\b[^"]*"[^>]*>(.*?)<', page, re.S)]
    nums = [n for n in nums if n.isdigit()]
    if len(nums) < 173:
        return None
    return {"p1": nums[0:1], "f3": nums[1:3], "l3": nums[3:5], "l2": nums[5:6],
            "p2": nums[8:13], "p3": nums[13:23], "p4": nums[23:73], "p5": nums[73:173]}


def page_text(page):
    page = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", page)
    text = html.unescape(re.sub(r"<[^>]+>", " ", page))
    return text.translate(str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789"))


def parse_by_text(text):
    """Strategy 2: split the page text at the Thai prize headings and collect numbers of the right length."""
    heads = []
    pats = [(r"ข้างเคียง(?:รางวัลที่\s*1)?", lambda m: "near1"),
            (r"รางวัลที่\s*([1-5])(?!\d)", lambda m: "p" + m.group(1)),
            (r"เลขหน้า\s*3\s*ตัว", lambda m: "f3"),
            (r"เลขท้าย\s*3\s*ตัว", lambda m: "l3"),
            (r"เลขท้าย\s*2\s*ตัว", lambda m: "l2")]
    for p, f in pats:
        for m in re.finditer(p, text):
            heads.append((m.start(), m.end(), f(m)))
    heads = [h for h in heads if not any(o is not h and o[0] <= h[0] and o[1] >= h[1] and (o[1] - o[0]) > (h[1] - h[0]) for o in heads)]
    heads.sort()
    out = {k: [] for k in KEYS}
    lens = {k: v[1] for k, v in EXPECT.items()}
    for m in re.finditer(r"\d[\d,]*", text):
        tok, at = m.group(), m.start()
        if "," in tok or re.match(r"\s*บาท", text[m.end():m.end() + 6]):
            continue
        if any(s <= at < e for s, e, _ in heads):
            continue
        cur = None
        for s, e, k in heads:
            if s <= at:
                cur = k
            else:
                break
        if cur in (None, "near1"):
            continue
        vals = [tok] if len(tok) == lens[cur] else ([tok[:3], tok[3:]] if cur in ("f3", "l3") and len(tok) == 6 else [])
        for v in vals:
            if v not in out[cur] and len(out[cur]) < EXPECT[cur][0]:
                out[cur].append(v)
    return out


def try_sanook(day, last_p1):
    be = f"{day.day:02d}{day.month:02d}{day.year + 543}"
    url = f"https://news.sanook.com/lotto/check/{be}/"
    status, final, page = fetch(url)
    if status != 200 or not page:
        return None, f"status {status}"
    if be not in final:
        return None, "redirected elsewhere"
    text = page_text(page)
    if f"{day.day} {TH_MONTHS[day.month - 1]} {day.year + 543}" not in re.sub(r"\s+", " ", text):
        return None, "page is not for this date"
    for name, parsed in (("class", parse_by_class(page)), ("text", parse_by_text(text))):
        if not parsed:
            continue
        ok, why = valid(parsed)
        if ok and parsed["p1"][0] != last_p1:
            return {"date": day.isoformat(), **{k: parsed[k] for k in KEYS}}, f"parsed by {name}"
        log(f"  {name} parser rejected: {why or 'same first prize as previous draw'}")
    return None, "no complete result yet"


# ---------- main ----------
def main():
    draws = load()
    have = {d["date"] for d in draws}
    last = max(draws, key=lambda d: d["date"])
    today = dt.datetime.now(BKK).date()
    only = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None
    days = [dt.date.fromisoformat(only)] if only else \
        [dt.date.fromisoformat(last["date"]) + dt.timedelta(days=i) for i in range(1, (today - dt.date.fromisoformat(last["date"])).days + 1)]
    added = []
    for day in days:
        if day.isoformat() in have:
            continue
        d, why = try_sanook(day, last["p1"][0])
        log(f"{day}: {why}")
        if d:
            draws.append(d); have.add(d["date"]); added.append(d); last = d
        time.sleep(1)
    if added:
        save(draws)
        for d in added:
            log(f"ADDED {d['date']}  first prize {d['p1'][0]}  last two {d['l2'][0]}")
    else:
        log("No new draw.")
    # Flag a stale dataset: a draw is due at least every ~17 days
    gap = (today - dt.date.fromisoformat(last["date"])).days
    if gap > 20:
        log(f"::warning::Latest stored draw is {gap} days old ({last['date']}). The source page layout may have changed.")
    gh = os.environ.get("GITHUB_OUTPUT")
    if gh:
        with open(gh, "a") as f:
            f.write(f"added={len(added)}\n")


if __name__ == "__main__":
    main()
