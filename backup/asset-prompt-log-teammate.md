# 试验资产与生成提示词｜backup 分支

本文件记录截至 2026-09-30 已放入 `backup` 的 **19 张生成试验稿**：人物 15 张、场景 4 张。提示词从当时的 imagegen 调用记录提取，保留英文原文；有些稿件被用户否定，仍作为过程备份。**备份不代表资产已获最终确认或可直接用于游戏。**

目录：`character/` 人物试验稿；`scene/` 场景试验稿；`element/` 预留独立元素资产。既有 `assets/references/village-art-reference.jpg` 是用户提供的参考图，不是生成资产，因此没有生成提示词。

| 序号 | 资产 | 内容与状态 | 输入参考图 | 背景参数 |
| --- | --- | --- | --- | --- |
| 01 | [character/niannian-model-sheet-v1.png](character/niannian-model-sheet-v1.png) | 初版：三视图年龄感探索 | 无 | true |
| 02 | [scene/island-opening-concept-v1.png](scene/island-opening-concept-v1.png) | 最初海滩近景；度假感过强 | niannian-model-sheet-v1.png | false |
| 03 | [character/niannian-model-sheet-v2.png](character/niannian-model-sheet-v2.png) | 双麻花辫、夏装、赤脚 | niannian-model-sheet-v1.png | true |
| 04 | [scene/island-village-diagonal-concept-v1.png](scene/island-village-diagonal-concept-v1.png) | 海湾斜向构图；未采用的中途稿 | niannian-model-sheet-v2.png | false |
| 05 | [character/niannian-model-sheet-v3.png](character/niannian-model-sheet-v3.png) | 去除单颗痣、保留晒红脸颊 | niannian-model-sheet-v2.png | true |
| 06 | [scene/island-fishing-village-frontal-a-v1.png](scene/island-fishing-village-frontal-a-v1.png) | 正面海景 A；渔村在右侧 | niannian-model-sheet-v3.png | false |
| 07 | [scene/island-fishing-village-frontal-b-v1.png](scene/island-fishing-village-frontal-b-v1.png) | 正面海景 B；渔村横贯远景 | niannian-model-sheet-v3.png | false |
| 08 | [character/niannian-concept-a-fish-pouch-v1.png](character/niannian-concept-a-fish-pouch-v1.png) | 辨识度探索 A：小鱼布袋 | niannian-model-sheet-v3.png | true |
| 09 | [character/niannian-concept-b-sea-scarf-v1.png](character/niannian-concept-b-sea-scarf-v1.png) | 辨识度探索 B：海风围巾 | niannian-model-sheet-v3.png | true |
| 10 | [character/niannian-model-sheet-v4a-soft-freckles.png](character/niannian-model-sheet-v4a-soft-freckles.png) | 浅雀斑中途稿；未交付版本 | niannian-model-sheet-v3.png | true |
| 11 | [character/niannian-model-sheet-v4-freckles.png](character/niannian-model-sheet-v4-freckles.png) | 加强雀斑 | niannian-model-sheet-v4a-soft-freckles.png | true |
| 12 | [character/niannian-model-sheet-v5-nose.png](character/niannian-model-sheet-v5-nose.png) | 补清正面鼻子 | niannian-model-sheet-v4-freckles.png | true |
| 13 | [character/niannian-model-sheet-v6-brown-eyes.png](character/niannian-model-sheet-v6-brown-eyes.png) | 棕色瞳孔 | niannian-model-sheet-v5-nose.png | true |
| 14 | [character/niannian-model-sheet-v7-wavy-hair.png](character/niannian-model-sheet-v7-wavy-hair.png) | 保留辫子的微卷碎发 | niannian-model-sheet-v6-brown-eyes.png | true |
| 15 | [character/niannian-model-sheet-v8-curly-hair.png](character/niannian-model-sheet-v8-curly-hair.png) | 满头紧卷探索；用户否定 | niannian-model-sheet-v7-wavy-hair.png | true |
| 16 | [character/niannian-model-sheet-v9-soft-wavy-bob.png](character/niannian-model-sheet-v9-soft-wavy-bob.png) | 最新波浪卷短发探索 | niannian-model-sheet-v6-brown-eyes.png | true |
| 17 | [character/character-smart-version-front.png](character/character-smart-version-front.png) | 古灵精怪版，直视镜头的正面全身稿 | niannian-mischievous-turnaround-v2.png | false |
| 18 | [character/character-smart-version-actions.png](character/character-smart-version-actions.png) | 同版跑、跳、低姿落地、蹦跳四动作 | character-smart-version-front.png；niannian-mischievous-turnaround-v2.png；用户提供的动作截图 | false |
| 19 | [character/character-smart-version-turnaround.png](character/character-smart-version-turnaround.png) | 基于正面稿的正面、右侧面、背面资产图 | character-smart-version-front.png；niannian-mischievous-turnaround-v2.png | false |

