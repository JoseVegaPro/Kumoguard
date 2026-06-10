#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import struct
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable


JST = timezone(timedelta(hours=9))


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def cumulative_distances_m(points_latlon: list[tuple[float, float]]) -> list[float]:
    if not points_latlon:
        return []
    out = [0.0]
    total = 0.0
    for (lat1, lon1), (lat2, lon2) in zip(points_latlon, points_latlon[1:]):
        total += haversine_m(lat1, lon1, lat2, lon2)
        out.append(total)
    return out


def closest_point_index(points_latlon: list[tuple[float, float]], lat: float, lon: float) -> tuple[int, float]:
    best_i = 0
    best_d = float("inf")
    for i, (plat, plon) in enumerate(points_latlon):
        d = haversine_m(lat, lon, plat, plon)
        if d < best_d:
            best_d = d
            best_i = i
    return best_i, best_d


def parse_kml_linestring_latlon(path: Path) -> list[tuple[float, float]]:
    # KML uses lon,lat[,alt] in <coordinates>
    raw = path.read_text(encoding="utf-8", errors="replace")
    root = ET.fromstring(raw)

    def strip_ns(tag: str) -> str:
        return tag.split("}", 1)[-1]

    coords_text = None
    for el in root.iter():
        if strip_ns(el.tag) == "coordinates" and el.text:
            coords_text = el.text
            break
    if not coords_text:
        raise SystemExit(f"No <coordinates> found in {path}")

    points: list[tuple[float, float]] = []
    for token in coords_text.strip().split():
        parts = token.split(",")
        if len(parts) < 2:
            continue
        lon = float(parts[0])
        lat = float(parts[1])
        points.append((lat, lon))
    return points


def parse_kml_timerange_from_placemark_name(path: Path) -> tuple[datetime, datetime] | None:
    raw = path.read_text(encoding="utf-8", errors="replace")
    root = ET.fromstring(raw)

    def strip_ns(tag: str) -> str:
        return tag.split("}", 1)[-1]

    placemark_name = None
    in_placemark = False
    for el in root.iter():
        tag = strip_ns(el.tag)
        if tag == "Placemark":
            in_placemark = True
            placemark_name = None
        elif in_placemark and tag == "name" and el.text:
            placemark_name = el.text.strip()
            break

    if not placemark_name:
        return None

    m = re.match(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*-\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$", placemark_name)
    if not m:
        return None

    start = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M")
    end = datetime.strptime(m.group(2), "%Y-%m-%d %H:%M")
    if end <= start:
        return None
    return start, end


@dataclass(frozen=True)
class Photo:
    filename: str
    time: datetime
    lat: float
    lon: float


@dataclass(frozen=True)
class Fix:
    time: datetime
    lat: float
    lon: float


def parse_positions_csv(path: Path, tz: timezone) -> list[Fix]:
    import csv

    fixes: list[Fix] = []
    with path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return fixes

        # Prefer fixTime, then deviceTime, then serverTime.
        time_field = None
        for cand in ("fixTime", "deviceTime", "serverTime"):
            if cand in reader.fieldnames:
                time_field = cand
                break
        if not time_field:
            return fixes

        for row in reader:
            if row.get("valid", "true").strip().lower() not in ("true", "1", "yes", "y"):
                continue
            try:
                t = datetime.strptime(row[time_field].strip(), "%Y-%m-%d %H:%M:%S").replace(tzinfo=tz)
                lat = float(row["latitude"])
                lon = float(row["longitude"])
            except Exception:
                continue
            fixes.append(Fix(time=t, lat=lat, lon=lon))

    fixes.sort(key=lambda x: x.time)
    return fixes


def _read_ifd(tiff: bytes, bo: str, offset: int) -> list[tuple[int, int, int, int]]:
    n = struct.unpack(bo + "H", tiff[offset : offset + 2])[0]
    entries = []
    base = offset + 2
    for i in range(n):
        ent = tiff[base + 12 * i : base + 12 * (i + 1)]
        tag, typ, cnt, val = struct.unpack(bo + "HHII", ent)
        entries.append((tag, typ, cnt, val))
    return entries


def _get_raw(tiff: bytes, bo: str, typ: int, cnt: int, val: int) -> bytes:
    type_sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8}
    size = type_sizes.get(typ)
    if not size:
        return b""
    total = size * cnt
    if total <= 4:
        return struct.pack(bo + "I", val)[:total]
    return tiff[val : val + total]


def _parse_ascii(raw: bytes) -> str:
    return raw.split(b"\x00", 1)[0].decode("ascii", "replace")


