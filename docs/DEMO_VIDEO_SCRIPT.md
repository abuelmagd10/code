# 7esab ERP — Demo Video Script & Storyboard

**Target duration:** 60–75 seconds
**Aspect ratio:** 16:9 (1920 × 1080)
**Frame rate:** 30 fps
**Audio:** voiceover + soft background music (royalty-free)
**Subtitles:** burned-in for the opposite language (Arabic VO → English subs, English VO → Arabic subs)
**Output:** two MP4s — `demo-ar.mp4` and `demo-en.mp4`, plus a 6-second silent loop (`demo-loop.mp4`) for hero auto-play

---

## Recording checklist (do this first)

1. Launch 7esab.com in Chrome at 1920 × 1080, 100% zoom, dark mode OFF.
2. Sign in as `7esab.erb@gmail.com` (the test company).
3. Pre-create one customer in USD (e.g. "Mohamed Bassiouny") and pre-issue an invoice INV-00042 with totals around 120 USD so the figures look polished on screen.
4. Set browser to Arabic UI for the Arabic take, English UI for the English take.
5. Use OBS Studio with Display Capture, "Cursor highlighter" plugin on (yellow ring).
6. Microphone: pop filter + dynamic mic. Record VO separately, sync in editor.
7. Hide bookmarks bar (Ctrl+Shift+B) and any chat/notification overlays.
8. Clear the address bar to read just `7esab.com/...`.

---

## Scene-by-scene plan

### Scene 1 — Hero / brand intro (0:00 – 0:08, 8 sec)

**On-screen:**
- Open Chrome on `7esab.com` landing hero.
- Subtle 2 sec push-in on the logo + headline.
- Lower-third title card fades in: "**7esab ERP**" + tagline.

**Arabic VO:**
> «تَخَيَّل نِظام مُحاسَبَة كامِل، بِلُغَتِك، يُدير شَرِكَتَك مِن أَوَّل عَرض السِّعر حَتَّى المَيزانِيَّة.»

**English VO:**
> "Imagine a complete accounting system, in your language, running your business from the first quote to the closing balance sheet."

**Subtitles (counter-language):** match VO above.

**Editor notes:** Music swell starts here. Avoid quick cuts.

---

### Scene 2 — Modules overview (0:08 – 0:18, 10 sec)

**On-screen:**
- Cut to sidebar of the running app, scroll slowly through: Sales → Purchases → Inventory → Accounting → Banking → Reports.
- Each module name fades up in a callout as the cursor hovers it (use OBS scene transition or add in editor).

**Arabic VO:**
> «المَبيعات، المُشتَرَيات، المَخزون، الحِسابات، البُنوك، التَّقارير — كُلُّ شَىء مُتَّصِل، وَتُحَدَّث الأَرقام لَحظَة بِلَحظَة.»

**English VO:**
> "Sales, purchases, inventory, accounting, banking, reports — every module talks to every other one, and the numbers update in real time."

**Editor notes:** Show how clicking Sales transitions to its dashboard without a full reload — communicates speed.

---

### Scene 3 — Multi-currency invoice (0:18 – 0:33, 15 sec)

**On-screen:**
1. Click **New Invoice**.
2. Pick customer "Mohamed Bassiouny".
3. From the currency dropdown, pick **USD**.
4. The rate field auto-fills (e.g. `55.00`).
5. Add one line item, total appears as **120.00 $**.
6. A small subtitle line beneath the total animates in: **≈ 6,600.00 ج.م**.
7. Click **Post**; the green confirmation toast appears.
8. Quickly cut to the journal-entry detail page — show the EGP debit/credit lines.

**Arabic VO:**
> «بِع بِأَىِّ عُملَة: دولار، يورو، رِيال. سِعر الصَّرف يَحضُر تِلقائِيًّا، وَيُسَجَّل القَيد فى دَفاتِرِك بِالجُنَيه — بِدون ما تَلمَس آلَة حاسِبَة.»

**English VO:**
> "Sell in any currency — USD, EUR, SAR. The exchange rate appears automatically, and the journal entry posts in EGP — no calculator, no spreadsheet."

**Editor notes:** This is the hero feature. Hold the "≈ 6,600.00 ج.م" callout for at least 1.5 sec.

---

### Scene 4 — Customer credit refund (0:33 – 0:48, 15 sec)