## 逐图原始提示词

### 01 · `character/niannian-model-sheet-v1.png`

内容：初版：三视图年龄感探索。

输入参考图：无。背景参数：`transparent_background=true`。

```text
Use case: stylized-concept. Asset type: original 2D game character model sheet for a side-scrolling narrative game, clean production reference. Create an ORIGINAL little girl named Nian Nian (年年), about 7 years old, with an expressive childlike silhouette, unmistakably distinct from any existing game or animation character. She has a soft oval face, small curious eyes, a tiny freckle near one cheek, dark chestnut hair in a short low side ponytail tied with a muted terracotta ribbon, wispy uneven bangs. Outfit: pale cream collared blouse, slightly oversized muted teal-blue pinafore with two practical front pockets, warm rust-colored socks and simple brown lace-up shoes. A tiny stitched leaf motif on one pocket becomes her subtle recurring visual mark. Present three consistent full-body orthographic views on one canvas: front, side facing right, back, evenly spaced, same height and outfit, neutral standing pose, no props. Hand-drawn animation concept art: lively imperfect dark brown pencil outlines, restrained watercolor/gouache texture, readable flat shapes with slight paper grain; blend the intimate, textured European countryside cartoon feeling and luminous blue-green nature palette of nostalgic Japanese rural animation, without recreating any particular frame, character, or copyrighted design. Cool teal cloth and shadows balanced by warm skin and ribbon. White or transparent studio background, no ground plane, no scenery. Clean edges suitable as a modeling/rigging reference. No title, text, labels, watermarks, extra characters, cut-off feet, duplicated limbs, or perspective distortion.
```

### 02 · `scene/island-opening-concept-v1.png`

内容：最初海滩近景；度假感过强。

输入参考图：niannian-model-sheet-v1.png。背景参数：`transparent_background=false`。

```text
Use case: illustration-story. Asset type: first-scene full-width game environment concept art for a narrative exploration game; exploratory mood image, not a UI screenshot. Create an ORIGINAL sunlit tropical island scene where the little girl Nian Nian plays at the shoreline. The provided image is the supporting CHARACTER REFERENCE only: preserve her age, face, dark chestnut low side ponytail with terracotta ribbon, cream blouse, muted teal-blue pinafore, rust socks and brown shoes, but draw her small within the scene and naturally in motion, perhaps running toward the sparkling shallows. Do not copy the reference layout or make a turnaround sheet. Scene: generous saturated-but-soft blue sky with puffy warm white clouds, a cluster of lush green coconut palms leaning toward a curved pale-gold sandy beach, clear turquoise-blue seawater with dancing golden sunlight glints, gentle foam, distant soft blue-green island forms. Wide side-scrolling composition with a readable walkable beach plane in the foreground and clear space around the girl; layered near, middle and distant depth, foreground tree shade for contrast. Visual language: hand-drawn uneven dark-brown outlines, painterly watercolor/gouache texture and lightly weathered paper feel, warm European countryside cartoon intimacy combined with luminous cool blue-green rural-animation color relationships, but wholly original design. Sunny, breezy, playful and slightly nostalgic. Keep the girl clearly visible without dominating the landscape. No text, UI, logo, watermark, other people, boats, buildings, giant objects, or exact recreation of any known animation frame. Complete feet and natural anatomy.
```

### 03 · `character/niannian-model-sheet-v2.png`

内容：双麻花辫、夏装、赤脚。

输入参考图：niannian-model-sheet-v1.png。背景参数：`transparent_background=true`。

