"""Descarga crucigramas diarios del PAIS desde el API de SmartGames."""

import argparse
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url-template",
        default=(
            "https://backend.smartgames.media/api/game/"
            "crossword/category/experto/{date}"
        ),
        help="URL del endpoint con {date} (se usa el endpoint oficial por defecto)",
    )
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, default=date.today())
    parser.add_argument("--output", type=Path, default=Path("crucigramas"))
    parser.add_argument(
        "--cookie",
        help="Valor de la cabecera Cookie de tu sesion autenticada",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Segundos entre peticiones (por defecto: 1)",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=3,
        help="Intentos adicionales para HTTP 429/5xx (por defecto: 3)",
    )
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def validate_puzzle(payload):
    try:
        attributes = payload["data"]["attributes"]
        config = attributes["config"]
        board = config["board"]
        entries = config["entries"]
    except (KeyError, TypeError):
        return False

    rows = board.splitlines()
    return (
        attributes.get("gameType") == "crossword"
        and len(rows) > 0
        and all(len(row) == len(rows[0]) for row in rows)
        and isinstance(entries.get("across"), dict)
        and isinstance(entries.get("down"), dict)
    )


def fetch_json(url, cookie, retries):
    headers = {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Origin": "https://elpais.com",
        "Referer": "https://elpais.com/",
        "User-Agent": "Mozilla/5.0",
    }
    date_text = url.rsplit("/", 1)[-1]
    headers["x-pathname"] = f"/juegos/crucigramas/experto/{date_text}/"
    if cookie:
        headers["Cookie"] = cookie

    for attempt in range(retries + 1):
        request = Request(url, headers=headers)
        try:
            with urlopen(request, timeout=30) as response:
                content_type = response.headers.get_content_type()
                body = response.read()
            break
        except HTTPError as error:
            retryable = error.code == 429 or 500 <= error.code <= 599
            if not retryable or attempt == retries:
                raise
            time.sleep(2**attempt)

    if content_type != "application/json" and not content_type.endswith("+json"):
        raise ValueError(
            f"la respuesta es {content_type}, no JSON (posible HTML del muro)"
        )
    return json.loads(body)


def iter_dates(start, end):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def write_manifest(output):
    dates = sorted(path.stem for path in output.glob("????-??-??.json"))
    (output / "manifest.json").write_text(
        json.dumps(dates, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main():
    args = parse_args()
    if args.end < args.start:
        raise SystemExit("--end no puede ser anterior a --start")

    args.output.mkdir(parents=True, exist_ok=True)
    downloaded = 0
    skipped = 0

    for current in iter_dates(args.start, args.end):
        date_text = current.isoformat()
        destination = args.output / f"{date_text}.json"
        if destination.exists() and not args.overwrite:
            print(f"SKIP {date_text}: ya existe")
            skipped += 1
            continue

        url = args.url_template.format(date=date_text)
        try:
            payload = fetch_json(url, args.cookie, max(0, args.retries))
            if not validate_puzzle(payload):
                print(
                    f"SKIP {date_text}: JSON sin esquema de crucigrama", file=sys.stderr
                )
                skipped += 1
                continue
            destination.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(f"OK   {date_text} -> {destination}")
            downloaded += 1
        except HTTPError as error:
            print(f"SKIP {date_text}: HTTP {error.code}", file=sys.stderr)
            skipped += 1
        except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
            print(f"SKIP {date_text}: {error}", file=sys.stderr)
            skipped += 1

        if current < args.end:
            time.sleep(max(0, args.delay))

    write_manifest(args.output)
    print(f"Terminada: {downloaded} descargados, {skipped} omitidos")


if __name__ == "__main__":
    main()
