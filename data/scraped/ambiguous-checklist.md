# Ambiguous near-duplicate pairs — review

Found **9 pairs** with Levenshtein distance 1–4 where locations also match. These are the cases the auto-merge can't handle confidently.

For each pair:
- If they are the **same mountain**: put `[x]` next to the row you want to keep as canonical. The other is deleted and its pass_types merged into the canonical.
- If they are **different mountains**: leave both boxes blank. They stay separate.

---

### Boyne Mountain  ↔  Pine Mountain  (distance=3)
- [ ] **keep** id=241 "Boyne Mountain" — Ikon — MI
- [ ] **keep** id=490 "Pine Mountain" — Indy — Michigan

### Silver Mountain  ↔  Soldier Mountain  (distance=3)
- [ ] **keep** id=296 "Silver Mountain" — Indy — ID
- [ ] **keep** id=299 "Soldier Mountain" — Indy — ID

### Apex Mountain Resort  ↔  Baldy Mountain Resort  (distance=4)
- [ ] **keep** id=530 "Apex Mountain Resort" — Indy — British Columbia
- [ ] **keep** id=531 "Baldy Mountain Resort" — Indy — British Columbia

### Black Mountain  ↔  Loon Mountain  (distance=4)
- [ ] **keep** id=343 "Black Mountain" — Indy — NH
- [ ] **keep** id=243 "Loon Mountain" — Ikon — NH

### Boyne Highlands  ↔  The Highlands  (distance=4)
- [ ] **keep** id=240 "Boyne Highlands" — Ikon — MI
- [ ] **keep** id=428 "The Highlands" — Ikon — MI

### Cannon Mountain  ↔  Loon Mountain  (distance=4)
- [ ] **keep** id=320 "Cannon Mountain" — Indy — NH
- [ ] **keep** id=243 "Loon Mountain" — Ikon — NH

### Cannon Mountain  ↔  Tenney Mountain  (distance=4)
- [ ] **keep** id=320 "Cannon Mountain" — Indy — NH
- [ ] **keep** id=356 "Tenney Mountain" — Indy — NH

### Detroit Mountain  ↔  Spirit Mountain  (distance=4)
- [ ] **keep** id=476 "Detroit Mountain" — Indy — Minnesota
- [ ] **keep** id=495 "Spirit Mountain" — Indy — Minnesota

### Snowbasin  ↔  Snowbird  (distance=4)
- [ ] **keep** id=215 "Snowbasin" — Ikon — UT
- [ ] **keep** id=374 "Snowbird" — Mountain Collective — UT