```text
Use case: stylized-concept. Asset type: revised ORIGINAL 2D game protagonist character design sheet, version 2. This is a deliberate redesign of the girl's previous sheet (input image is character identity/reference, not a layout to copy). Nian Nian is an approximately 7-year-old Chinese girl, joyful and curious. REPLACE previous low side ponytail with TWO short-to-medium dark brown braided pigtails (two true three-strand braids), one on each side, tied near the braid ends with small handmade Chinese-style fabric bows in faded red; bows are simple cloth, not ornate cosplay ornaments. Remove the cheek freckle/beauty mark entirely. Both cheeks distinctly rosy and sun-flushed, warm coral red but still natural. New summer clothes: light off-white short-sleeve cotton top with a modest Chinese-inspired crossover neckline or cloth knot detail, loose sea-green summer shorts, simple practical silhouette; BARE FEET with visible toes. No pinafore, no long sleeves, no socks, no shoes. Preserve age and approachable childlike proportions but make the design visibly original and culturally grounded. Present front, clean side facing right, and back full-body views, equal scale, neutral pose, on a truly transparent background. Hand-drawn imperfect ink/pencil contours, delicate gouache/watercolor color fill, gentle paper-like texture, warm nostalgia with luminous blue-green fabric accents; clear design and aligned feet for game asset planning. No scenery, no text, no watermark, no extra character, no duplicated limbs. Ensure braids, bows, blush, barefoot anatomy, and clothing are consistent across all three views.
```

### 04 · `scene/island-village-diagonal-concept-v1.png`

内容：海湾斜向构图；未采用的中途稿。

输入参考图：niannian-model-sheet-v2.png。背景参数：`transparent_background=false`。

```text
Use case: illustration-story. Asset type: ORIGINAL opening island scene concept A, wide cinematic VERY LONG SHOT for a 2D narrative exploration game. Input image is supporting character reference ONLY: Nian Nian is a tiny 7-year-old Chinese girl in a cream short-sleeved crossover top, loose sea-green shorts, barefoot, twin braided pigtails tied with faded red fabric bows and sun-reddened cheeks. Place her very small in the scene, joyfully running barefoot along the sandy waterline, approximately 4% of image height. Main subject is a LIVED-IN island home environment, not a vacation resort. Camera from a modest elevated viewpoint on a sandy path looking across a sweeping crescent beach, sparkling turquoise sea, pale blue-green hills and a small cluster of modest island village houses with tiled roofs set behind the beach; a few fishing nets drying, small wooden fishing boats pulled onto sand, a bicycle, laundry lines, a few distant villagers working or strolling. Keep ordinary details subtle and believable, no tourist facilities. BLUE BLUE OPEN SKY occupies broad upper area; white clouds, clean bright sunlight glimmering in broken bands on seawater. Coconut palms are present as small clusters at edges and behind houses, with no giant close trunk or huge fronds blocking composition. Strong elegant composition: curved shoreline forms a leading line from lower left into middle distance toward the village, small child readable against open pale sand, breathing room across sea and sky. Hand-drawn storybook animation visual: uneven dark-brown linework, delicate watercolor/gouache texture, warm natural light, layered cool blue-green shadows, luminous greens and sand, distinctive original designs. Avoid photorealism, hyper-detailed fantasy cliffs, an empty deserted island, tropical resort, giant central palm tree, copied film frames, text, watermark, UI. 16:9-feeling wide landscape.
```

### 05 · `character/niannian-model-sheet-v3.png`

内容：去除单颗痣、保留晒红脸颊。

输入参考图：niannian-model-sheet-v2.png。背景参数：`transparent_background=true`。

```text
Use case: precise-object-edit. Edit the provided three-view character design sheet. CRITICAL targeted correction: remove EVERY dark dot, freckle, beauty mark, mole, spot, or punctuation-like mark from her entire face in ALL views, particularly any mark on the cheek and nose. Her face must have clean, unspotted skin. Keep instead large soft diffuse sun-flushed red blush patches on BOTH cheeks, with no isolated dark specks. Preserve the girl's two braided pigtails with faded red Chinese fabric bows, cream short-sleeved crossover cotton shirt, loose teal summer shorts, bare feet, proportions, three equal full-body front/side/back views, watercolor pencil rendering, and transparency. Do not add any facial dots. No text or extra elements.
```

### 06 · `scene/island-fishing-village-frontal-a-v1.png`

内容：正面海景 A；渔村在右侧。

输入参考图：niannian-model-sheet-v3.png。背景参数：`transparent_background=false`。

