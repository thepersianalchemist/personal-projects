// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FlightCore",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(name: "FlightCore", targets: ["FlightCore"])
    ],
    targets: [
        .target(
            name: "FlightCore",
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "FlightCoreTests",
            dependencies: ["FlightCore"]
        )
    ]
)
