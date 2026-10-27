# TODO

## Blog fixes (paused 27 Oct 2026, resume with the tdd-build-break-fix skill)

These came from the independent review of the blog fixes. They are approved; each one gets a failing test first.

### Content accuracy
- [ ] **WhatsApp "53 crore" source:** the Bar and Bench page cited in 2 posts doesn't contain the figure. Cite the government press release instead, which says "WhatsApp users: 53 Crore": https://pib.gov.in/PressReleasePage.aspx?PRID=1700749. Affects `digital-marketing-real-estate-india-guide.ts` and `whatsapp-real-estate-lead-follow-up-india.ts`.
- [ ] **RERA claim:** the AP RERA page supports showing the registration number, but not "the website address of the state authority". Cite the Act's section 11(2) text, and either source "state authorities have penalised promoters" (e.g. a Haryana RERA order) or remove it.
- [ ] **Spreadsheets comparison, "Getting Meta leads in" row:** cite Meta's own help article on downloading leads (https://www.facebook.com/business/help/929596264178167, linked from Meta's lead ads developer guide) instead of the lead-ads marketing page.
- [ ] **Spreadsheets comparison, "Who sees which leads" row:** the Google link redirects to a page that doesn't say "anyone who can open it sees every row". Reword it to "Sheets sharing applies to the whole file, not to single rows" and re-cite.
- [ ] **WhatsApp API post table:** "Message anyone who has your number saved or messages you" is wrong, because the app can message any WhatsApp number. Reword.
- [ ] **WhatsApp API post, free entry point:** add Meta's conditions: the ad is opened in the WhatsApp Android or iOS app, and the reply is sent inside the customer service window.
- [ ] **Unsourced lines:**
  - Remove "about 10 minutes" from the Meta setup CTA.
  - Hedge "every extra question lowers…" and "bring more leads at a lower cost" with "usually".
- [ ] **"Every lead" wording:** change "greets every Meta lead" / "asks every Meta lead" to "once the WhatsApp bot is on, greets each new lead". The bot is off until a workspace turns it on, and leads from before that aren't messaged.

### Guards (tests)
- [ ] **T5 (LeadOS overclaims):** scan all post text that mentions LeadOS, including lists, tables and FAQ. Widen the pattern to also catch:
  - alert/alerts/alerting, and "schedul… visit";
  - "book a visit", "site-visit booking", "floor-plans";
  - rupee/INR billing wording.
- [ ] **T4 (statistics need a source):** also catch:
  - plain large counts ("2,241", "10,000+");
  - "N times", "per cent" and "percent";
  - "Rs"/"INR" amounts, and "1.2cr"/"50k".

### Code
- [ ] **Header at 320 px:** pages still scroll sideways by about 38 px, because the 3-button theme toggle doesn't fit. Below 640 px, collapse it to one button or hide it. 375 px is fine.
- [ ] **`siteOrigin`:** fall back to localhost when `NEXT_PUBLIC_SITE_URL` is invalid ("not a url", "leados.in") or isn't http(s). Today it throws during dev and build.
- [ ] **`formatDate`:** reject impossible dates ("2026-02-30" currently shows as "2 Mar 2026") with a round-trip check.
- [ ] **Small display issue:** "(Updated 27 Oct 2026 )" has a stray space before the bracket.

### Other
- [ ] **Admin test A1 is too strict about clocks:** it fails when this PC's clock is a fraction of a second behind the database's ("expires in 30.003 min"). Allow a few seconds of difference.
- [ ] **Before publishing the HubSpot and Zoho comparisons** (now `draft: true`), have a lawyer read one. See `docs/LAUNCH-CHECKLIST.md`.

### Done (committed)
- Phone header fits at 375 px; one site address everywhere; readable dates; reading time counts tables and FAQ; `.agents` out of git and lint.
- All 12 posts rewritten from verified sources:
  - false HubSpot and Zoho claims removed;
  - WhatsApp pricing updated to Meta's current rules;
  - 9 broken links replaced;
  - unsourced numbers removed;
  - LeadOS claims match the product.
- Share images work again; drafts have no share image (404).