```text
Use case: illustration-story. Asset type: ORIGINAL 2D game opening scene concept, wide landscape, VARIANT A. Supporting character reference image: the revised 7-year-old Chinese girl Nian Nian has twin braided pigtails with faded red cloth bows, clean face with NO beauty mark, large warm sun-flushed cheeks, cream short-sleeve Chinese-inspired summer cotton top, sea-green shorts, BARE FEET. Camera composition is NONNEGOTIABLE: straight-on FRONTAL view looking directly out to sea from the beach; horizontal stacked depth bands, foreground sandy beach across the full width of the bottom third, middle-ground sun-sparkling turquoise seawater across the full width, background small staggered islands and a visible humble Chinese fishing village across the water, with tiled-roof homes, a modest landing pier, fishing boats and net-drying racks. Horizontally level horizon; NO diagonal cove shoreline, no side-looking sweeping beach, no giant cliff or giant tree. Nian Nian is a SMALL full-body figure (5% picture height) barefoot happily running ACROSS the foreground sand, braids bouncing; a few tiny distant villagers working near nets and small boats establish daily life, not tourism. Small green coconut palms near the distant village and a modest edge of beach only, never a dominant foreground object. Deep blue sky and soft clouds in top third, sunlight glittering on seawater, warm pale sand, layered blue-green islands, hand-drawn irregular dark brown lines and soft gouache/watercolor texturing, nostalgic animated storybook atmosphere. Architecture and lived-in details should feel like an everyday Chinese coastal fishing village, not a tropical resort or Mediterranean village. No text, labels, UI, watermark, close-up character, extra large characters, or copied film composition.
```

### 07 · `scene/island-fishing-village-frontal-b-v1.png`

内容：正面海景 B；渔村横贯远景。

输入参考图：niannian-model-sheet-v3.png。背景参数：`transparent_background=false`。

```text
Use case: illustration-story. Asset type: ORIGINAL opening island scene concept VARIANT B for a 2D narrative game; alternative composition to compare with an open-sea version. Use supplied revised character design only to keep Nian Nian consistent: Chinese girl about 7, TWO braided pigtails with faded red bows, rosy sun-flushed cheeks and NO freckle/mole/beauty mark, cream short-sleeve summer top, loose sea-green shorts, BARE FEET. Camera is a wide distant STRAIGHT-ON FRONTAL view from a broad flat beach looking directly across the sea: foreground beach occupies bottom 35%, horizontal shallow surf band at roughly one third height, sparkling blue-green SEA occupies middle third, and BEHIND THE SEA a chain of layered little green islands with a CLEARLY VISIBLE fishing village of modest Chinese coastal houses, a small dock, many tiny fishing boats, net poles and lived-in rooflines across the background. Blue summer sky and clouds above, level horizon, no cove or beach curving away sideways, no oblique/diagonal coastline. For a more intimate inhabited feel, a few fishing baskets and nets arranged low near the edges of the foreground and two small villagers farther back, with a couple of modest coconut trees integrated into the far village silhouette. Nian Nian is VERY SMALL, under 6% picture height, off center in the lower foreground, running happily barefoot across sand toward a small incoming wave. Composition prioritizes spacious horizontal bands, island-village silhouette and everyday fishing life, not a resort panorama. Luminous sun glitter on water, soft cream sand, lively blue sky, blue-green distant terrain; textured gouache/watercolor animation illustration with irregular dark brown hand-drawn lines, intimate nostalgic mood, original architecture. No giant palms, towering cliffs, tourism objects, text, watermark, UI, close-up character, or copied movie still.
```

### 08 · `character/niannian-concept-a-fish-pouch-v1.png`

内容：辨识度探索 A：小鱼布袋。

输入参考图：niannian-model-sheet-v3.png。背景参数：`transparent_background=true`。