def _parse_rational(tiff: bytes, bo: str, typ: int, cnt: int, val: int) -> list[float | None]:
    raw = _get_raw(tiff, bo, typ, cnt, val)
    out: list[float | None] = []
    for i in range(0, len(raw), 8):
        a, b = struct.unpack(bo + "II", raw[i : i + 8])
        out.append(a / b if b else None)
    return out


def _dms_to_dd(dms: list[float | None], ref: str) -> float:
    deg, minutes, seconds = (dms + [0.0, 0.0, 0.0])[:3]
    if deg is None or minutes is None or seconds is None:
        return float("nan")
    dd = deg + minutes / 60.0 + seconds / 3600.0
    if ref in ("S", "W"):
        dd = -dd
    return dd


def parse_photo_exif(path: Path, tz: timezone) -> Photo | None:
    data = path.read_bytes()
    idx = data.find(b"Exif\x00\x00")
    if idx == -1:
        return None

    tiff = data[idx + 6 :]
    endian = tiff[:2]
    if endian == b"II":
        bo = "<"
    elif endian == b"MM":
        bo = ">"
    else:
        return None

    if struct.unpack(bo + "H", tiff[2:4])[0] != 42:
        return None
    ifd0_off = struct.unpack(bo + "I", tiff[4:8])[0]

    tags0 = {tag: (typ, cnt, val) for tag, typ, cnt, val in _read_ifd(tiff, bo, ifd0_off)}
    exif_ptr = tags0.get(0x8769, (0, 0, 0))[2]
    gps_ptr = tags0.get(0x8825, (0, 0, 0))[2]
    if not exif_ptr or not gps_ptr:
        return None

    exif_tags = {tag: (typ, cnt, val) for tag, typ, cnt, val in _read_ifd(tiff, bo, exif_ptr)}
    if 0x9003 not in exif_tags:
        return None
    dto = _parse_ascii(_get_raw(tiff, bo, *exif_tags[0x9003]))
    try:
        t = datetime.strptime(dto, "%Y:%m:%d %H:%M:%S").replace(tzinfo=tz)
    except ValueError:
        return None

    gps_tags = {tag: (typ, cnt, val) for tag, typ, cnt, val in _read_ifd(tiff, bo, gps_ptr)}
    if not all(tag in gps_tags for tag in (1, 2, 3, 4)):
        return None
    lat_ref = _parse_ascii(_get_raw(tiff, bo, *gps_tags[1]))
    lon_ref = _parse_ascii(_get_raw(tiff, bo, *gps_tags[3]))
    lat_dms = _parse_rational(tiff, bo, *gps_tags[2])
    lon_dms = _parse_rational(tiff, bo, *gps_tags[4])

    lat = _dms_to_dd(lat_dms, lat_ref)
    lon = _dms_to_dd(lon_dms, lon_ref)
    if math.isnan(lat) or math.isnan(lon):
        return None

    return Photo(filename=path.name, time=t, lat=lat, lon=lon)


def pick_anchor(photos: list[Photo], target: datetime, *, max_after_s: float) -> Photo | None:
    best: tuple[float, Photo] | None = None
    for p in photos:
        delta = (p.time - target).total_seconds()
        if delta < 0:
            continue
        if delta > max_after_s:
            continue
        if best is None or delta < best[0]:
            best = (delta, p)
    return best[1] if best else None


