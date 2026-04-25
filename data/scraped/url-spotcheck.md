# URL spot-check — 2026-04-24

Sampled from `data/scraped/enrich-urls.json` (seed: `42`).

For each row: click the link, confirm the hint on the right, then check the box.
If a URL is wrong, note it below the row and we'll blank it out in the DB.

## Daycare (`daycare_url`) — 3 to check

_Check: Page mentions childcare/daycare/nursery (not just family ski)._

- [ ] **Attitash** — NH [Epic] — [https://www.attitash.com/child-care/](https://www.attitash.com/child-care/)
- wrong URL doens't exist, elsewher eon site it says no childcare
- [ ] **Ischgl** — Austria [Ikon] — [https://www.ischgl.com/en/plan-your-trip/ischgl-a-z/guest-kindergarten-idalp_infra_100001496](https://www.ischgl.com/en/plan-your-trip/ischgl-a-z/guest-kindergarten-idalp_infra_100001496)
correct
- [ ] **Levi** — Lapland [Indy] — [https://www.levi.fi/en/ski/families/leevilandia/](https://www.levi.fi/en/ski/families/leevilandia/)
wrong, no childcare

## Main site (`url`) — 5 to check

_Check: Loads, looks like resort homepage._

- [ ] **Erciyes Ski Resort** — Kayseri [Indy] — [https://www.erciyeskayak.com/en](https://www.erciyeskayak.com/en)
correct
- [ ] **Geto Kogen** — Iwate [Indy] — [https://www.getokogen.com/winter_en/](https://www.getokogen.com/winter_en/)
correct
- [ ] **Mount Baldy Ski Area** — Ontario [Indy] — [https://www.skimountbaldy.ca/](https://www.skimountbaldy.ca/)
correct
- [ ] **Mt Buller** — Australia [Ikon, Mountain Collective] — [https://www.mtbuller.com.au/summer](https://www.mtbuller.com.au/summer)
correct
- [ ] **Megève** — Auvergne-Rhône-Alpes [Mountain Collective] — [https://www.megeve-tourisme.fr/en/](https://www.megeve-tourisme.fr/en/)
correct

## Ski school (`ski_school_url`) — 3 to check

_Check: Page is the ski/snow school, not a generic landing._

- [ ] **Great Bear Ski Valley** — South Dakota [Indy] — [https://www.greatbearpark.com/lessons/](https://www.greatbearpark.com/lessons/)
correct
- [ ] **Chamonix** — Auvergne-Rhône-Alpes [Mountain Collective] — [https://en.chamonix.com/activities/winter/skiing/ski-schools](https://en.chamonix.com/activities/winter/skiing/ski-schools)
correct
- [ ] **McIntyre Ski Area** — New Hampshire [Indy] — [https://www.mcintyreskiarea.com/single-lessons/](https://www.mcintyreskiarea.com/single-lessons/)
correct

## Ski school cost (`ski_school_cost_url`) — 3 to check

_Check: Page shows lesson prices._

- [ ] **Geto Kogen** — Iwate [Indy] — [https://www.getokogen.com/winter_en/04activity/school/01ski.html](https://www.getokogen.com/winter_en/04activity/school/01ski.html)
correct
- [ ] **Grandvalira Resorts Andorra** — Andorra [Ikon] — [https://www.grandvalira.com/en/schools/children-lessons](https://www.grandvalira.com/en/schools/children-lessons)
correct
- [ ] **Mt. Abram** — Maine [Indy] — [https://www.mtabram.com/winter/rentals-lessons/lessons/](https://www.mtabram.com/winter/rentals-lessons/lessons/)
correct

## Kids ski free (`kids_ski_free_url`) — 5 to check

_Check: Page actually describes the kids-ski-free policy._

- [ ] **Levi** — Lapland [Indy] — [https://www.levi.fi/en/ski/families/](https://www.levi.fi/en/ski/families/)
correct
- [ ] **Hochzeiger Bergbahnen Pitztal** — Tyrol [Indy] — [https://www.hochzeiger.com/en/free-childrens-ski-courses-for-beginners.html](https://www.hochzeiger.com/en/free-childrens-ski-courses-for-beginners.html)
wrong url -- kids do ski free under 10 but it's stated here: https://www.hochzeiger.com/en/hochzeiger-prices-in-winter.html
- [ ] **Nozawa Onsen** — Japan [Epic] — [https://en.nozawaski.com/the-mountain/lift-ticket/ticket-prices/](https://en.nozawaski.com/the-mountain/lift-ticket/ticket-prices/) correct
- [ ] **Niseko United** — Japan [Ikon, Mountain Collective] — [https://www.niseko.ne.jp/en/lift/](https://www.niseko.ne.jp/en/lift/)
wrong no free policy listed
- [ ] **Lost Valley** — Maine [Indy] — [https://www.lostvalleyski.com/lift_ticket_season_pass/](https://www.lostvalleyski.com/lift_ticket_season_pass/) wrong, children 5 and under are $90

---

## Notes

_Record any bad URLs here so we can null them out:_

see corrections above. the main issues are the daycares and "kids ski free" policies -- those are only 50% accurate.