```text
Use case: stylized-concept. Asset type: ORIGINAL protagonist character design exploration A, full-body FRONT + SIDE + BACK turnaround on one canvas for a 2D narrative game. Input is an earlier draft of Nian Nian; redesign her to become iconic and instantly identifiable at small game sprite size. She is a joyful Chinese fishing-village girl around 7 years old. Core silhouette: TWO short braids that flare outward in the sea breeze, the LEFT braid visibly a little shorter than the right; each end tied with a substantial handmade faded-coral cloth bow with short ribbon tails, distinctly Chinese everyday fabric craft rather than ornate cosplay. Her hair has a little wind-swept cowlick. Face: deeply sun-flushed rosy cheeks and a LIGHT CONSTELLATION OF MANY TINY SOFT BROWN FRECKLES scattered evenly across the bridge of nose and both upper cheeks, natural sun freckles; NO single large beauty mark, NO isolated dark mole. Clothing: airy ivory short-sleeve cotton crossover top with one sea-green Chinese frog knot; loose muted sea-teal shorts with one small visible ochre mended fabric patch, practical for playing barefoot on a fishing island. Signature motif: a small handmade fish-shaped cloth pouch in faded warm coral attached at the waist, sized to read as a simple triangular fish silhouette; it should feel like a treasured everyday object and recur in future life stages. Bare feet. Color blocking prioritized: ivory top, sea-teal shorts, coral bows/pouch, dark hair. Charming imperfect dark brown hand-drawn animation lines, gouache-watercolor texture, luminous blue-green palette with warm red accents, joyful expressive face. Clean consistent front, right profile, back full-body views, same character proportions and clothing in all three. Truly transparent background; no shadow vignette, title, text, labels, UI, scene, extra characters, extra limbs, footwear, or watermark. Avoid resemblance to any known character.
```

### 09 · `character/niannian-concept-b-sea-scarf-v1.png`

内容：辨识度探索 B：海风围巾。

输入参考图：niannian-model-sheet-v3.png。背景参数：`transparent_background=true`。

```text
Use case: stylized-concept. Asset type: ORIGINAL protagonist character design exploration B, visually DIFFERENT alternative to a fish-pouch-and-shorts design, shown as consistent full-body FRONT + RIGHT SIDE + BACK views on one clean transparent canvas. Nian Nian: joyful approximately 7-year-old Chinese girl from a lived-in coastal fishing village, barefoot in summer. Preserve key identity only: two true dark braided pigtails, clearly sun-reddened cheeks, multiple tiny lightly scattered natural freckles across bridge of nose and both cheeks (NO single beauty mark/mole). Make a bold and readable animated-game silhouette: one braid tied higher and shorter with a generous red cloth butterfly bow, the other slightly longer with a simple small red tie; a breezy triangular sea-blue neck scarf with short tails blows to her left and becomes her memorable hero shape. Outfit is a light cream sleeveless cotton summer tunic with modest Chinese frog-button fastening, loose faded indigo knee shorts rolled unevenly, narrow warm-red waistband; one small stitched wave motif on the tunic hem. She feels mischievous, energetic, a little sun-worn and expressive. Distinctive simple blocks: dark hair, red bow and scarf accent, cream tunic, indigo shorts; avoid ornate costume, uniforms, sailor outfit, dress, fish-shaped pouch, jewelry, shoes. Hand-drawn dark-brown lively linework with gouache/watercolor texture; natural blue-green and warm coral palette; original animation design suitable for small readable game sprite. Three equal-size straight views with aligned feet and identical outfit details; no backdrop/vignette, no titles, no text, no watermark, no extra characters, no duplicated body parts. This is a fresh alternative concept rather than a near-duplicate of the input reference.
```

### 10 · `character/niannian-model-sheet-v4a-soft-freckles.png`

内容：浅雀斑中途稿；未交付版本。

输入参考图：niannian-model-sheet-v3.png。背景参数：`transparent_background=true`。

```text
Use case: precise-object-edit. The provided image is the EDIT TARGET: a three-view full-body turnaround of Nian Nian. Make a restrained revision of THIS EXACT DESIGN, not a redesign. Preserve the identical girl, gentle CLOSED-MOUTH smile, small natural eyes, facial expression, face shape, twin braids, placement and size of faded terracotta hair bows, wispy fringe, cream short-sleeved crossover blouse and its little green knot, muted sea-green loose shorts with drawstring, bare feet, proportions, poses, view arrangement, scale, and transparent background. Do NOT change the clothing, hair silhouette, accessories, or pose. Add clearly visible but delicate SUN FRECKLES: an even constellation of about 8-12 small warm-brown freckles across the bridge of her nose and each rosy cheek in the front view, with a few naturally visible on the near cheek in side view. They should read distinctly at normal zoom, yet be many small freckles, NEVER one isolated mole or beauty mark. Preserve the present softly sunburned cheeks and the exact closed-mouth smile. Lower saturation to match the original provided image; no brighter colors or stronger contrast. Refine only drawing language toward the warm hand-drawn French countryside animation feeling: slightly uneven expressive ink/pencil outer line, restrained flat gouache fills, fewer airbrushed gradients and glossy anime highlights, light handmade paper texture, simplified shape edges. No text, graphic design, watermark, new props, added motifs, fish pouch, scarf, asymmetrical bows, open-mouth grin, or extra people. This must remain recognizably the same approved-in-progress model sheet with a subtle style pass and freckles.
```

