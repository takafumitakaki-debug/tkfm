"""こども積立 勝率ナビのデータを最新化する。

FRED（米セントルイス連銀）の公開CSVから S&P500・日経平均・ドル円の日次終値を取得し
（FREDが応答しないときは Yahoo Finance から取得）、
  1. 年が明けて前年の値が確定したら data/history.json に前年分の年次データを追加
  2. 今年の年初来の動きを data.js に書き出す（index.html がこれを読む）
GitHub Actions から毎日実行する。標準ライブラリだけで動く。

  python scripts/update_data.py                 # FREDから取得
  python scripts/update_data.py --fixtures DIR  # DIR/<FRED系列>.csv か DIR/<Yahooシンボル>.json を使う（テスト用）
  python scripts/update_data.py --offline       # 取得せず history.json から data.js だけ作る
"""
import argparse
import csv
import io
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HISTORY = ROOT / "data" / "history.json"
DATA_JS = ROOT / "data.js"
SERIES = {"sp": "SP500", "nk": "NIKKEI225", "fx": "DEXJPUS"}
YAHOO = {"sp": "^GSPC", "nk": "^N225", "fx": "JPY=X"}
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={id}&cosd={start}"
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={p1}&period2={p2}&interval=1d"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"


def parse_csv(text):
    """FREDのCSV（日付,値）を [(date, float)] に。欠損（"."）は飛ばす。"""
    rows = []
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 2 or not row[0][:1].isdigit():
            continue
        try:
            rows.append((date.fromisoformat(row[0]), float(row[1])))
        except ValueError:
            continue
    rows.sort()
    return rows


def parse_yahoo(text):
    """Yahoo Financeのチャート JSON を [(date, float)] に。日付は取引所の現地日付。"""
    r = json.loads(text)["chart"]["result"][0]
    tz = timezone(timedelta(seconds=r["meta"].get("gmtoffset", 0)))
    closes = r["indicators"]["quote"][0]["close"]
    rows = {}
    for ts, v in zip(r.get("timestamp") or [], closes):
        if v is not None:
            rows[datetime.fromtimestamp(ts, tz).date()] = float(v)
    return sorted(rows.items())


