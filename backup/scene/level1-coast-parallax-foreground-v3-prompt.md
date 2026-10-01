# 第一关海边近景视差层 v3

参考图 1 是当前海边全景构图与色彩，参考图 2 是动画手绘线条语言，参考图 3 只用于笔触概括程度。透明近景层以分离的边角形状为主，不能盖住中间的可走路线。

```text
Edit reference image 1 into a foreground overlay that does NOT cover the walking lane. Keep its hand-drawn rocks, dark blue-green plants, reeds and warm stone colors, and match their scale and line weight to reference image 2. Use reference image 3 only for loose hand-drawn animation line quality. Preserve true transparent alpha outside the foreground objects.

CRITICAL LAYOUT: transparent in the entire central 76% of the image from x=12% to x=88%, all the way from top to y=90%. Absolutely no water, tide pool, rock, grass, or shadow inside this central rectangle. In the central lower 10% (y=90%-100%), allow only a few tiny isolated pebbles and shells with large transparent gaps. Do NOT draw a shoreline or continuous foreground band through the center.

Place the richly layered near-camera plants and rocks only in the outer left 12% and outer right 12% of the canvas, anchored to the bottom. Let a few leaves rise at those extreme edges, but no tall objects farther inward. All other pixels must remain transparent. Make the left and right clusters asymmetrical and different from each other, with broad leaves, a few reeds, blue-gray rocks and warm ochre stones. No central pool, no connected central rock line, no background, no sky, no distant water, no scene plate, no black fill, no text, no character. This is an isolated foreground parallax occlusion layer; keep the central character route clear.
```

The image has transparent alpha and leaves a broad central opening. Check placement in the game camera before use; its edge clusters are designed to frame the lane, not to provide collision ground.