### 11 · `character/niannian-model-sheet-v4-freckles.png`

内容：加强雀斑。

输入参考图：niannian-model-sheet-v4a-soft-freckles.png。背景参数：`transparent_background=true`。

```text
Use case: precise-object-edit. This is the exact Nian Nian three-view sheet to preserve. Make ONLY this subtle correction: freckles must be MORE VISIBLE at normal viewing size. Add 12-18 distinct tiny muted medium-brown sun-freckle dots across her nose bridge and both upper rosy cheeks in the FRONT view, irregular but balanced, plus 4-6 dots on the visible cheek in RIGHT PROFILE. Each should remain a little pencil speck, not a large single mole. Keep the exact same CLOSED-MOUTH slight smile, face shape, eye size, hairstyle, twin braids, two coral bows, outfit, colors, bare feet, proportions, poses, and placement. Preserve low saturation. Also slightly simplify the paint into flatter hand-applied gouache areas and strengthen a few uneven brown contour strokes to make the overall image feel more like classic hand-drawn European countryside television animation, WITHOUT increasing contrast or changing the character design. No new accessories, patches, scarf, bags, backdrop, text, watermark, or dark vignetting. Transparent background. The result should look like the same original image with clearly visible freckles, not a new design.
```

### 12 · `character/niannian-model-sheet-v5-nose.png`

内容：补清正面鼻子。

输入参考图：niannian-model-sheet-v4-freckles.png。背景参数：`transparent_background=true`。

```text
Use case: precise-object-edit. Edit the provided three-view Nian Nian character sheet with ONE focused correction. In the FRONT VIEW ONLY, draw a clearly visible small childlike nose centered between the eyes and above the closed-mouth smile: a soft warm-brown curved nose-tip mark plus a subtle short nostril/alar line and gentle warm shadow, legible at normal image size. It should look naturally hand-drawn, not a separate dot, not a mole, not a large adult nose. Keep the existing multiple small freckles across nose bridge and both rosy cheeks EXACTLY as they are in density and placement; they are approved. Preserve her exact gentle CLOSED-MOUTH smile, all facial proportions, eye shape, twin braids, bows, cream crossover summer top, muted teal shorts, bare feet, front/side/back poses, scale, low-saturation colors, paper-gouache linework, and transparent background. Preserve side-view nose profile as it is. No other changes, no extra accessories, text, logos, or background.
```

### 13 · `character/niannian-model-sheet-v6-brown-eyes.png`

内容：棕色瞳孔。

输入参考图：niannian-model-sheet-v5-nose.png。背景参数：`transparent_background=true`。

```text
Use case: precise-object-edit. Edit the supplied existing three-view Nian Nian character model sheet. Primary and ONLY design change: change the irises/pupils in FRONT and RIGHT SIDE views to a clearly readable natural warm chestnut BROWN, medium brown rather than black, with a tiny restrained highlight. Preserve absolutely everything else: identical closed-mouth smile, newly visible small nose, approved sun freckles, rosy cheeks, face geometry, hairstyle and twin braids, coral bows, cream Chinese-inspired summer shirt, muted sea-green shorts, bare feet, hand-drawn muted palette, three-view layout and all proportions. Technical cleanup: the asset should have a truly clean transparent alpha background and crisp hand-drawn silhouette; remove soft gray/brown blurry halos, haze, smudged patches, ghost pixels and vignette around the braids, bows, hair, shoulders, arms and feet. Hair strands should end in deliberate linework, with no foggy transparent cloud around the character. No other redesign, no added object, no text, no backdrop or cast shadow. Keep color saturation low.
```

### 14 · `character/niannian-model-sheet-v7-wavy-hair.png`

内容：保留辫子的微卷碎发。

输入参考图：niannian-model-sheet-v6-brown-eyes.png。背景参数：`transparent_background=true`。

