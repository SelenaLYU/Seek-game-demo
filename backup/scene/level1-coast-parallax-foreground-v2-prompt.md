# 第一关海边近景视差层 v2

参考 `level1-coast-handdrawn-exploration-v3.png` 的前景布局与配色；动画拼图只作为手绘轮廓和概括程度的参考。生成一张透明背景、与概念图相同宽高比的独立近景层。

```text
Create a matching separate parallax foreground overlay for reference image 1. Canvas wide 16:9. Use reference 1's exact sea-side palette and placement, and reference 2 only for hand-drawn TV animation ink style. This is the nearest foreground layer only, with actual transparent alpha everywhere else. Draw a broken irregular lower-edge arrangement of near-camera shoreline objects: distinct large blue-gray rocks and warm ochre stones, two shallow turquoise tide-pool patches, small shell/pebble marks, dark blue-green broad-leaf plants and varied reeds. Match the left and right corner clusters and rock scale from reference 1. Make several depth bands with overlaps and visible color contrast. Keep the center 65% of the canvas mostly transparent above the bottom 10% so the main sandy playable path and character remain unobstructed. Let plant/rock silhouettes rise higher only at the outer 10-15% left and right edges. Do not create a solid continuous grass strip, a water background, a horizon, sky, houses, islands, foreground bridge, any character or object landmarks. No texture haze over transparent areas, no rectangle, no black background: preserve true alpha. Hand-drawn dark umber contour, simplified matte painted color shapes, few sparse brush strokes, calm blue-green and sand palette.
```

素材为试验层。检查透明通道后确认背景为透明；在引擎里仍需测摆放高度，避免近景遮住主角或可走沙路。