**On-screen:**
1. From the customer page, click **Refund credit**.
2. Show a dialog: amount = 0.10, currency = USD, rate = 55.
3. Click confirm.
4. Cut to the payments list — show the new row reading "**0.10 $** \n ≈ 5.50 ج.م" (the two-line format).
5. Open the payment detail modal — highlight: native amount in header, base equivalent underneath, creator name "Ahmed Abuelmagd".

**Arabic VO:**
> «حَتَّى استِرداد المَبالِغ بِالعُمَلات الأَجنَبِيَّة يَتِم بِنَفس البَساطَة. التَّطبيق يُمسِك بِسِعر الصَّرف، يُحَدِّث الرَّصيد الدائِن لِلعَميل، وَيَكتُب القَيد المُحاسَبى — كُلُّ هَذا فى نَقرَة واحِدَة.»

**English VO:**
> "Even foreign-currency refunds are just as simple. The app captures the rate, updates the customer's credit balance, and posts the journal entry — all in a single click."

**Editor notes:** Zoom in slowly on the payment detail header to call out the FX two-line format.

---

### Scene 5 — Dashboard / KPIs (0:48 – 0:58, 10 sec)

**On-screen:**
- Cut to `/dashboard`.
- Show the four colour-coded KPI cards (Sales / Profit / Customers / Invoices).
- Animate the sparkline chart growing from left to right (if your live page does that, capture it; otherwise overlay a post-effect in the editor).
- Hover the "aging AR" widget to surface the tooltip.

**Arabic VO:**
> «لَوحَة تَحَكُّم لَحظِيَّة تُريك أَين تَقِف شَرِكَتُك الآن: الأَرباح، التَّدَفُّق النَّقدى، الذِّمَم المُتَأَخِّرَة — مُؤَشِّرات صَريحَة، بِدون انتِظار التَّقارير الشَّهرِيَّة.»

**English VO:**
> "A real-time dashboard tells you exactly where your business stands today — profit, cash flow, aging — clear numbers, no waiting for the month-end report."

---

### Scene 6 — Call-to-action (0:58 – 1:08, 10 sec)

**On-screen:**
- Cut back to landing-page hero.
- Mouse cursor moves to the **Start Free Trial** button; subtle pulse on the button.
- End card fades in over the last 3 sec: logo, URL `7esab.com`, tagline.

**Arabic VO:**
> «جَرِّب 7esab مَجَّانًا — مُستَخدِم واحِد مَجَّانى لِلأَبَد، بِدون بِطاقَة ائتِمان. ادخُل عَلى 7esab.com وَابدَأ الآن.»

**English VO:**
> "Try 7esab free — one user free forever, no credit card. Go to 7esab.com and start in under a minute."

**Editor notes:** End on a freeze frame with logo for 2 full seconds. Fade music out smoothly.

---

## Voice & music guidelines

- **Voice tone:** warm, professional, conversational. Avoid corporate-jargon delivery. Speed ~135 wpm.
- **Arabic recording:** use Modern Standard Arabic with Egyptian-friendly intonation. Pronounce English brand names ("7esab", "ERP") naturally without translating them.
- **English recording:** neutral global English (avoid heavy accent).
- **Music:** royalty-free corporate-uplifting bed. Suggested catalog: Epidemic Sound — "Productivity" or "Tomorrow"; Artlist — "Bright Future". Loop key: C major, BPM 100–110. Duck −12 dB under VO.
- **Pause padding:** leave 0.4 sec at the very start (before VO) and 0.6 sec at the very end (after VO finishes, before music fades).

---

## Post-production checklist

- [ ] Burn in subtitles in the opposite language (size 36pt, white with 70% black stroke, bottom 8% safe area).
- [ ] Master loudness to −16 LUFS (web standard).
- [ ] Export H.264 MP4 at 8 Mbps; AAC audio 192 kbps.
- [ ] Produce a 6-second silent muted loop (`demo-loop.mp4`) from Scene 5 (dashboard) for the landing-page hero auto-play — set CSS `muted autoplay loop playsInline`.
- [ ] Upload to Cloudflare R2 (or wherever the public assets live) and replace the `<source>` in the demo page once recorded.

---

## Where to drop the recorded files

```
public/demo/demo-ar.mp4
public/demo/demo-en.mp4
public/demo/demo-loop.mp4
public/demo/poster.jpg
```

Once those exist, the `/demo` page can be upgraded to render the recorded video alongside (or in place of) the interactive walkthrough — see TODO comment near the top of `app/demo/page.tsx`.
