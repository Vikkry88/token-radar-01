# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Vikkry88/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Vikkry88/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — every protocol with no token on record, ranked by implied value, with a concrete farm plan for each. The board covers all 40 protocols on the snapshot's watchlist plus 158 more pre-token protocols found below the floor, scored by one model from the snapshot's own figures (TVL, seven-day growth, age with no token, chain breadth). Live-token protocols are set aside with their market caps, never mixed into the ranking. The dashboard is sortable and filterable, has a detail view per protocol with the model's line-by-line breakdown, and a model sandbox that re-scores the board under the reader's own constants.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Node 22.18 or later, standard library only — nothing to install. The program reads the sealed snapshot, writes the ranked board to `out/board.json`, the dashboard's data to `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json`.

---

Entered on [make.fun](https://make.fun/?ref=tvfbjxfd&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
