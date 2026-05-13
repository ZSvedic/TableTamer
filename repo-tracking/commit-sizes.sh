#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
OUT="commit-sizes.csv"

echo "date,commit,bytes,kb,message" > "$OUT"

git -C .. log --reverse --format=%H |
while read -r c; do
  date=$(git -C .. show -s --format=%cs "$c")
  short=$(git -C .. rev-parse --short "$c")
  msg=$(git -C .. show -s --format=%s "$c" | sed 's/"/""/g')

  bytes=$(git -C .. ls-tree -r -l "$c" |
    awk '{s += $4} END {print s+0}')

  kb=$(awk "BEGIN {printf \"%.2f\", $bytes / 1024}")

  echo "$date,$short,$bytes,$kb,\"$msg\"" >> "$OUT"
done

echo "Saved $OUT"
