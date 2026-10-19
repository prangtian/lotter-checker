#!/usr/bin/env python3
"""Build index.html from src/template.html, src/engine.js and data/draws.json."""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = ["p1", "p2", "p3", "p4", "p5", "f3", "l3", "l2"]


def main():
    with open(os.path.join(ROOT, "data", "draws.json"), encoding="utf-8") as f:
        draws = sorted(json.load(f), key=lambda d: d["date"], reverse=True)
    rows = [[d["date"][2:].replace("-", "")] + ["".join(d.get(k, [])) for k in K] for d in draws]
    tpl = open(os.path.join(ROOT, "src", "template.html"), encoding="utf-8").read()
    eng = open(os.path.join(ROOT, "src", "engine.js"), encoding="utf-8").read()
    for marker in ("/*__ENGINE__*/", "/*__DATA__*/"):
        if tpl.count(marker) != 1:
            raise SystemExit(f"template must contain {marker} exactly once")
    page = tpl.replace("/*__ENGINE__*/", eng).replace("/*__DATA__*/", json.dumps(rows, separators=(",", ":")))
    # GitHub Pages serves a full document, so wrap the fragment
    if not page.lstrip().lower().startswith("<!doctype"):
        # move <title>, <meta> and <link> tags at the top of the fragment into <head>
        head_tags = re.findall(r"^\s*<(?:title>.*?</title|meta [^>]*|link [^>]*)>\s*$", page.split("<style>", 1)[0], re.M)
        for t in head_tags:
            page = page.replace(t, "", 1)
        reset = ("<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
                 "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>")
        page = ('<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
                + "\n".join(t.strip() for t in head_tags) + "\n" + reset + "\n</head>\n<body>\n" + page.strip() + "\n</body>\n</html>\n")
    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)
    print(f"index.html built: {len(draws)} draws, {draws[-1]['date']} to {draws[0]['date']}, {len(page) // 1024} KB")


if __name__ == "__main__":
    main()