def pick_anchor_near_end(photos: list[Photo], target: datetime, *, max_after_s: float, max_before_s: float) -> Photo | None:
    best: tuple[float, Photo] | None = None
    for p in photos:
        delta = (p.time - target).total_seconds()
        if delta >= 0:
            if delta > max_after_s:
                continue
            score = delta
        else:
            if -delta > max_before_s:
                continue
            score = -delta + 1e-3  # slightly prefer after end if tied
        if best is None or score < best[0]:
            best = (score, p)
    return best[1] if best else None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build drive.json from a KML track + photo EXIF GPS.")
    ap.add_argument("--kml", required=True, type=Path)
    ap.add_argument("--photos-dir", required=True, type=Path)
    ap.add_argument("--positions-csv", type=Path, default=None, help="Optional CSV export with fixTime+lat/lon (preferred over KML LineString).")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--drive-start", required=True, help="YYYY-MM-DD HH:MM (local to tz)")
    ap.add_argument("--drive-end", required=True, help="YYYY-MM-DD HH:MM (local to tz)")
    ap.add_argument("--tz", default="Asia/Tokyo", help="Only 'Asia/Tokyo' supported for now (for drive + photos)")
    ap.add_argument("--kml-tz", default="UTC", choices=["UTC", "Asia/Tokyo"], help="Timezone of the KML <Placemark><name> time range, if present")
    args = ap.parse_args(argv)

    if args.tz != "Asia/Tokyo":
        raise SystemExit("Only --tz Asia/Tokyo is supported (fixed +09:00).")

    drive_start = datetime.strptime(args.drive_start, "%Y-%m-%d %H:%M").replace(tzinfo=JST)
    drive_end = datetime.strptime(args.drive_end, "%Y-%m-%d %H:%M").replace(tzinfo=JST)
    if drive_end <= drive_start:
        raise SystemExit("--drive-end must be after --drive-start")

    # Load the best available track source.
    positions_csv = args.positions_csv
    if positions_csv is None:
        candidate = args.photos_dir / "positions.csv"
        if candidate.exists():
            positions_csv = candidate

    track_source = "kmlLineString"
    fixes: list[Fix] = []
    if positions_csv and positions_csv.exists():
        fixes = parse_positions_csv(positions_csv, JST)
        if len(fixes) >= 2:
            track_source = "positionsCsv"

    kml_track_all = parse_kml_linestring_latlon(args.kml)
    positions_csv_fixes_all = list(fixes)

    if track_source == "positionsCsv":
        fixes_in_window = [f for f in fixes if drive_start <= f.time <= drive_end]
        # If the export doesn't fully cover the window, still use whatever it has.
        if len(fixes_in_window) >= 2:
            fixes = fixes_in_window
        track_all = [(f.lat, f.lon) for f in fixes]
    else:
        track_all = kml_track_all
        fixes = []

    track = track_all
    if len(track) < 2:
        raise SystemExit("Track has too few points.")

    cum_all = cumulative_distances_m(track_all)

    photo_paths = sorted([p for p in args.photos_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg")])
    photos_all: list[Photo] = []
    for p in photo_paths:
        parsed = parse_photo_exif(p, JST)
        if parsed:
            photos_all.append(parsed)
    photos_all.sort(key=lambda p: p.time)

    photos_in_window = [p for p in photos_all if drive_start <= p.time <= drive_end]

    # Best trimming (when available): anchor the segment around the photos in the drive window.
    # This avoids relying on any assumptions about sampling rate within the KML LineString.
    trim: dict[str, object] = {"enabled": False, "method": "none", "startIndex": 0, "endIndex": len(track) - 1}
    if track_source == "positionsCsv":
        trim = {
            "enabled": True,
            "method": "positionsCsvTimeWindow",
            "startIndex": 0,
            "endIndex": len(track) - 1,
            "positionsCsv": positions_csv.name if positions_csv else None,
            "fixesInWindow": len(track),
        }
    if len(photos_in_window) >= 2:
        snapped = []
        for p in photos_in_window:
            i, d = closest_point_index(track_all, p.lat, p.lon)
            snapped.append((i, d, p))
        snapped.sort(key=lambda x: x[0])
        min_i = snapped[0][0]
        max_i = snapped[-1][0]

        pad_m = 50_000.0  # 50km padding on each side (tunable)

        def pad_before(i: int) -> int:
            target = max(0.0, cum_all[i] - pad_m)
            j = i
            while j > 0 and cum_all[j] > target:
                j -= 1
            return j

        def pad_after(i: int) -> int:
            target = min(cum_all[-1], cum_all[i] + pad_m)
            j = i
            while j < len(cum_all) - 1 and cum_all[j] < target:
                j += 1
            return j

        start_i = pad_before(min_i)
        end_i = pad_after(max_i)
        if start_i < end_i and track_source != "positionsCsv":
            trim = {
                "enabled": True,
                "method": "photoWindowDistancePad",
                "padM": pad_m,
                "photoIndexRange": {"min": min_i, "max": max_i},
                "photoSnapMaxDistanceM": max(d for _i, d, _p in snapped),
                "startIndex": start_i,
                "endIndex": end_i,
                "startAnchor": {"file": snapped[0][2].filename, "time": snapped[0][2].time.isoformat(), "distanceM": snapped[0][1]},
                "endAnchor": {"file": snapped[-1][2].filename, "time": snapped[-1][2].time.isoformat(), "distanceM": snapped[-1][1]},
            }
            track = track_all[start_i : end_i + 1]

    # Preferred trimming: use KML-provided time range (from Placemark name) if present.
    kml_range = parse_kml_timerange_from_placemark_name(args.kml)
    if (not trim.get("enabled")) and kml_range:
        kml_tz = timezone.utc if args.kml_tz == "UTC" else JST
        kml_start = kml_range[0].replace(tzinfo=kml_tz)
        kml_end = kml_range[1].replace(tzinfo=kml_tz)
        drive_start_in_kml_tz = drive_start.astimezone(kml_tz)
        drive_end_in_kml_tz = drive_end.astimezone(kml_tz)

        span_s = (kml_end - kml_start).total_seconds()
        if span_s > 0:
            s_frac = (drive_start_in_kml_tz - kml_start).total_seconds() / span_s
            e_frac = (drive_end_in_kml_tz - kml_start).total_seconds() / span_s
            s_i = int(round(max(0.0, min(1.0, s_frac)) * (len(track) - 1)))
            e_i = int(round(max(0.0, min(1.0, e_frac)) * (len(track) - 1)))
            if s_i < e_i:
                trim = {
                    "enabled": True,
                    "method": "kmlTimeRangeLinear",
                    "kmlTZ": args.kml_tz,
                    "kmlStart": kml_start.isoformat(),
                    "kmlEnd": kml_end.isoformat(),
                    "startIndex": s_i,
                    "endIndex": e_i,
                }
                track = track_all[s_i : e_i + 1]

    # Fallback trimming: use photo anchors if we couldn't time-trim.
    if not trim.get("enabled"):
        start_anchor = pick_anchor(photos_all, drive_start, max_after_s=6 * 3600)
        end_anchor = pick_anchor_near_end(photos_all, drive_end, max_after_s=2 * 3600, max_before_s=6 * 3600)
        if start_anchor and end_anchor:
            s_i, s_d = closest_point_index(track_all, start_anchor.lat, start_anchor.lon)
            e_i, e_d = closest_point_index(track_all, end_anchor.lat, end_anchor.lon)
            if s_i < e_i and s_d < 2000 and e_d < 2000:  # 2km sanity
                trim = {
                    "enabled": True,
                    "method": "photoAnchorsNearestPoint",
                    "startIndex": s_i,
                    "endIndex": e_i,
                    "startAnchor": {"file": start_anchor.filename, "time": start_anchor.time.isoformat(), "distanceM": s_d},
                    "endAnchor": {"file": end_anchor.filename, "time": end_anchor.time.isoformat(), "distanceM": e_d},
                }
                track = track_all[s_i : e_i + 1]

    cum = cumulative_distances_m(track)
    total_m = cum[-1] if cum else 0.0

    def progress_at_index(i: int) -> float:
        if total_m <= 0:
            return 0.0
        return max(0.0, min(1.0, cum[i] / total_m))

    photos_out = []
    for p in photos_in_window:
        i, d = closest_point_index(track, p.lat, p.lon)
        time_progress = (p.time - drive_start).total_seconds() / (drive_end - drive_start).total_seconds()
        photos_out.append(
            {
                "file": p.filename,
                "time": p.time.isoformat(),
                "lat": p.lat,
                "lon": p.lon,
                "timeProgress": max(0.0, min(1.0, time_progress)),
                "snap": {"index": i, "distanceM": d, "progress": progress_at_index(i)},
            }
        )

    out = {
        "driveStart": drive_start.isoformat(),
        "driveEnd": drive_end.isoformat(),
        "tz": "+09:00",
        "kml": args.kml.name,
        "trackSource": track_source,
        "trim": trim,
        "track": [
            (
                {"lat": fixes[i].lat, "lon": fixes[i].lon, "t": fixes[i].time.isoformat()}
                if track_source == "positionsCsv"
                else {"lat": lat, "lon": lon}
            )
            for i, (lat, lon) in enumerate(track)
        ],
        "photos": photos_out,
        "stats": {
            "trackPoints": len(track),
            "trackDistanceM": total_m,
            "photosTotalParsed": len(photos_all),
            "photosInWindow": len(photos_in_window),
            "kmlTrackPointsTotal": len(kml_track_all),
            "positionsCsvFixesTotal": len(positions_csv_fixes_all) if track_source == "positionsCsv" else 0,
            "positionsCsvFixesInWindow": len(fixes) if track_source == "positionsCsv" else 0,
            "trackTimeStart": fixes[0].time.isoformat() if (track_source == "positionsCsv" and fixes) else None,
            "trackTimeEnd": fixes[-1].time.isoformat() if (track_source == "positionsCsv" and fixes) else None,
        },
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
