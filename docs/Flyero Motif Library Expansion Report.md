## Flyero Motif Library Expansion Report

This report details research into potential new decorative motif sources for the Flyero flyer-generation engine and presents several hand-authored SVG motifs, complete with descriptions.

## Part 1 — Research Findings

### Icon/Illustration/Doodle Sources

| Name and URL | License Details | Bulk/API Download & Scraping Policy | Style/Category |
|---|---|---|---|
| **Open Doodles**<br>https://www.opendoodles.com/ | **Exact License:** "CC0 license. You can copy, edit, remix, share, or redraw these images for any purpose without restriction under copyright or database law." [1]<br>**Attribution Required:** No<br>**Commercial Use Allowed:** Yes<br>**Redistribution/Modification Allowed:** Yes | The site offers individual SVG/PNG downloads and mentions source files via Dropbox. It does not explicitly forbid automated scraping in its 'About' page. | Sketchy, playful, hand-drawn style, featuring figures of people in various poses. |
| **unDraw**<br>https://undraw.co/ | **Exact License:** "All images, assets and vectors published on unDraw can be used for free. You can use them for noncommercial and commercial purposes. You do not need to ask permission from or provide credit to the creator or unDraw. More precisely, unDraw grants you an nonexclusive, worldwide copyright license to download, copy, modify, distribute, perform, and use the assets provided from unDraw for free, including for commercial purposes, without permission from or attributing the creator or unDraw. This license does not include the right to compile assets, vectors or images from unDraw to replicate a similar or competing service, in any form or distribute the assets in packs or otherwise. This extends to automated and non-automated ways to link, embed, scrape, search or download the assets included on the website without our consent. Additionally, this license explicitly prohibits the use of unDraw assets, vectors, and images for training, fine-tuning, or developing artificial intelligence, machine learning models, or similar technologies." [2]<br>**Attribution Required:** No<br>**Commercial Use Allowed:** Yes<br>**Redistribution/Modification Allowed:** Yes (with restrictions: cannot replicate service, distribute in packs, or or use for AI/ML training) | Explicitly forbids automated scraping "without our consent." No official bulk/API download is mentioned. | Flat, colorful, modern illustrations of people and concepts. |
| **SVG Repo**<br>https://www.svgrepo.com/ | **Exact License (SVG Repo License):** "You don't need to give attribution to SVG Repo or any author for this licensed content... You are free: to share – to copy, distribute with limitation and transmit the work; to remix – to adapt the work. Under the following terms: attribution – author waived their rights or author is SVG Repo LLC, no attribution required but appreciated; share alike – If you remix, transform, or build upon the material, you can distribute your work under any license; redistribution - You can't redistribute material in a similar way to SVG Repo website as it is; reselling - You can't resell the material for money as it is, but you can use as part of a commercial project." [3]<br>**Attribution Required:** No (appreciated)<br>**Commercial Use Allowed:** Yes (as part of a commercial project, not for reselling as-is)<br>**Redistribution/Modification Allowed:** Yes (with restrictions: cannot redistribute in a similar way to SVG Repo) | The site offers an "Icon API" [3]. Its Terms of Use do not explicitly forbid automated scraping, but the licensing page states, "redistribution - You can't redistribute material in a similar way to SVG Repo website as it is." [3] | Diverse styles, including monocolor, multicolor, outlined, filled, glyph, rounded, sharp, doodle, hand-drawn, isometric, and 3D. |
| **The Noun Project**<br>https://thenounproject.com/ | **Exact License:** Icons are available under various licenses, including Public Domain (CC0) and Creative Commons Attribution (CC BY 3.0). The specific license depends on the individual icon. For CC BY 3.0, attribution is required. A Pro subscription allows use without attribution. [4]<br>**Attribution Required:** Varies by icon (required for CC BY 3.0, not for CC0 or Pro)<br>**Commercial Use Allowed:** Yes (with appropriate licensing)<br>**Redistribution/Modification Allowed:** Yes (with appropriate licensing) | Explicitly forbids automated scraping: "Further, the use of manual or automated software, devices, or other processes to “crawl,” “scrape,” or “spider” any portion of the Services (including any and all Content, such as Photos and Icons) is strictly prohibited." [4] Offers an API for programmatic access. | Wide variety of icons and symbols, covering many categories and styles. |

### Bunting Banner Descriptions from Hand-Drawn Party/Event Posters

Based on the image search results for hand-drawn party/event posters with pennant bunting banners, here are descriptions of how the bunting is typically drawn:

