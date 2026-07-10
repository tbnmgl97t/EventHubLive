#!/usr/bin/env bash
# Seed the DEV Edge Config with sample data using only curl.
#
# Usage:
#   VERCEL_API_TOKEN=xxx bash scripts/seed-dev.sh
#
# The dev Edge Config ID is hardcoded below. Change EDGE_CONFIG_ID if needed.

set -euo pipefail

EDGE_CONFIG_ID="${EDGE_CONFIG_ID:-ecfg_fb8yhochxnnx4uimnv7vm9hunzg9}"
TOKEN="${VERCEL_API_TOKEN:?VERCEL_API_TOKEN is required}"

# Guard: refuse to write to the prod store unless explicitly overridden
PROD_EC_ID="ecfg_klyq8hjj2xsoc0aze4ov44kjiecm"
FORCE_SEED="${FORCE_SEED:-}"
if [[ "$EDGE_CONFIG_ID" == "$PROD_EC_ID" && -z "$FORCE_SEED" ]]; then
  echo "[seed] ✗ Refusing to seed production Edge Config."
  echo "[seed]   To force, re-run with FORCE_SEED=1"
  exit 1
fi
if [[ "$EDGE_CONFIG_ID" == "$PROD_EC_ID" ]]; then
  echo "[seed] ⚠  FORCE_SEED set — writing to production Edge Config"
fi

echo "[seed] Target: $EDGE_CONFIG_ID"
echo "[seed] Writing tournaments + cost_records …"

