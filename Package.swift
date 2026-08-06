// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "R2SyncApp",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "R2SyncApp",
            targets: ["R2SyncApp"]
        ),
        .library(
            name: "R2SyncFinderExtension",
            type: .dynamic,
            targets: ["R2SyncFinderExtension"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/awslabs/aws-sdk-swift", from: "0.35.0"),
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.24.0")
    ],
    targets: [
        .executableTarget(
            name: "R2SyncApp",
            dependencies: [
                .product(name: "AWSS3", package: "aws-sdk-swift"),
                .product(name: "GRDB", package: "GRDB.swift")
            ],
            path: "Sources/R2SyncApp"
        ),
        .target(
            name: "R2SyncFinderExtension",
            dependencies: [],
            path: "R2SyncFinderExtension"
        ),
        .testTarget(
            name: "R2SyncAppTests",
            dependencies: ["R2SyncApp"],
            path: "Tests/R2SyncAppTests"
        )
    ]
)
