import Foundation
import AWSS3
import ClientRuntime
import AWSClientRuntime

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
            key: relativePath
        )

        _ = try await s3Client.putObject(input: input)
        print("[R2StorageService] Successfully uploaded \(relativePath) to R2 bucket \(bucketName)")
    }
}
