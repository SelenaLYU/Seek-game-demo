import AppKit
import CoreImage
import CoreML
import Foundation
import Vision

// macOS 本地抠图：Vision 主体分割（VNGenerateForegroundInstanceMaskRequest）
// 完全离线、免费、无需 API key。原样移植自「不务正业的游戏 / 江湖一生」项目。
//
//   swiftc -O extract_foreground.swift -o extract_foreground
//   ./extract_foreground input.png output.png

func usage() {
    fputs("usage: extract_foreground <input> <output>\n", stderr)
}

let args = CommandLine.arguments
guard args.count == 3 else {
    usage()
    exit(2)
}

let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])

guard let inputImage = CIImage(contentsOf: inputURL) else {
    fputs("unable to load input image\n", stderr)
    exit(1)
}

let request = VNGenerateForegroundInstanceMaskRequest()
if #available(macOS 14.0, *) {
    // 使用默认计算设备（ANE / GPU）。旧 SDK 里 MLCPUComputeDevice 已不再匹配
    // MLComputeDevice，强制指定 CPU 的写法会编译失败，这里直接交给系统调度。
    _ = request
} else {
    request.usesCPUOnly = true
}
let handler = VNImageRequestHandler(ciImage: inputImage)

do {
    try handler.perform([request])
    guard let result = request.results?.first, !result.allInstances.isEmpty else {
        throw NSError(domain: "extract_foreground", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "no foreground instance found"])
    }

    let maskBuffer = try result.generateScaledMaskForImage(
        forInstances: result.allInstances,
        from: handler
    )
    let maskImage = CIImage(cvPixelBuffer: maskBuffer)
    let transparent = CIImage(color: .clear).cropped(to: inputImage.extent)
    let outputImage = inputImage.applyingFilter(
        "CIBlendWithMask",
        parameters: [
            kCIInputBackgroundImageKey: transparent,
            kCIInputMaskImageKey: maskImage,
        ]
    )

    let context = CIContext(options: [.useSoftwareRenderer: false])
    try context.writePNGRepresentation(
        of: outputImage,
        to: outputURL,
        format: .RGBA8,
        colorSpace: CGColorSpaceCreateDeviceRGB()
    )
} catch {
    fputs("foreground extraction failed: \(error)\n", stderr)
    exit(1)
}