```text
Use case: precise-object-edit. Edit the supplied exact three-view Nian Nian character sheet. LOCK the existing illustration style, brush texture, line weight, low-saturation colors, lighting, poses, all facial features, warm brown irises, freckles, visible nose, closed-mouth smile, rosy cheeks, cream top, muted blue-green shorts, bare feet, and layout. The ONLY artistic change is HAIR SHAPE/TEXTURE: make her dark brown hair slightly more tousled with a natural loose-wave / subtle natural-curl feeling. Add a few intentional gently curved flyaway locks around the crown, bangs, temple and nape; make the twin braided pigtails a bit less perfectly even, with subtle wavy wisps escaping between braid segments. Keep TWO unmistakable true braids of the same overall length and same positions, and keep both faded terracotta bows unchanged. This should feel like a breezy child who has been playing by the sea, NOT a new hairstyle and NOT tight ringlets or frizzy hair. Preserve overall silhouette and face visibility. Do not shift hues, saturation, costume, backdrop, skin tone or expression. Transparent background. Avoid new accessories, text, watermark, blurred ghost strands, gray halo or fuzzy smears; render each new curl as clean deliberate linework with crisp alpha edges.
```

### 15 · `character/niannian-model-sheet-v8-curly-hair.png`

内容：满头紧卷探索；用户否定。

输入参考图：niannian-model-sheet-v7-wavy-hair.png。背景参数：`transparent_background=true`。

```text
Use case: precise-object-edit. Edit the supplied three-view Nian Nian character sheet. Replace HAIR STYLE ONLY. Remove both braided pigtails COMPLETELY and remove both red hair bows and any ties. Give her a full head of naturally very curly dark chestnut hair, voluminous playful 'explosion head' silhouette: springy irregular ringlets and curls expand around the crown and sides, a lively rounded but asymmetrical airy shape, stray curls bouncing free near forehead, ears and nape, shoulder-length at most. It should feel like an energetic, fearless, breezy little Chinese girl who runs everywhere, not an adult salon afro or a wig. Show this exact new hair consistently in front, right profile, and back views, with deliberate crisp curly contour, no pigtails, no braids, no bows. LOCK everything else: exact face geometry, gentle CLOSED-MOUTH smile, visible nose, approved freckles and rosy cheeks, warm brown eyes, cream short-sleeved crossover top and small green cloth knot, muted sea-green loose shorts and drawstring, bare feet, proportions, three-view layout, low-saturation palette, hand-drawn textured gouache/pencil animation rendering. Do not add accessories, clothing changes, new colors, stronger saturation, text, watermark, extra characters, background scenery, or a glowing blurry halo around the curls. Transparent background.
```

### 16 · `character/niannian-model-sheet-v9-soft-wavy-bob.png`

内容：最新波浪卷短发探索。

输入参考图：niannian-model-sheet-v6-brown-eyes.png。背景参数：`transparent_background=true`。

```text
Use case: precise-object-edit. Use the supplied three-view Nian Nian sheet as the ONLY visual edit target (it is the pre-experiment reference with braids). Replace ONLY hairstyle. REMOVE both braids, hair bows, and tied sections entirely. Give her a BEAUTIFUL soft naturally WAVY dark-chestnut SHORT BOB, reaching around jaw to upper neck, with broad loose S-shaped waves organized into several coherent soft hair masses, gentle volume at crown, a slightly tousled airy fringe and just a few fine flyaways. The silhouette should look youthful, attractive, free-spirited, breezy and energetic, as if she plays by the sea; rounded and asymmetrical enough to be memorable but controlled and tasteful. Essential negative constraints: NO tight corkscrew ringlets, NO separate rope-like tendrils, NO worm/noodle strands, NO afro cloud, NO dreadlocks, NO pigtails, NO bows. Hair texture can be suggested by flowing pencil strokes inside large wavy clumps, not individually rendered tubular curls. Show same haircut consistently in front, right profile and back. LOCK all other design: exact gentle CLOSED-MOUTH smile, warm brown eyes, visible small nose, approved freckles, rosy cheeks, face shape and age, cream short-sleeve crossover summer shirt, small green knot, muted sea-green drawstring shorts, bare feet, poses and three-view alignment. LOCK the existing low-saturation colors and textured hand-drawn gouache/pencil animation style; do not make it more glossy or more saturated. Transparent background, no text, new objects or other redesign.
```

### 17 · `character/character-smart-version-front.png`

内容：古灵精怪版，直视镜头的正面全身稿。

输入参考图：本地 `niannian-mischievous-turnaround-v2.png`。背景参数：`transparent_background=false`。