curl -sf -X PATCH \
  "https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
  "items": [
    {
      "operation": "upsert",
      "key": "tournaments",
      "value": [
        {
          "id": 1,
          "name": "Key West Classic 2026",
          "location": "Key West, FL",
          "days": [
            { "id": 1, "label": "Pro/Am",          "date": "2026-04-16", "start_time": "8:00 AM", "end_time": "3:00 PM", "tz": "ET", "streams": [{"id":1,"url":"https://cdn.jwplayer.com/live/broadcast/die1qpMr.m3u8","name":"Main Deck"},{"id":2,"url":"https://cdn.jwplayer.com/live/broadcast/CpOw7syq.m3u8","name":"Bridge"}] },
            { "id": 2, "label": "Session 1",        "date": "2026-04-17", "start_time": "8:00 AM", "end_time": "5:00 PM", "tz": "ET", "streams": [{"id":1,"url":"https://cdn.jwplayer.com/live/broadcast/die1qpMr.m3u8","name":"Main Deck"},{"id":2,"url":"https://cdn.jwplayer.com/live/broadcast/CpOw7syq.m3u8","name":"Bridge"}] },
            { "id": 3, "label": "Session 2",        "date": "2026-04-18", "start_time": "8:00 AM", "end_time": "5:00 PM", "tz": "ET", "streams": [{"id":1,"url":"https://cdn.jwplayer.com/live/broadcast/die1qpMr.m3u8","name":"Main Deck"},{"id":2,"url":"https://cdn.jwplayer.com/live/broadcast/CpOw7syq.m3u8","name":"Bridge"}] },
            { "id": 4, "label": "Finals",            "date": "2026-04-19", "start_time": "8:00 AM", "end_time": "5:00 PM", "tz": "ET", "streams": [{"id":1,"url":"https://cdn.jwplayer.com/live/broadcast/die1qpMr.m3u8","name":"Main Deck"},{"id":2,"url":"https://cdn.jwplayer.com/live/broadcast/CpOw7syq.m3u8","name":"Bridge"}] }
          ]
        },
        {
          "id": 2,
          "name": "Block Island Shootout",
          "location": "Block Island, RI",
          "days": [
            { "id": 1, "label": "Day 1",  "date": "2026-06-12", "start_time": "7:00 AM", "end_time": "4:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null },
            { "id": 2, "label": "Day 2",  "date": "2026-06-13", "start_time": "7:00 AM", "end_time": "4:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null },
            { "id": 3, "label": "Finals", "date": "2026-06-14", "start_time": "7:00 AM", "end_time": "3:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null }
          ]
        },
        {
          "id": 3,
          "name": "Montauk Masters",
          "location": "Montauk, NY",
          "days": [
            { "id": 1, "label": "Pro/Am", "date": "2026-07-09", "start_time": "8:00 AM", "end_time": "3:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null },
            { "id": 2, "label": "Day 1",  "date": "2026-07-10", "start_time": "7:30 AM", "end_time": "5:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null },
            { "id": 3, "label": "Day 2",  "date": "2026-07-11", "start_time": "7:30 AM", "end_time": "5:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null }
          ]
        },
        {
          "id": 4,
          "name": "Cape Cod Invitational",
          "location": "Hyannis, MA",
          "days": [
            { "id": 1, "label": "Day 1", "date": "2026-08-07", "start_time": "8:00 AM", "end_time": "5:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null },
            { "id": 2, "label": "Day 2", "date": "2026-08-08", "start_time": "8:00 AM", "end_time": "5:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null }
          ]
        },
        {
          "id": 5,
          "name": "Key West Classic 2025",
          "location": "Key West, FL",
          "days": [
            { "id": 1, "label": "Pro/Am", "date": "2025-04-10", "start_time": "8:00 AM", "end_time": "3:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null },
            { "id": 2, "label": "Day 1",  "date": "2025-04-11", "start_time": "8:00 AM", "end_time": "5:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null },
            { "id": 3, "label": "Day 2",  "date": "2025-04-12", "start_time": "8:00 AM", "end_time": "5:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null },
            { "id": 4, "label": "Day 3",  "date": "2025-04-13", "start_time": "8:00 AM", "end_time": "4:00 PM", "tz": "ET", "camera1_url": null, "camera1_name": null, "camera2_url": null, "camera2_name": null }
          ]
        }
      ]
    },
    {
      "operation": "upsert",
      "key": "cost_records",
      "value": [
        { "id":  1, "date": "2025-04-10", "label": "KWC 2025 Pro/Am", "channel_count": 2, "start_time": "8:00 AM", "end_time": "3:00 PM" },
        { "id":  2, "date": "2025-04-11", "label": "KWC 2025 Day 1",  "channel_count": 2, "start_time": "8:00 AM", "end_time": "5:00 PM" },
        { "id":  3, "date": "2025-04-12", "label": "KWC 2025 Day 2",  "channel_count": 2, "start_time": "8:00 AM", "end_time": "5:00 PM" },
        { "id":  4, "date": "2025-04-13", "label": "KWC 2025 Day 3",  "channel_count": 2, "start_time": "8:00 AM", "end_time": "4:00 PM" },
        { "id":  5, "date": "2025-06-06", "label": "BIS 2025 Day 1",  "channel_count": 1, "start_time": "7:00 AM", "end_time": "4:00 PM" },
        { "id":  6, "date": "2025-06-07", "label": "BIS 2025 Day 2",  "channel_count": 1, "start_time": "7:00 AM", "end_time": "4:00 PM" },
        { "id":  7, "date": "2025-06-08", "label": "BIS 2025 Finals", "channel_count": 1, "start_time": "7:00 AM", "end_time": "3:00 PM" },
        { "id":  8, "date": "2025-07-11", "label": "MTK 2025 Pro/Am", "channel_count": 2, "start_time": "8:00 AM", "end_time": "2:30 PM" },
        { "id":  9, "date": "2025-07-12", "label": "MTK 2025 Day 1",  "channel_count": 2, "start_time": "7:30 AM", "end_time": "5:00 PM" },
        { "id": 10, "date": "2025-07-13", "label": "MTK 2025 Day 2",  "channel_count": 2, "start_time": "7:30 AM", "end_time": "5:00 PM" },
        { "id": 11, "date": "2026-04-16", "label": "KWC 2026 Pro/Am", "channel_count": 2, "start_time": "8:00 AM", "end_time": "3:00 PM" },
        { "id": 12, "date": "2026-04-17", "label": "KWC 2026 Day 1",  "channel_count": 2, "start_time": "8:00 AM", "end_time": "5:00 PM" },
        { "id": 13, "date": "2026-04-18", "label": "KWC 2026 Day 2",  "channel_count": 2, "start_time": "8:00 AM", "end_time": "5:00 PM" }
      ]
    }
  ]
}'

echo ""
echo "[seed] ✓ done — open your dev preview to verify"
