#!/usr/bin/env bash
set -euo pipefail

OUT="commit-sizes.csv"

echo "date,commit,bytes,kb" > "$OUT"

git log --reverse --format=%H |
while read -r c; do
  date=$(git show -s --format=%cs "$c")
  short=$(git rev-parse --short "$c")

  bytes=$(git ls-tree -r -l "$c" |
    awk '{s += $4} END {print s+0}')

  kb=$(awk "BEGIN {printf \"%.2f\", $bytes / 1024}")

  echo "$date,$short,$bytes,$kb" >> "$OUT"
done

echo "Saved $OUT"
