#!/usr/bin/env -S uv run --script
# /// script
# dependencies = [
#   "pandas",
#   "matplotlib",
# ]
# ///

import os
import pandas as pd
import matplotlib.pyplot as plt

# This script lives at ops/repo-tracking/. The CSV sits beside it (tracked);
# the rendered PNG is a disposable artifact, so it goes to temp/.
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
OUT_PNG = os.path.join(HERE, "..", "..", "temp", "commit-sizes.png")
df = pd.read_csv("commit-sizes.csv")

def label(row):
    msg = str(row["message"])
    if len(msg) > 55:
        msg = msg[:54] + "…"
    return f'{row["commit"]}  {msg}'

labels = df.apply(label, axis=1)

fig, ax = plt.subplots(figsize=(14, 10))
ax.plot(range(len(df)), df["kb"], marker="o")
ax.set_xticks(range(len(df)))
ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=8)
ax.set_ylabel("Tracked file size (KB)")
ax.set_title("Git Project Size by Commit")
fig.subplots_adjust(bottom=0.45, top=0.96, left=0.07, right=0.98)
fig.savefig(OUT_PNG, dpi=200)

print(f"Saved {OUT_PNG}")
