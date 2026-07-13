#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
EVENTS_PATH = ROOT / "docs" / "data" / "events.json"
OVERRIDES_PATH = ROOT / "docs" / "data" / "score-overrides.json"
OUTPUT_PATH = ROOT / "docs" / "calendar.ics"


def esc(value: Any) -> str:
    text = str(value or "")
    return (
        text.replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace(";", "\\;")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def fold_ics_line(line: str, limit: int = 73) -> list[str]:
    data = line.encode("utf-8")
    if len(data) <= limit:
        return [line]

    result: list[str] = []
    current = bytearray()

    for ch in line:
        encoded = ch.encode("utf-8")
        if len(current) + len(encoded) > limit:
            result.append(current.decode("utf-8"))
            current = bytearray(b" ")
        current.extend(encoded)

    if current:
        result.append(current.decode("utf-8"))

    return result


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        # ScrapedDuckのタイムゾーン無し日時は日本時間として扱う
        from zoneinfo import ZoneInfo
        dt = dt.replace(tzinfo=ZoneInfo("Asia/Tokyo"))
    return dt.astimezone(timezone.utc)


def dtstamp(value: datetime) -> str:
    return value.strftime("%Y%m%dT%H%M%SZ")


def text_for(event: dict[str, Any]) -> str:
    return (
        f"{event.get('name', '')} {event.get('heading', '')} "
        f"{json.dumps(event.get('extraData', {}), ensure_ascii=False)}"
    ).lower()


def has_any(text: str, words: list[str]) -> bool:
    return any(word.lower() in text for word in words)


def rule_matches(rule: dict[str, Any], event: dict[str, Any], text: str) -> bool:
    title = str(event.get("name", "")).lower()
    title_all = all(str(x).lower() in title for x in rule.get("titleAll", []))
    title_any_list = rule.get("titleAny", [])
    title_any = not title_any_list or any(str(x).lower() in title for x in title_any_list)
    text_any_list = rule.get("textAny", [])
    text_any = not text_any_list or any(str(x).lower() in text for x in text_any_list)
    return title_all and title_any and text_any


COLLECTOR_EVENT_RULES = [
    {
        "titleAll": ["pikachu"],
        "titleAny": ["anniversary", "celebration", "アニバーサリー", "記念", "セレブレーション"],
        "minScore": 92,
        "reasons": [
            "複数の限定ピカチュウをまとめて回収できるコレクション特化イベント",
            "同じ衣装群が一括復刻する保証がない",
        ],
        "recommendation": "各衣装の通常色を1体ずつ確保。色違いは衣装ごとに別枠。",
    },
    {
        "textAny": [
            "multiple costumed", "different costumed", "costumed pikachu",
            "various costumed", "複数の衣装", "さまざまな衣装", "歴代衣装", "異なる衣装"
        ],
        "minScore": 88,
        "reasons": ["複数の衣装違いを同時に収集できる"],
        "recommendation": "衣装ごとに通常色1体。色違いは別枠。",
    },
]


def find_override(event: dict[str, Any], overrides: list[dict[str, Any]]) -> dict[str, Any] | None:
    name = str(event.get("name", "")).lower()
    event_id = str(event.get("eventID", "")).lower()

    for override in overrides:
        if override.get("eventID") and str(override["eventID"]).lower() == event_id:
            return override
        if override.get("nameIncludes") and str(override["nameIncludes"]).lower() in name:
            return override
        if any(str(x).lower() in name for x in override.get("nameIncludesAny", [])):
            return override
    return None


def evaluate(event: dict[str, Any], overrides: list[dict[str, Any]]) -> dict[str, Any]:
    text = text_for(event)
    score = 20
    reasons: list[str] = []
    flags: list[str] = []
    recommendation = "未所持なら1体。限定要素が異なる個体は別枠で保存。"

    if event.get("eventType") in {"special-research", "pokemon-go-fest"}:
        score += 28
        reasons.append("幻・限定リサーチや大型イベント")
        flags.append("一度限り")

    if has_any(text, [
        "regional", "region-exclusive", "地域限定", "tropius", "bouffalant",
        "klefki", "torkoal", "pachirisu", "sigilyph", "stonjourner"
    ]):
        score += 38
        reasons.append("日本では通常入手できない地域限定候補")
        flags.append("海外限定")
        recommendation = "通常色1体＋色違い1体。交換用は余裕があれば+1。"

    if has_any(text, ["costume", "costumed", "outfit", "hat", "visor", "flower crown", "衣装", "帽子", "バイザー"]):
        score += 23
        reasons.append("衣装・装飾フォームは別枠コレクション")
        flags.append("衣装")
        recommendation = "衣装ごとに通常色1体。色違いは別枠1体。"

    if has_any(text, ["background", "special background", "location card", "ロケーション背景", "スペシャル背景"]):
        score += 25
        reasons.append("限定背景は通常個体と別枠")
        flags.append("限定背景")
        recommendation = "背景ごとに1体。色違い背景は別枠で保存。"

    if has_any(text, ["shiny debut", "shiny release", "色違い初登場", "色違い初実装"]):
        score += 24
        reasons.append("色違い初実装")
        flags.append("色違い初実装")
    elif has_any(text, ["shiny", "色違い"]):
        score += 10
        reasons.append("色違い対象あり")
        flags.append("色違い")

    if has_any(text, ["unown", "アンノーン"]):
        score += 14
        reasons.append("文字別・色違い別の収集対象")
        flags.append("アンノーン")

    if has_any(text, ["origin forme", "adventure effect", "spacial rend", "roar of time", "専用技", "あくうせつだん", "ときのほうこう"]):
        score += 22
        reasons.append("専用技・フィールド効果は別枠")
        flags.append("専用技")
        recommendation = "専用技ごとに1体。背景・色違いは別枠。"

    if has_any(text, ["clone", "armored", "apex", "クローン", "アーマード"]):
        score += 45
        reasons.append("長期未復刻の特殊フォーム")
        flags.append("特殊フォーム")
        recommendation = "最低1体。通常フォームとは別枠で保存。"

    if event.get("eventType") == "pokemon-spotlight-hour":
        score -= 8
    elif event.get("eventType") == "raid-hour":
        score -= 3

    floor = 0
    for rule in COLLECTOR_EVENT_RULES:
        if rule_matches(rule, event, text):
            floor = max(floor, int(rule.get("minScore", 0)))
            reasons.extend(rule.get("reasons", []))
            flags.append("最優先")
            recommendation = rule.get("recommendation", recommendation)

    override = find_override(event, overrides)
    if override:
        floor = max(floor, int(override.get("minScore", 0)))
        reasons.extend(override.get("reasons", []))
        flags.extend(override.get("flags", ["手動補正"]))
        recommendation = override.get("recommendation", recommendation)

    score = max(floor, max(0, min(100, score)))
    tier = "SSS" if score >= 90 else "SS" if score >= 75 else "S" if score >= 60 else "A" if score >= 42 else "B" if score >= 25 else "C"

    return {
        "score": score,
        "tier": tier,
        "reasons": list(dict.fromkeys(reasons)),
        "flags": list(dict.fromkeys(flags)),
        "recommendation": recommendation,
    }


def main() -> None:
    events = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
    overrides = []
    if OVERRIDES_PATH.exists():
        overrides = json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))

    now = datetime.now(timezone.utc)
    rows = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//PoGO Collector Calendar v2.2//JA",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:PoGO Collector Calendar",
        "X-WR-TIMEZONE:Asia/Tokyo",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
    ]

    valid_events = 0
    for event in events:
        start = parse_dt(event.get("start"))
        end = parse_dt(event.get("end"))
        if not start or not end:
            continue

        value = evaluate(event, overrides)
        name = str(event.get("name", "名称未設定"))
        uid = str(event.get("eventID") or re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower())
        link = str(event.get("link", ""))

        description_parts = [
            f"コレクション評価: {value['score']}点 / {value['tier']}",
            f"評価理由: {'。'.join(value['reasons']) or '通常イベント'}",
            f"推奨保有: {value['recommendation']}",
        ]
        if value["flags"]:
            description_parts.append(f"分類: {' / '.join(value['flags'])}")
        if link:
            description_parts.append(f"詳細: {link}")

        event_rows = [
            "BEGIN:VEVENT",
            f"UID:{esc(uid)}@pogo-collector-calendar",
            f"DTSTAMP:{dtstamp(now)}",
            f"DTSTART:{dtstamp(start)}",
            f"DTEND:{dtstamp(end)}",
            f"SUMMARY:[{value['tier']}] {esc(name)}",
            f"DESCRIPTION:{esc(chr(10).join(description_parts))}",
            f"URL:{esc(link)}" if link else "",
            "STATUS:CONFIRMED",
            "TRANSP:TRANSPARENT",
            "END:VEVENT",
        ]

        for row in event_rows:
            if row:
                rows.extend(fold_ics_line(row))
        valid_events += 1

    rows.append("END:VCALENDAR")
    OUTPUT_PATH.write_text("\r\n".join(rows) + "\r\n", encoding="utf-8")
    print(f"Generated {OUTPUT_PATH} with {valid_events} events")


if __name__ == "__main__":
    main()
