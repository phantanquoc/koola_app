#!/usr/bin/env bash
# measure-chat-scroll.sh — capture dumpsys gfxinfo samples while scrolling ChatScreen.
#
# Usage: measure-chat-scroll.sh <label> [samples]
#
# Drives the scroll with `adb shell input swipe` so the gesture is identical
# across runs — a hand-scrolled comparison cannot separate a real change from a
# difference in how hard someone flicked.
#
# Per sample: reset gfxinfo, perform SWIPES_PER_SAMPLE swipes, read the stats.
# Sample 1 and 2 are still recorded but must be discarded when averaging: the
# first frames after a reset carry warmup cost (shader/atlas/JIT) that has
# nothing to do with steady-state scrolling. Confirmed in an earlier
# bottom-tab investigation on this project.
set -uo pipefail

DEVICE="${DEVICE:-7999fd53}"
PKG="${PKG:-com.chatapp}"
LABEL="${1:?usage: measure-chat-scroll.sh <label> [samples]}"
SAMPLES="${2:-5}"
SWIPES_PER_SAMPLE="${SWIPES_PER_SAMPLE:-10}"
OUT_DIR="${OUT_DIR:-/tmp/koola_perf}"

mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/${LABEL}.raw.txt"
CSV="$OUT_DIR/${LABEL}.csv"
: > "$RAW"
echo "sample,total_frames,janky_frames,janky_pct,p50_ms,p90_ms,p95_ms,p99_ms" > "$CSV"

adb_sh() { adb -s "$DEVICE" shell "$@"; }

# Swipe geometry: a long upward drag through the middle of the message list,
# avoiding the header (top ~15%) and the composer (bottom ~15%).
X=540
Y_FROM=1800
Y_TO=600
SWIPE_MS=250

echo "=== measuring '$LABEL' on $DEVICE ($SAMPLES samples x $SWIPES_PER_SAMPLE swipes) ==="

for s in $(seq 1 "$SAMPLES"); do
  adb_sh "dumpsys gfxinfo $PKG reset" > /dev/null 2>&1

  for _ in $(seq 1 "$SWIPES_PER_SAMPLE"); do
    # Alternate direction so the list does not simply pin to one end.
    adb_sh "input swipe $X $Y_FROM $X $Y_TO $SWIPE_MS" > /dev/null 2>&1
    sleep 0.35
    adb_sh "input swipe $X $Y_TO $X $Y_FROM $SWIPE_MS" > /dev/null 2>&1
    sleep 0.35
  done

  sleep 0.8   # let the last frames land before reading counters

  stats="$(adb_sh "dumpsys gfxinfo $PKG" 2>/dev/null)"
  printf '\n===== sample %s =====\n%s\n' "$s" "$stats" >> "$RAW"

  # Percentiles must be read as the value before "ms", NOT the first number on
  # the line: "50th percentile: 8ms" starts with the literal 50 from "50th", so
  # a plain first-number grep reports the percentile label as its own value.
  pct() { printf '%s' "$stats" | grep -m1 "${1}th percentile:" | sed -E 's/.*percentile: *([0-9]+)ms.*/\1/'; }

  total=$(printf '%s' "$stats"  | grep -m1 "Total frames rendered"  | grep -oE '[0-9]+' | head -1)
  janky=$(printf '%s' "$stats"  | grep -m1 "Janky frames"           | grep -oE '[0-9]+' | head -1)
  jpct=$(printf '%s' "$stats"   | grep -m1 "Janky frames"           | grep -oE '\(([0-9.]+)%\)' | grep -oE '[0-9.]+')
  p50=$(pct 50)
  p90=$(pct 90)
  p95=$(pct 95)
  p99=$(pct 99)

  echo "$s,${total:-},${janky:-},${jpct:-},${p50:-},${p90:-},${p95:-},${p99:-}" >> "$CSV"
  printf 'sample %s: frames=%-5s janky=%-4s (%-5s%%)  p50=%-3s p90=%-3s p95=%-3s p99=%-4s\n' \
    "$s" "${total:-?}" "${janky:-?}" "${jpct:-?}" "${p50:-?}" "${p90:-?}" "${p95:-?}" "${p99:-?}"
done

echo
echo "=== '$LABEL' summary (samples 3+, warmup discarded) ==="
awk -F, 'NR>3 && $2!="" {n++; jp+=$4; p50+=$5; p90+=$6; p95+=$7; p99+=$8}
  END { if (n>0) printf "n=%d  janky=%.2f%%  p50=%.1fms  p90=%.1fms  p95=%.1fms  p99=%.1fms\n",
        n, jp/n, p50/n, p90/n, p95/n, p99/n; else print "no usable samples" }' "$CSV"
echo "raw: $RAW"
echo "csv: $CSV"
