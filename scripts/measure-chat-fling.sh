#!/usr/bin/env bash
# measure-chat-fling.sh — gfxinfo samples under FAST, CONTINUOUS flinging.
#
# Usage: measure-chat-fling.sh <label> [samples]
#
# Differs from measure-chat-scroll.sh in the gesture only: a short 60ms drag
# (a fling, not a controlled drag) issued back-to-back with no settle pause.
# This keeps the list in continuous motion so recycling, image decode and
# re-render overlap instead of each finishing during an idle gap.
#
# Sample 1 and 2 carry post-reset warmup cost (shader/atlas/JIT) and are
# discarded when averaging, same as the scroll script.
#
# The list must NOT be pinned at either end: a fling against a pinned edge
# renders a static screen and reports fake-good numbers. verify_scrollable()
# aborts in that case rather than emitting misleading data.
set -uo pipefail

DEVICE="${DEVICE:-25c75ebf}"
PKG="${PKG:-com.chatapp}"
LABEL="${1:?usage: measure-chat-fling.sh <label> [samples]}"
SAMPLES="${2:-6}"
FLINGS_PER_SAMPLE="${FLINGS_PER_SAMPLE:-12}"
OUT_DIR="${OUT_DIR:-/tmp/koola_perf}"

mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/${LABEL}.raw.txt"
CSV="$OUT_DIR/${LABEL}.csv"
: > "$RAW"
echo "sample,total_frames,janky_frames,janky_pct,p50_ms,p90_ms,p95_ms,p99_ms" > "$CSV"

adb_sh() { adb -s "$DEVICE" shell "$@"; }

X=540
Y_FROM=1800
Y_TO=600
FLING_MS=60      # short duration => high velocity => real fling with momentum

# Content signature of the visible tree; changes iff the list actually moved.
sig() {
  adb_sh "uiautomator dump /sdcard/_fling.xml >/dev/null 2>&1" >/dev/null 2>&1
  adb_sh "cat /sdcard/_fling.xml" 2>/dev/null | tr -d '\r' \
    | grep -oE 'text="[^"]{1,30}"' | md5sum | cut -c1-12
}

verify_scrollable() {
  local a b c
  a="$(sig)"
  adb_sh "input swipe $X $Y_FROM $X $Y_TO 200" >/dev/null 2>&1; sleep 0.9
  b="$(sig)"
  adb_sh "input swipe $X $Y_TO $X $Y_FROM 200" >/dev/null 2>&1; sleep 0.9
  c="$(sig)"
  if [ "$a" = "$b" ] || [ "$b" = "$c" ]; then
    echo "ABORT: list did not move in one or both directions (a=$a b=$b c=$c)." >&2
    echo "       It is pinned at an edge — reposition to mid-history first." >&2
    return 1
  fi
  echo "scroll check OK (a=$a b=$b c=$c)"
}

echo "=== FLING test '$LABEL' on $DEVICE ($SAMPLES samples x $FLINGS_PER_SAMPLE flings, ${FLING_MS}ms drags, no settle) ==="
verify_scrollable || exit 1

for s in $(seq 1 "$SAMPLES"); do
  adb_sh "dumpsys gfxinfo $PKG reset" > /dev/null 2>&1

  # Back-to-back flings, alternating direction, no sleep: the list never settles.
  for i in $(seq 1 "$FLINGS_PER_SAMPLE"); do
    if [ $((i % 2)) -eq 1 ]; then
      adb_sh "input swipe $X $Y_FROM $X $Y_TO $FLING_MS" > /dev/null 2>&1
    else
      adb_sh "input swipe $X $Y_TO $X $Y_FROM $FLING_MS" > /dev/null 2>&1
    fi
  done

  sleep 1.0   # let in-flight frames land before reading counters

  stats="$(adb_sh "dumpsys gfxinfo $PKG" 2>/dev/null)"
  printf '\n===== sample %s =====\n%s\n' "$s" "$stats" >> "$RAW"

  # Read the value before "ms", not the first number on the line: the label
  # ("50th") would otherwise be captured as the measurement.
  pct() { printf '%s' "$stats" | grep -m1 "${1}th percentile:" | sed -E 's/.*percentile: *([0-9]+)ms.*/\1/'; }

  total=$(printf '%s' "$stats" | grep -m1 "Total frames rendered" | grep -oE '[0-9]+' | head -1)
  janky=$(printf '%s' "$stats" | grep -m1 "Janky frames"          | grep -oE '[0-9]+' | head -1)
  jpct=$(printf '%s' "$stats"  | grep -m1 "Janky frames"          | grep -oE '\(([0-9.]+)%\)' | grep -oE '[0-9.]+')
  jleg=$(printf '%s' "$stats"  | grep -m1 "Janky frames (legacy)" | grep -oE '\(([0-9.]+)%\)' | grep -oE '[0-9.]+')
  p50=$(pct 50); p90=$(pct 90); p95=$(pct 95); p99=$(pct 99)

  echo "$s,${total:-},${janky:-},${jpct:-},${p50:-},${p90:-},${p95:-},${p99:-}" >> "$CSV"
  printf 'sample %s: frames=%-5s janky=%-5s (%-5s%%) legacy=%-5s%%  p50=%-3s p90=%-3s p95=%-4s p99=%-4s\n' \
    "$s" "${total:-?}" "${janky:-?}" "${jpct:-?}" "${jleg:-?}" "${p50:-?}" "${p90:-?}" "${p95:-?}" "${p99:-?}"
done

echo
echo "=== '$LABEL' summary (samples 3+, warmup discarded) ==="
awk -F, 'NR>3 && $2!="" {n++; f+=$2; jp+=$4; p50+=$5; p90+=$6; p95+=$7; p99+=$8}
  END { if (n>0) printf "n=%d  frames=%.0f  janky=%.2f%%  p50=%.1fms  p90=%.1fms  p95=%.1fms  p99=%.1fms\n",
        n, f/n, jp/n, p50/n, p90/n, p95/n, p99/n; else print "no usable samples" }' "$CSV"
echo "raw: $RAW"
echo "csv: $CSV"