1.  **Image 2 (from search results):** This example shows a single strand of bunting with approximately 10-12 pennants. The pennants are triangular, with slightly rounded bottoms, and appear to be in alternating pastel colors (pinks, yellows, blues, greens). They are strung along a gentle, upward-curving arc, with small, consistent gaps between each pennant. The string itself is a thin, hand-drawn line. [5]
2.  **Image 4 (from search results):** This bunting features about 10 rectangular pennants, each with a slightly wavy bottom edge, spelling out "HAPPY BIRTHDAY." The colors are bright and alternating (red, yellow, green, blue, orange, purple). The string forms a relatively straight line with a slight dip in the middle, and the pennants are evenly spaced with small gaps. [6]
3.  **Image 5 (from search results):** This example displays multiple strands of bunting, each with varying numbers of pennants (around 8-15 per strand). The pennants are a mix of triangular and scalloped shapes. The colors are vibrant and alternating, including shades of blue, green, yellow, and orange. The strands are drawn in gentle arcs, some curving upwards and others downwards, creating a festive layered effect. The gaps between pennants are small and consistent. [7]
4.  **Image 8 (from search results):** This poster features a single, long strand of bunting with numerous small, triangular pennants (over 20). The pennants are in a mix of solid colors and simple patterns (e.g., stripes, polka dots) in a monochrome palette. The bunting is drawn in a loose, hand-sketched style, forming a graceful, downward-sweeping arc. The pennants are closely spaced with minimal gaps. [8]

## Part 2 — Hand-Authored New Motifs

```javascript
  // A simple hand-drawn balloon with a small tie and a wavy string.
  balloon: {
    d:
      `${ellipsePath(50, 40, 30, 36)} ` +
      "M 50 76 L 44 84 L 56 84 Z " +
      "M 50 84 Q 40 90 50 98",
    stroke: true,
  },
```

### balloon

**Description:** A classic oval-shaped balloon with a small, pointed tie at the bottom and a gently curving string trailing downwards.
**Suggested Category:** party/celebration

```javascript
  // A whimsical five-petal flower with a circular center.
  flower: {
    d:
      `${ellipsePath(50, 50, 10, 10)} ` +
      `${ellipsePath(50, 25, 12, 15)} ` +
      `${ellipsePath(74, 42, 15, 12)} ` +
      `${ellipsePath(65, 70, 12, 15)} ` +
      `${ellipsePath(35, 70, 12, 15)} ` +
      `${ellipsePath(26, 42, 15, 12)}`,
    stroke: true,
  },
```

### flower

**Description:** A simple, stylized flower with five rounded petals arranged around a small circular center.
**Suggested Category:** nature

```javascript
  // A festive conical party hat with a decorative wavy base and a pom-pom.
  "party-hat": {
    d:
      "M 50 10 L 20 85 L 80 85 Z " +
      `${wavePath(20, 85, 60, 4, 8)} ` +
      `${ellipsePath(50, 10, 6, 6)}`,
    stroke: true,
  },
```

### party-hat

**Description:** A tall, conical party hat with a wavy brim at the base and a small, fluffy pom-pom at the very top.
**Suggested Category:** party/celebration

```javascript
  // A sketched gift box with a ribbon and a simple bow on top.
  "gift-box": {
    d:
      `${roundedRectPath({ x: 25, y: 40, w: 50, h: 50 }, 4)} ` +
      "M 50 40 L 50 90 M 25 65 L 75 65 " +
      "M 50 40 Q 35 25 50 25 Q 65 25 50 40",
    stroke: true,
  },
```

### gift-box

**Description:** A square gift box with a vertical and horizontal ribbon tied around it, topped with a simple, rounded bow.
**Suggested Category:** party/celebration

```javascript
  // A four-pointed hand-drawn sparkle mark for highlights.
  sparkle: {
    d:
      `${sparklePath(50, 50, 45, 12)}`,
    stroke: true,
  },
```

### sparkle

**Description:** A four-pointed starburst shape, indicating a shimmering or twinkling effect.
**Suggested Category:** party/celebration, kawaii/cute


## References

[1]: https://www.opendoodles.com/about "Open Doodles - About"
[2]: https://undraw.co/license "License | unDraw"
[3]: https://www.svgrepo.com/page/licensing/ "Licensing - SVG Repo"
[4]: https://thenounproject.com/legal/terms-of-use/ "Legal | Noun Project"
[5]: /home/ubuntu/upload/search_images/Gp25hIu5ppUm.jpg "Congratulation party vertical poster with bunting, hats, confetti. Festive vintage greeting card design with blank copy space. hand drawn illustration for print or web banner, cards, invitation 77742921 Vector Art at Vecteezy"
[6]: /home/ubuntu/upload/search_images/klXArj5sG0MR.jpg "Happy Birthday Bunting: Over 25,877 Royalty-Free Licensable Stock Illustrations & Drawings | Shutterstock"
[7]: /home/ubuntu/upload/search_images/fbSj9awEV2Xl.jpg "Music Festival Hand Drawn Banner Templates"
[8]: /home/ubuntu/upload/search_images/UUAeGkBBepcO.jpg "Hand drawn music festival banners 16088076 Vector Art at Vecteezy"