```text
Create one single full-body illustration of the EXACT same little girl from the attached latest three-view sheet, standing and looking DIRECTLY STRAIGHT AT THE VIEWER. True frontal head and body: both eyes face camera, centered nose and mouth, symmetrical ears and shoulders; absolutely no three-quarter angle or sideways glance. Preserve her cheeky, clever, slightly mischievous personality through subtly raised brows and small knowing closed-mouth smile. Preserve all established design details: seven-year-old Chinese island girl, warm brown messy loose hair in TWO substantial outward-swinging three-strand braids with muted dusty red bows, fine flyaways, simple brown eyes, small clearly drawn nose, many distinct tiny freckles across nose and both sun-reddened cheeks. Loose warm ivory short-sleeved summer shirt with ONLY one tiny dusty teal Chinese knot at neckline, muted faded blue-green drawstring shorts, bare feet. She stands relaxed with feet apart and hands down or one lightly on her hip, fully visible from hair to toes, generous clean space around figure. Faithfully match reference's fine brown storybook linework, restrained warm watercolor/gouache on cream paper, matte soft low-saturation colors, crisp details. Do not add scenery, text, props, shoes, jewelry, more characters, extra poses, or cast shadows that obscure anatomy. Distinct, attractive and clean reference-quality character design.
```

### 18 · `character/character-smart-version-actions.png`

内容：跑、跳、低姿落地、蹦跳四动作。

输入参考图：`character-smart-version-front.png`、本地 `niannian-mischievous-turnaround-v2.png`、用户提供的动作截图。背景参数：`transparent_background=false`。

```text
Make a clean WIDE HORIZONTAL 4-pose character action reference sheet, ALL FOUR full-body poses of the SAME little girl from the attached frontal character image and turnaround, consistent face, freckles, braids, costume, palette, age and body proportions. Place four separated poses left to right with generous spacing and no touching or overlaps: 1) dashing barefoot at full speed with a playful side glance, one knee up and braids flying; 2) a joyful high leap with arms wide and bent legs, impish grin; 3) low springy crouch/landing with one palm braced on the sand like the supplied playful personality reference; 4) skipping or hopping forward with cheeky triumphant energy. Every pose must be dynamic and clearly distinct; preserve expressive brow and knowing mischievous smile without changing her identity. Warm brown tousled hair in TWO small true braids tied with muted dusty-red bows; distinct nose freckles and red sun-kissed cheeks; tiny drawn nose; soft ivory loose short-sleeve shirt with ONE tiny dusty teal Chinese-knot closure; faded blue-green drawstring shorts; bare feet. Same exact hand-painted watercolor/gouache storybook style, fine warm brown lines, matte muted colors, lightly textured cream paper background. No text, frames, other characters, scenery or extra accessories. Full figures including both bare feet and all hair inside the canvas, coherent limbs and fingers, crisp clear silhouettes without blur. This is exploratory character motion art, not animation sprites.
```

### 19 · `character/character-smart-version-turnaround.png`

内容：基于正面稿的正面、右侧面、背面资产图。

输入参考图：`character-smart-version-front.png`、本地 `niannian-mischievous-turnaround-v2.png`。背景参数：`transparent_background=false`。

```text
Produce a polished production-oriented three-view full-body character turnaround sheet BASED ON THE PROVIDED APPROVED FRONTAL IMAGE (first reference) as the definitive design. Three equal-height separate figures arranged LEFT to RIGHT: exact TRUE FRONT view looking directly at viewer with both eyes centered, exact right-facing 90-degree SIDE view, exact BACK view. The first front view must reproduce her established face and body closely: impish knowing closed-mouth smile, both brown eyes looking straight at camera, clearly drawn small centered nose, tiny distinct freckles across nose and both red sun-kissed cheeks, messy warm brown flyaway hair with TWO chunky three-strand braided pigtails tied in dusty faded red bows. Slight hand-on-hip personality stance is okay but keep full silhouette clear and back/side anatomy readable. Same seven-year-old Chinese island child in warm ivory loose short-sleeved top with ONE small dusty teal cloth knot at neckline, muted faded blue-green drawstring shorts, entirely barefoot. Side and back are accurate rotations of this exact front design, same scale, hair length, garment seams and color, not different children. Cream lightly textured paper background, fine lively brown lines, matte restrained watercolor/gouache style identical to references, no increase in saturation. Plenty of white space between views, all heads and bare feet fully in frame, coherent five-finger hands and foot anatomy. No text, labels, frames, props, scenery, extra figures, extra limbs, blur or artifacts.
```
