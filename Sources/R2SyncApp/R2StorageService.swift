import Foundation
import AWSS3
import ClientRuntime
import AWSClientRuntime
import CryptoKit

struct RemoteStorageItem {
    let key: String
    let size: Int64
    let lastModified: Date?
}

final class R2StorageService {
    private var s3Client: S3Client?

    func setupClient(config: R2Config) throws {
        guard !config.accountId.isEmpty, !config.accessKeyId.isEmpty, !config.secretAccessKey.isEmpty else {
            return
        }

        let endpoint = "https://\(config.accountId).r2.cloudflarestorage.com"
        
        let staticCredentials = try StaticAWSCredentialIdentityResolver(
            AWSCredentialIdentity(
                accessKey: config.accessKeyId,
                secret: config.secretAccessKey
            )
        )

        let s3Configuration = try S3Client.S3ClientConfiguration(
            awsCredentialIdentityResolver: staticCredentials,
            region: "auto",
            endpoint: endpoint
        )
        self.s3Client = S3Client(config: s3Configuration)
        print("[R2StorageService] S3 Client initialized for endpoint: \(endpoint)")
    }

    func uploadFile(fileURL: URL, relativePath: String, bucketName: String) async throws {
        guard let s3Client = s3Client else {
            throw NSError(domain: "R2StorageService", code: 401, userInfo: [NSLocalizedDescriptionKey: "Client not configured"])
        }

        let data = try Data(contentsOf: fileURL)
        let stream = ByteStream.data(data)

        let input = PutObjectInput(
            body: stream,
            bucket: bucketName,
            cacheControl: "public, max-age=31536000, immutable",
            key: relativePath
        )

        _ = try await s3Client.putObject(input: input)
        print("[R2StorageService] Successfully uploaded \(relativePath) to R2 bucket \(bucketName)")
    }

    func deleteFile(relativePath: String, bucketName: String) async throws {
        guard let s3Client = s3Client else {
            throw NSError(domain: "R2StorageService", code: 401, userInfo: [NSLocalizedDescriptionKey: "Client not configured"])
        }

        // 1. Delete exact key
        let input = DeleteObjectInput(
            bucket: bucketName,
            key: relativePath
        )
        _ = try? await s3Client.deleteObject(input: input)
        print("[R2StorageService] Deleted remote file key: \(relativePath)")

        // 2. Delete prefix folder objects if relativePath is a directory
        let prefix = relativePath.hasSuffix("/") ? relativePath : relativePath + "/"
        let listInput = ListObjectsV2Input(bucket: bucketName, prefix: prefix)
        if let listOutput = try? await s3Client.listObjectsV2(input: listInput), let contents = listOutput.contents {
            for obj in contents {
                if let key = obj.key {
                    let delInput = DeleteObjectInput(bucket: bucketName, key: key)
                    _ = try? await s3Client.deleteObject(input: delInput)
                    print("[R2StorageService] Deleted folder item: \(key)")
                }
            }
        }
    }

    func downloadFile(relativePath: String, bucketName: String, destinationURL: URL) async throws {
        guard let s3Client = s3Client else {
            throw NSError(domain: "R2StorageService", code: 401, userInfo: [NSLocalizedDescriptionKey: "Client not configured"])
        }

        let input = GetObjectInput(
            bucket: bucketName,
            key: relativePath
        )

        let output = try await s3Client.getObject(input: input)
        if let body = output.body, let data = try await body.readData() {
            let parentDir = destinationURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: parentDir, withIntermediateDirectories: true)
            try data.write(to: destinationURL)
            print("[R2StorageService] Successfully downloaded \(relativePath) to \(destinationURL.path)")
        }
    }

    func listBucketObjects(bucketName: String) async throws -> [RemoteStorageItem] {
        guard let s3Client = s3Client else {
            throw NSError(domain: "R2StorageService", code: 401, userInfo: [NSLocalizedDescriptionKey: "Client not configured"])
        }

        let input = ListObjectsV2Input(bucket: bucketName)
        let output = try await s3Client.listObjectsV2(input: input)

        var items: [RemoteStorageItem] = []
        if let contents = output.contents {
            for obj in contents {
                if let key = obj.key, !key.hasPrefix(".shares/") {
                    items.append(RemoteStorageItem(
                        key: key,
                        size: Int64(obj.size ?? 0),
                        lastModified: obj.lastModified
                    ))
                }
            }
        }
        return items
    }
}
