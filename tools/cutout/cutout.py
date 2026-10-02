#!/usr/bin/env python3
"""Seek 游戏资产抠图 / 切片工具链。

移植自「不务正业的游戏 / 江湖一生」的 A-03 美术资产流水线，四种能力：

1. vision  —— macOS Vision 主体分割抠图（离线、免费、无需 API key）
2. chroma  —— 纯色底（洋红/绿幕）色键抠图 + 边缘去溢色，适合 AI 生图出图
3. trim    —— 按 alpha 边界裁掉多余透明边
4. canvas  —— 缩放并居中贴到统一画布（角色帧统一 96x112 这类需求）
5. sheet   —— 一张 sheet 按网格切成多帧
6. validate—— 校验 PNG / RGBA / 尺寸 / 透明四角 / 覆盖率 / 色键残留

用法：
    python3 cutout.py vision   <in> <out> [--trim] [--canvas 96x112] [--margin 2]
    python3 cutout.py chroma   <in> <out> --key '#ff00ff' [--tolerance 40] [--despill]
                                          [--trim] [--canvas 96x112]
    python3 cutout.py sheet    <in> <outdir> --grid 4x1 [--canvas 96x112] [--names a,b,c,d]
    python3 cutout.py trim     <in> <out>
    python3 cutout.py canvas   <in> <out> --canvas 256x384 [--margin 4]
    python3 cutout.py validate <in|dir> [--size 96x112] [--coverage 0.05]

输入/输出都可以是目录，目录模式下按同名文件批量处理。
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageFilter
except ImportError:
    sys.exit("需要 Pillow： /Users/simon/.workbuddy/binaries/python/envs/default/bin/pip install pillow")


HERE = Path(__file__).resolve().parent
SWIFT_SRC = HERE / "extract_foreground.swift"
SWIFT_BIN = HERE / "extract_foreground"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}


# --------------------------------------------------------------------------- #
# Vision 抠图
# --------------------------------------------------------------------------- #
def build_helper(force: bool = False) -> Path:
    """按需编译 Swift 抠图小工具，源码变了自动重编。"""
    if SWIFT_BIN.exists() and not force:
        if SWIFT_BIN.stat().st_mtime >= SWIFT_SRC.stat().st_mtime:
            return SWIFT_BIN
    subprocess.run(
        ["swiftc", "-O", str(SWIFT_SRC), "-o", str(SWIFT_BIN)],
        check=True,
    )
    return SWIFT_BIN


class CutoutError(RuntimeError):
    """抠图失败，但已经转成人类可读的错误（不要把 traceback 甩给用户）。"""


def vision_cutout(src: Path, dst: Path) -> None:
    helper = build_helper()
    result = subprocess.run([str(helper), str(src), str(dst)], capture_output=True, text=True)
    if result.returncode != 0:
        raise CutoutError((result.stderr or "").strip() or f"Vision 抠图失败（exit {result.returncode}）")


# --------------------------------------------------------------------------- #
# 色键抠图
# --------------------------------------------------------------------------- #
def parse_color(value: str) -> tuple[int, int, int]:
    value = value.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        raise ValueError(f"无法解析颜色：{value}")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def chroma_alpha(image: Image.Image, key: tuple[int, int, int], tolerance: int) -> Image.Image:
    """按到色键颜色的距离生成 alpha；距离 < tol/2 全透，> tol 全不透，中间软化。

    用 ImageChops 做逐通道差值，避免 Python 逐像素循环（1920x1080 秒级完成）。
    """
    kr, kg, kb = key
    size = image.size
    dist = None
    for channel, kv in zip(image.split()[:3], (kr, kg, kb)):
        diff = ImageChops.difference(channel, Image.new("L", size, kv))  # 返回 |Δ|
        dist = diff if dist is None else ImageChops.lighter(dist, diff)

    soft = max(1, tolerance // 2)
    table = []
    for d in range(256):
        if d <= soft:
            table.append(0)
        elif d >= tolerance:
            table.append(255)
        else:
            table.append(round(255 * (d - soft) / (tolerance - soft)))
    return dist.point(table)


def despill(image: Image.Image, key: tuple[int, int, int], strength: float = 1.0) -> Image.Image:
    """去掉半透明边缘的溢色：色键占主导的通道压到「其它通道的最大值」。

    洋红底 (#ff00ff) → R、B 是主导通道，压到不高于 G；绿幕 → G 压到 max(R,B)。
    只作用于 0 < alpha < 255 的边缘像素，实心区域不动。
    """
    kr, kg, kb = key
    peak = max(kr, kg, kb)
    dominant = [i for i, v in enumerate((kr, kg, kb)) if v == peak]
    if not dominant or len(dominant) == 3:
        return image

    channels = list(image.convert("RGB").split())
    others_max = None
    for j in range(3):
        if j not in dominant:
            others_max = channels[j] if others_max is None else ImageChops.lighter(others_max, channels[j])

    fixed = list(channels)
    for i in dominant:
        fixed[i] = ImageChops.darker(channels[i], others_max)
    despilled = Image.merge("RGB", fixed)
    if strength < 1.0:
        despilled = Image.blend(Image.merge("RGB", channels), despilled, strength)

    alpha = image.getchannel("A")
    edge = alpha.point(lambda v: 255 if 0 < v < 255 else 0)  # 只处理半透明边缘
    rgb = Image.composite(despilled, Image.merge("RGB", channels), edge)
    return Image.merge("RGBA", (*rgb.split(), alpha))


def chroma_cutout(
    src: Path,
    dst: Path,
    key: tuple[int, int, int],
    tolerance: int = 40,
    do_despill: bool = True,
) -> None:
    image = Image.open(src).convert("RGBA")
    alpha = chroma_alpha(image, key, tolerance)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))
    image.putalpha(alpha)
    if do_despill:
        image = despill(image, key)
    save(image, dst)


# --------------------------------------------------------------------------- #
# 通用后处理
# --------------------------------------------------------------------------- #
def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def save(image: Image.Image, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    image.save(dst, "PNG", optimize=True)


def trim(image: Image.Image, pad: int = 0) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        return image
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(image.width, x1 + pad)
    y1 = min(image.height, y1 + pad)
    return image.crop((x0, y0, x1, y1))


def fit_canvas(image: Image.Image, size: tuple[int, int], margin: int = 0, anchor: str = "center") -> Image.Image:
    """等比缩放后居中贴到固定画布，保证同一族资产尺寸/重心一致。"""
    max_w = max(1, size[0] - margin * 2)
    max_h = max(1, size[1] - margin * 2)
    scale = min(max_w / image.width, max_h / image.height)
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    if anchor == "bottom":
        position = ((size[0] - resized.width) // 2, size[1] - margin - resized.height)
    else:
        position = ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2)
    canvas.alpha_composite(resized, position)
    return canvas


def parse_size(value: str) -> tuple[int, int]:
    if "x" not in value.lower():
        raise ValueError(f"尺寸格式应为 WxH，收到 {value}")
    w, h = value.lower().split("x", 1)
    return int(w), int(h)


def parse_grid(value: str) -> tuple[int, int]:
    cols, rows = parse_size(value)  # cols x rows
    return cols, rows


def postprocess(image: Image.Image, do_trim: bool, canvas: tuple[int, int] | None, margin: int) -> Image.Image:
    if do_trim:
        image = trim(image)
    if canvas:
        image = fit_canvas(image, canvas, margin)
    return image


# --------------------------------------------------------------------------- #
# auto：丢一张带背景的图进来，自动选路线，直接出透明 PNG
# --------------------------------------------------------------------------- #
def edge_samples(image: Image.Image, band: int = 8, limit: int = 40000) -> list[tuple[int, int, int]]:
    """取四条边的像素，用来判断背景是不是平的。"""
    rgb = image.convert("RGB")
    w, h = rgb.size
    band = max(2, min(band, w // 4, h // 4))
    strips = [
        rgb.crop((0, 0, w, band)),
        rgb.crop((0, h - band, w, h)),
        rgb.crop((0, band, band, h - band)),
        rgb.crop((w - band, band, w, h - band)),
    ]
    samples: list[tuple[int, int, int]] = []
    for strip in strips:
        px = list(strip.get_flattened_data())
        step = max(1, len(px) // limit)
        samples.extend(px[::step])
    return samples


def detect_background(path: Path) -> tuple[str, dict]:
    """判断该走哪条路线：已有 alpha / 平底色键 / Vision 主体分割。"""
    import statistics

    with Image.open(path) as image:
        image.load()
        if image.mode in ("RGBA", "LA") or "transparency" in image.info:
            alpha = image.convert("RGBA").getchannel("A")
            if alpha.getextrema()[0] < 250:
                return "alpha", {"reason": "输入已经带 alpha 通道"}
        samples = edge_samples(image)

    columns = list(zip(*samples))
    means = [sum(c) / len(c) for c in columns]
    spread = max(statistics.pstdev(c) for c in columns)
    key = tuple(round(m) for m in means)

    # 近白 / 近黑 / 近灰的平底很危险（主体内部常有同色，色键会在主体上打洞），一律交给 Vision。
    # 主体上打洞比边缘毛糙更致命，所以这条宁保守：很亮的底（>205）就算有色偏也走 Vision。
    brightness = sum(key) / 3
    low_saturation = max(key) - min(key) < 12
    risky_flat = (low_saturation and (brightness > 190 or brightness < 40)) or brightness > 205
    if spread <= 14 and not risky_flat:
        return "chroma", {
            "key": key,
            "spread": round(spread, 1),
            "tolerance": int(min(90, max(32, spread * 3 + 28))),
        }
    return "vision", {"spread": round(spread, 1), "edge_mean": key, "risky": risky_flat}


def alpha_coverage(path: Path) -> float:
    with Image.open(path) as image:
        data = image.convert("RGBA").getchannel("A").get_flattened_data()
        return sum(1 for v in data if v > 8) / len(data)


def auto_one(
    src: Path,
    dst: Path,
    do_trim: bool = True,
    canvas: tuple[int, int] | None = None,
    margin: int = 0,
) -> None:
    mode, info = detect_background(src)

    if mode == "alpha":
        image = load_rgba(src)
        route = f"已有 alpha（{info['reason']}）"
    elif mode == "chroma":
        key = info["key"]
        chroma_cutout(src, dst, key, info["tolerance"], True)
        coverage = alpha_coverage(dst)
        route = f"色键 #{key[0]:02x}{key[1]:02x}{key[2]:02x}（底色波动 {info['spread']}）"
        if coverage < 0.02 or coverage > 0.98:
            vision_cutout(src, dst)
            route += f" → 覆盖率异常 {coverage:.1%}，回退 Vision"
        image = load_rgba(dst)
    else:
        why = (
            "底色是纯白/灰/黑，主体内部同色风险高"
            if info.get("risky")
            else f"背景不是纯色（边缘波动 {info['spread']}）"
        )
        try:
            vision_cutout(src, dst)
        except CutoutError as exc:
            if "no foreground instance" in str(exc):
                # 整张图就是一整片场景，没有可分离的独立主体 —— 它本身就是背景，不该抠
                print(f"SKIP  {src.name}  整张图没有独立主体（场景图/背景图），已原样输出，不需要抠图")
                save(load_rgba(src), dst)
                return
            print(f"FAIL  {src.name}  {exc}")
            return
        image = load_rgba(dst)
        route = f"Vision 主体分割（{why}）"

    image = postprocess(image, do_trim, canvas, margin)
    save(image, dst)
    coverage = alpha_coverage(dst)
    print(f"OK   {src.name} -> {dst}  [{route}]  {image.width}x{image.height}  可见 {coverage:.0%}")


# --------------------------------------------------------------------------- #
# 子命令
# --------------------------------------------------------------------------- #
def collect_inputs(src: Path) -> list[Path]:
    if src.is_dir():
        return sorted(p for p in src.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    return [src]


def cmd_auto(args: argparse.Namespace) -> int:
    src = Path(args.input)
    canvas = parse_size(args.canvas) if args.canvas else None

    if src.is_dir():
        outdir = Path(args.output) if args.output else src.with_name(f"{src.name}-cutout")
        outdir.mkdir(parents=True, exist_ok=True)
        for item in collect_inputs(src):
            try:
                auto_one(item, outdir / (item.stem + ".png"), not args.no_trim, canvas, args.margin)
            except Exception as exc:  # 批量时一张失败不能拖垮整批
                print(f"FAIL  {item.name}  {exc}")
        return 0

    dst = Path(args.output) if args.output else src.with_name(f"{src.stem}-cutout.png")
    auto_one(src, dst, not args.no_trim, canvas, args.margin)
    return 0


def cmd_vision(args: argparse.Namespace) -> int:
    src, dst = Path(args.input), Path(args.output)
    if src.is_dir():
        dst.mkdir(parents=True, exist_ok=True)
        for item in collect_inputs(src):
            out = dst / (item.stem + ".png")
            vision_cutout(item, out)
            image = postprocess(load_rgba(out), args.trim, parse_size(args.canvas) if args.canvas else None, args.margin)
            save(image, out)
            print(f"OK   {item.name} -> {out}")
        return 0

    vision_cutout(src, dst)
    image = postprocess(load_rgba(dst), args.trim, parse_size(args.canvas) if args.canvas else None, args.margin)
    save(image, dst)
    print(f"OK   {src} -> {dst} ({image.width}x{image.height})")
    return 0


def cmd_chroma(args: argparse.Namespace) -> int:
    key = parse_color(args.key)
    src, dst = Path(args.input), Path(args.output)
    if src.is_dir():
        dst.mkdir(parents=True, exist_ok=True)
        for item in collect_inputs(src):
            out = dst / (item.stem + ".png")
            chroma_cutout(item, out, key, args.tolerance, not args.no_despill)
            image = postprocess(load_rgba(out), args.trim, parse_size(args.canvas) if args.canvas else None, args.margin)
            save(image, out)
            print(f"OK   {item.name} -> {out}")
        return 0

    chroma_cutout(src, dst, key, args.tolerance, not args.no_despill)
    image = postprocess(load_rgba(dst), args.trim, parse_size(args.canvas) if args.canvas else None, args.margin)
    save(image, dst)
    print(f"OK   {src} -> {dst} ({image.width}x{image.height})")
    return 0


def cmd_sheet(args: argparse.Namespace) -> int:
    """按网格切一张 sheet（Vision 或色键先去背，再切）。"""
    cols, rows = parse_grid(args.grid)
    src = Path(args.input)
    outdir = Path(args.output)
    outdir.mkdir(parents=True, exist_ok=True)

    tmp = outdir / ".__sheet_alpha.png"
    mode = args.mode
    if mode == "auto":
        # 已经抠好的 sheet 不能再走 vision —— 会二次重抠，把边缘咬掉（实测 0.72% 像素被改）
        mode = "none" if detect_background(src)[0] == "alpha" else "vision"
    if mode == "vision":
        vision_cutout(src, tmp)
    elif mode == "chroma":
        chroma_cutout(src, tmp, parse_color(args.key), args.tolerance, not args.no_despill)
    else:
        shutil.copy2(src, tmp)
    sheet = load_rgba(tmp)

    cell_w, cell_h = sheet.width // cols, sheet.height // rows
    canvas = parse_size(args.canvas) if args.canvas else None
    names = [n.strip() for n in args.names.split(",")] if args.names else []

    index = 0
    for row in range(rows):
        for col in range(cols):
            cell = sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
            cell = postprocess(cell, args.trim, canvas, args.margin)
            name = names[index] if index < len(names) else f"{src.stem}-{index + 1:02d}"
            out = outdir / f"{name}.png"
            save(cell, out)
            print(f"OK   {out.name} ({cell.width}x{cell.height})")
            index += 1
    tmp.unlink(missing_ok=True)
    return 0


def cmd_trim(args: argparse.Namespace) -> int:
    src, dst = Path(args.input), Path(args.output)
    if src.is_dir():
        dst.mkdir(parents=True, exist_ok=True)
        for item in collect_inputs(src):
            out = dst / (item.stem + ".png")
            save(trim(load_rgba(item), args.pad), out)
            print(f"OK   {item.name} -> {out}")
        return 0
    image = trim(load_rgba(src), args.pad)
    save(image, dst)
    print(f"OK   {src} -> {dst} ({image.width}x{image.height})")
    return 0


def cmd_canvas(args: argparse.Namespace) -> int:
    size = parse_size(args.canvas)
    src, dst = Path(args.input), Path(args.output)
    if src.is_dir():
        dst.mkdir(parents=True, exist_ok=True)
        for item in collect_inputs(src):
            out = dst / (item.stem + ".png")
            image = fit_canvas(load_rgba(item), size, args.margin, args.anchor)
            save(image, out)
            print(f"OK   {item.name} -> {out}")
        return 0
    image = fit_canvas(load_rgba(src), size, args.margin, args.anchor)
    save(image, dst)
    print(f"OK   {src} -> {dst} ({image.width}x{image.height})")
    return 0


def validate_one(path: Path, size: tuple[int, int] | None, min_coverage: float) -> list[str]:
    errors: list[str] = []
    try:
        with Image.open(path) as image:
            image.load()
            if image.format != "PNG":
                errors.append(f"格式 {image.format}，应为 PNG")
            if size and image.size != size:
                errors.append(f"尺寸 {image.size[0]}x{image.size[1]}，应为 {size[0]}x{size[1]}")
            if image.mode != "RGBA":
                errors.append(f"模式 {image.mode}，应为 RGBA")
                return errors

            alpha = image.getchannel("A")
            corners = [
                alpha.getpixel((0, 0)),
                alpha.getpixel((image.width - 1, 0)),
                alpha.getpixel((0, image.height - 1)),
                alpha.getpixel((image.width - 1, image.height - 1)),
            ]
            if any(v > 8 for v in corners):
                errors.append(f"四角不透明 {corners}")
            bbox = alpha.getbbox()
            if bbox is None:
                errors.append("整张图全透明")
                return errors
            coverage = sum(1 for v in alpha.get_flattened_data() if v > 8) / (image.width * image.height)
            if coverage < min_coverage:
                errors.append(f"可见覆盖率仅 {coverage:.1%}（阈值 {min_coverage:.0%}）")
    except (OSError, ValueError) as exc:
        errors.append(f"读取失败：{exc}")
    return errors


def chroma_residue(image: Image.Image, key: tuple[int, int, int]) -> int:
    kr, kg, kb = key
    return sum(
        1
        for r, g, b, a in image.get_flattened_data()
        if a > 8 and abs(r - kr) < 24 and abs(g - kg) < 24 and abs(b - kb) < 24
    )


def cmd_validate(args: argparse.Namespace) -> int:
    target = Path(args.input)
    size = parse_size(args.size) if args.size else None
    files = collect_inputs(target) if target.is_dir() else [target]
    failures = 0
    for path in files:
        errors = validate_one(path, size, args.coverage)
        if args.key:
            key = parse_color(args.key)
            with Image.open(path) as image:
                residue = chroma_residue(image.convert("RGBA"), key)
            if residue:
                errors.append(f"残留色键像素 {residue}")
        if errors:
            failures += 1
            print(f"FAIL {path}: {'; '.join(errors)}")
        else:
            print(f"OK   {path}")
    print(f"\n{len(files) - failures}/{len(files)} 通过。" if failures else f"\n全部 {len(files)} 个通过。")
    return 1 if failures else 0


# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Seek 游戏资产抠图 / 切片工具链")
    sub = parser.add_subparsers(dest="command", required=True)

    def common(p: argparse.ArgumentParser) -> None:
        p.add_argument("input")
        p.add_argument("output")
        p.add_argument("--trim", action="store_true", help="按 alpha 边界裁掉多余透明边")
        p.add_argument("--canvas", help="统一画布尺寸，如 96x112")
        p.add_argument("--margin", type=int, default=0, help="画布内边距")

    p = sub.add_parser("auto", help="自动判断路线：平底走色键，复杂背景走 Vision（默认入口）")
    p.add_argument("input", help="图片或目录")
    p.add_argument("output", nargs="?", help="输出路径，省略则写成 <原名>-cutout.png")
    p.add_argument("--no-trim", action="store_true", help="不裁掉多余透明边")
    p.add_argument("--canvas", help="统一画布尺寸，如 96x112")
    p.add_argument("--margin", type=int, default=0)

    p = sub.add_parser("vision", help="macOS Vision 主体分割抠图（离线免费）")
    common(p)

    p = sub.add_parser("chroma", help="纯色底色键抠图")
    common(p)
    p.add_argument("--key", default="#ff00ff", help="底色，如 #ff00ff / #00ff00")
    p.add_argument("--tolerance", type=int, default=40, help="色差容差，越大抠得越狠")
    p.add_argument("--no-despill", action="store_true", help="关闭边缘去溢色")

    p = sub.add_parser("sheet", help="整张 sheet 去背后按网格切帧")
    common(p)
    p.add_argument("--grid", default="4x1", help="列x行，如 4x1 / 8x1 / 3x2")
    p.add_argument(
        "--mode",
        choices=["auto", "vision", "chroma", "none"],
        default="auto",
        help="auto=已有 alpha 就跳过抠图（默认），none=完全不抠只切",
    )
    p.add_argument("--key", default="#ff00ff")
    p.add_argument("--tolerance", type=int, default=40)
    p.add_argument("--no-despill", action="store_true")
    p.add_argument("--names", help="输出文件名，逗号分隔，如 idle,run,jump,fall")

    p = sub.add_parser("trim", help="裁掉多余透明边")
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("--pad", type=int, default=0)

    p = sub.add_parser("canvas", help="缩放居中贴到统一画布")
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("--canvas", required=True)
    p.add_argument("--margin", type=int, default=0)
    p.add_argument("--anchor", choices=["center", "bottom"], default="center")

    p = sub.add_parser("validate", help="校验 PNG/RGBA/尺寸/透明角/覆盖率")
    p.add_argument("input")
    p.add_argument("--size", help="期望尺寸 WxH")
    p.add_argument("--coverage", type=float, default=0.05)
    p.add_argument("--key", help="同时检查色键残留，如 #ff00ff")

    return parser


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    return {
        "auto": cmd_auto,
        "vision": cmd_vision,
        "chroma": cmd_chroma,
        "sheet": cmd_sheet,
        "trim": cmd_trim,
        "canvas": cmd_canvas,
        "validate": cmd_validate,
    }[args.command](args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
