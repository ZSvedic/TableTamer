#!/usr/bin/env -S uv run --script
# /// script
# dependencies = [
#   "pandas",
#   "matplotlib",
# ]
# ///
"""Helper for commit-sizes.sh — not meant to be run by hand.

Reads temp/commit-sizes.csv and renders temp/commit-sizes.png: a stacked area
chart of the ops/ spec/ src/ byte sizes with the tracked TOTAL overlaid as a
line. The gap between the stack top and the TOTAL line is the root files
(README.md, LICENSE, .gitignore)."""

import os
import pandas as pd
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
TEMP = os.path.join(HERE, "..", "..", "temp")
df = pd.read_csv(os.path.join(TEMP, "commit-sizes.csv"))


def label(row):
    msg = str(row["message"])
    if len(msg) > 55:
        msg = msg[:54] + "…"
    return f'{row["commit"]}  {msg}'


labels = df.apply(label, axis=1)
x = range(len(df))
kb = lambda col: df[col] / 1024

fig, ax = plt.subplots(figsize=(14, 10))
ax.stackplot(
    x, kb("ops"), kb("spec"), kb("src"),
    labels=["ops/", "spec/", "src/"], alpha=0.85,
)
ax.plot(x, kb("total"), color="black", linewidth=1.5, marker="o", markersize=3, label="TOTAL")
ax.set_xticks(list(x))
ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=8)
ax.set_ylabel("Tracked file size (KB)")
ax.set_title("Git Project Size by Commit")
ax.legend(loc="upper left")
fig.subplots_adjust(bottom=0.45, top=0.96, left=0.07, right=0.98)

OUT_PNG = os.path.join(TEMP, "commit-sizes.png")
fig.savefig(OUT_PNG, dpi=200)
print(f"Saved {OUT_PNG}")
