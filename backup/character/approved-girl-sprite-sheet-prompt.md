# Approved girl sprite sheet — draft prompt

Reference: `character-smart-version-turnaround.png` for identity and outfit; the original idle, run, jump, and fall sheets in `assets/_originals/character/` for action poses.

```text
Create a 2D game sprite sheet using the approved turnaround as the exact character identity and outfit, and the four original pose sheets only for action language and timing. Young Chinese girl with two dark brown braids and muted brick-red bows, freckles, warm brown eyes, cream short-sleeve blouse with a small teal frog closure, muted blue-green loose shorts with tied waist, barefoot. Keep a hand-drawn French children's animation look: thin expressive ink outlines, matte painted colors and subtle pencil texture; no glossy rendering, photorealism or 3D.

One transparent PNG, uniform 8 columns × 4 rows, target 1536 × 896 pixels, each cell 192 × 224. No gutters, borders, guides, dividers, labels or background. Character contained in each cell, consistent scale and baseline, facing screen-right.

Row 1: 8-frame subtle idle breathing cycle. Row 2: 8-frame run cycle with alternating legs and arms and moving braids. Row 3: 4-frame jump takeoff/rise/apex/landing in columns 1–4; columns 5–8 transparent. Row 4: 4-frame fall/recovery sequence in columns 1–4; columns 5–8 transparent. Clean silhouette, no stray marks or colored fringe. Maintain consistent character proportions.
```

Export note: the source draft's idle row has 8 poses; the standalone `meimei` idle strip samples every other pose to match the original 4-frame idle asset. Final strips use 96×112 per frame: idle 4f, run 8f, jump 4f, fall 4f.

Status: exploratory draft. The image generator produced the requested pose rows and transparent background, but added conspicuous red/yellow edge artifacts. The exported strips remove low-alpha guide noise and are re-cropped to keep complete silhouettes. Review at game scale before shipping.
