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

os.chdir(os.path.dirname(os.path.abspath(__file__)))
df = pd.read_csv("commit-sizes.csv")

plt.figure(figsize=(10, 5))
plt.plot(df["commit"], df["kb"], marker="o")
plt.xticks(rotation=90)
plt.xlabel("Commit")
plt.ylabel("Tracked file size (KB)")
plt.title("Git Project Size by Commit")
plt.tight_layout()
plt.savefig("commit-sizes.png", dpi=200)

print("Saved commit-sizes.png")