def get(url, tries=3, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return res.read().decode("utf-8")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


def fetch(key, start, fixtures):
    """FREDを先に試し、だめならYahoo Financeから取る。"""
    errors = []
    sources = [
        ("FRED", lambda: parse_csv(get(FRED_URL.format(id=SERIES[key], start=start.isoformat())))),
        ("Yahoo", lambda: parse_yahoo(get(YAHOO_URL.format(
            sym=urllib.parse.quote(YAHOO[key]),
            p1=int(datetime(start.year, 1, 1, tzinfo=timezone.utc).timestamp()),
            p2=int(time.time()) + 86400)))),
    ]
    if fixtures:
        d = Path(fixtures)
        sources = [
            ("FRED", lambda: parse_csv((d / f"{SERIES[key]}.csv").read_text())),
            ("Yahoo", lambda: parse_yahoo((d / f"{YAHOO[key]}.json").read_text())),
        ]
    for name, load in sources:
        try:
            rows = load()
            if rows:
                print(f"{SERIES[key]}: {name}から{len(rows)}件（最新 {rows[-1][0]}）")
                return rows
            errors.append(f"{name}: データなし")
        except Exception as e:
            errors.append(f"{name}: {e}")
    raise RuntimeError(f"{SERIES[key]} を取得できません（{' / '.join(errors)}）")


def last_in_year(rows, year):
    vals = [(d, v) for d, v in rows if d.year == year]
    return vals[-1] if vals else None


def has_after_year(rows, year):
    return any(d.year > year for d, _ in rows)


def close_years(hist, data):
    """前年以前で、全系列に翌年の値が出ている（＝年末値が確定した）年を年次データに追加する。"""
    added = []
    years = hist["years"]
    # 手入力の最終年は S&P500 の年末値（価格）を持っていないので、取れれば補う。
    # 次の年の計算の基準になるので、ドル円・日経平均の年末値もFREDの値にそろえる
    if "sp_end" not in years[-1]:
        y0 = years[-1]["year"]
        ends = {k: last_in_year(data[k], y0) for k in data}
        if all(ends.values()) and all(has_after_year(data[k], y0) for k in data):
            years[-1]["sp_end"] = ends["sp"][1]
            years[-1]["fx_end"] = round(ends["fx"][1], 2)
            years[-1]["nk_end"] = round(ends["nk"][1], 2)
    while True:
        prev = years[-1]
        y = prev["year"] + 1
        if "sp_end" not in prev:
            break
        if not all(has_after_year(data[k], y) for k in data):
            break
        ends = {k: last_in_year(data[k], y) for k in data}
        if not all(ends.values()):
            break
        sp_price = ends["sp"][1] / prev["sp_end"] - 1
        years.append({
            "year": y,
            "sp_tr": round((sp_price + hist["sp_dividend_yield_pct"] / 100) * 100, 2),
            "sp_end": ends["sp"][1],
            "fx_end": round(ends["fx"][1], 2),
            "nk_end": round(ends["nk"][1], 2),
            "dep": hist["default_dep_pct"],
            "source": "fred-auto",
        })
        added.append(y)
    return added


def latest_snapshot(hist, data):
    """最後の確定年の年末から、いちばん新しい値までの動き（年初来）。"""
    last = hist["years"][-1]
    year = last["year"] + 1
    cur = {k: data[k][-1] for k in data}
    if "sp_end" not in last or any(d.year < year for d, _ in cur.values()):
        return None
    sp = cur["sp"][1] / last["sp_end"] - 1
    nk = cur["nk"][1] / last["nk_end"] - 1
    fx = cur["fx"][1] / last["fx_end"] - 1
    return {
        "year": year,
        "as_of": max(d for d, _ in cur.values()).isoformat(),
        "dates": {k: d.isoformat() for k, (d, _) in cur.items()},
        "sp": round(cur["sp"][1], 2),
        "nk": round(cur["nk"][1], 2),
        "fx": round(cur["fx"][1], 2),
        "sp_ytd": round(sp * 100, 2),
        "nk_ytd": round(nk * 100, 2),
        "fx_ytd": round(fx * 100, 2),
        "us_yen_ytd": round(((1 + sp) * (1 + fx) - 1) * 100, 2),
    }


def build_js(hist, latest):
    ys = hist["years"]
    payload = {
        "data_through": ys[-1]["year"],
        "years": [y["year"] for y in ys],
        "sp": [y["sp_tr"] for y in ys],
        "fx": [hist["base"]["fx_end_1969"]] + [y["fx_end"] for y in ys],
        "nk": [hist["base"]["nk_end_1969"]] + [y["nk_end"] for y in ys],
        "dep": [y["dep"] for y in ys],
        "auto_years": [y["year"] for y in ys if y.get("source") == "fred-auto"],
        "nk_dividend_yield_pct": hist["nk_dividend_yield_pct"],
        "latest": latest,
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return "// scripts/update_data.py が自動生成。手で編集しない。\nwindow.KODOMO_DATA = " + body + ";\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures")
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()

    hist = json.loads(HISTORY.read_text())
    if args.offline:
        DATA_JS.write_text(build_js(hist, None))
        return 0
    start = date(hist["years"][-1]["year"], 1, 1)
    try:
        data = {k: fetch(k, start, args.fixtures) for k in SERIES}
    except Exception as e:  # 取得失敗時は既存データを残したまま失敗終了
        print(f"データ取得に失敗: {e}", file=sys.stderr)
        return 1
    empty = [SERIES[k] for k, rows in data.items() if not rows]
    if empty:
        print(f"データが空: {', '.join(empty)}", file=sys.stderr)
        return 1

    added = close_years(hist, data)
    latest = latest_snapshot(hist, data)
    HISTORY.write_text(json.dumps(hist, ensure_ascii=False, indent=1) + "\n")
    DATA_JS.write_text(build_js(hist, latest))
    print(f"確定データ: 〜{hist['years'][-1]['year']}年（今回追加: {added or 'なし'}）")
    print(f"最新: {latest['as_of'] if latest else 'なし'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
