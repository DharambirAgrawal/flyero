# Flyero — Output First

*Nobody cares how it works. They care that the flyer looks like a human with taste made it. Everything here is reverse-engineered from that.*

---

## The only promise that matters

> **You never get a bad flyer marked as done.**

Every 2026 tool shows you the model's first draft and hopes you'll fix it. That's the whole category's weakness, and it's visible in one glance at their output. Flyero's promise is the opposite: internally it can try and throw away many attempts — a flyer only returns `status: done` if it would survive a real design studio's internal review. If nothing clears the bar, the API returns an honest `below_bar` failure (never a fake success). The user experiences magic when it works; honesty when it doesn't. What's under the hood is nobody's business.

---

## What "looks human-made" actually means

"Human-like" is not vague. When you put a $2,000 agency flyer next to AI output, the difference is six concrete, **checkable** things. These are the product spec:

### 1. One idea, not decoration
Every great flyer can be described in one sentence: *"the headline threads through the torn résumé"*, *"the bullet points literally compile into a job offer."* AI output can't be described — it's a headline floating on a gradient.
**→ The One-Sentence Test:** if the flyer's idea can't be stated in one sentence, it doesn't ship.

### 2. The product is the picture
A human designing for a résumé tool shows a résumé. The subject becomes the visual material. AI shows abstract "technology" shapes that could belong to any company.
**→ The Cover Test:** cover the logo and the headline. Can a stranger still guess what the product does? If no, it doesn't ship. (Canva's Vayami flyer fails this instantly — that's the exact gap.)

### 3. Restraint — fewer things, bigger
Humans remove elements until it hurts. AI adds elements until the canvas is "full." Great flyers usually have 4–7 things on them, not 12.
**→ The Delete Test:** every element must answer *"what breaks if you remove me?"* No answer → deleted before render. (Matches Gate G3 in `REQUIREMENTS.md`.)

### 4. Typography does the work
In human design, the type often *is* the design — scale contrast, a word that interacts with an image, a line that bends around the subject. AI treats text as labels dropped onto decoration.
**→ Rule (Gate G4 — every shipped flyer):** the headline must physically participate in the composition (scale contrast, overlap, mask, wrap, or structural role) — it is not a label floating on decoration.

### 5. One deliberate rule-break
Human work has exactly one violation: something crops off the edge, one element leans, one overlap that's clearly on purpose. It signals a person made a choice. AI is either perfectly centered-symmetric or randomly messy.
**→ Rule:** every flyer gets exactly one signature gesture. Not zero (generic), not three (chaos).

### 6. Real words
"Innovate. Integrate. Elevate." is how AI talks. "Your résumé, read the way recruiters actually read it" is how a person talks. Copy is half the design.
**→ Rule:** no invented stats, no slogan-shaped emptiness. If real facts are missing, say something true and specific instead of something impressive and hollow.

These six gates are the moat. Not the architecture — the **bar**. Anyone can generate a flyer; nobody else refuses to show you a bad one.

---

## The banned list (auto-reject on sight)

The 2026 AI look, spelled out so the system can detect and kill it:

- Dark navy gradient + cyan/purple glow
- Centered logo, centered headline, centered button, nothing else
- Three equal feature cards
- Floating glassmorphism panel / generic 3D orb
- Decorative grid or noise that means nothing
- Rounded pill CTA as the only visual event

Any output with two or more of these — regardless of how "clean" it looks — fails the rule critic / gatekeeper and is not marked `done`. Detection heuristics are in `SCHEMAS.md` §8. Being *not-that* is the visible differentiator people will screenshot and share.

---

## How a human designs a flyer (the sequence we copy)

Not the human's style — the human's **order of operations**:

1. **Understand the product** — what it does, for whom, what the one benefit is.
2. **Find the idea** — one visual thought that makes the benefit *seen*, not stated.
3. **Sketch in black and white** — composition first; if it doesn't work without color, color won't save it.
4. **Build everything around the idea** — type, image, space all serve it.
5. **Remove** — cut every element that doesn't serve it.
6. **Break one rule** — the signature gesture.
7. **Look at it fresh and judge honestly** — reject and restart if it's not there yet.

Step 7 is what every current tool skips — they generate blind and ship the first draft. Flyero looks at its own render like a person would, and restarts when a person would.

---

## Start: the flyer. Only the flyer.

One format done at agency level beats five formats done at Canva level. The whole company is this test:

> **Give Flyero 10 real products (grab them off Product Hunt). For each, one flyer. Put each next to what Canva/Lovart produce for the same brief. A stranger picks the human-looking one — Flyero has to win 8 out of 10.**

That side-by-side *is* the product proof AND the marketing. Post the comparisons publicly. If the output is really different, the output advertises itself — the same way Gamma grew because every export was a demo.

### Scalability, in one paragraph (then we stop talking about it)
The flyer is built from a design spec — the idea, the components, the relationships — not from hardcoded pixels. That means the same spec can later re-compile into a story format, a deck, a 10-second motion version. So nothing gets rebuilt when we expand; the flyer engine *is* the future campaign engine. That's the entire scalability plan, and the user never needs to know it exists.

---

## What "great" looks like, day one

The old Vayami brief, done right:

- The hero is a **real résumé being visibly improved** — a bullet point mid-rewrite, a weak line struck through, a strong one emerging. The product demo *is* the composition.
- The headline **interacts** with the résumé — maybe it sits behind the document and re-emerges, so reading the headline forces you to see the product.
- One gesture: the improvement path runs off the canvas edge and its endpoint **becomes the CTA underline**.
- Copy that sounds human: *"Turn experience into opportunity."* — with the waitlist link and a QR code, because it's a flyer, not a slide.
- And critically: five people ask for a Vayami flyer this week → five structurally different ideas. Not five recolors.

Someone sees that and asks "wait, who designed this?" — that's the moment the product exists.
