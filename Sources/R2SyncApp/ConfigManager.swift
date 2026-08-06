import Foundation

/// Models the configuration parameters needed for Cloudflare R2 connection
struct R2Config: Codable {
    var accountId: String
    var accessKeyId: String
    var secretAccessKey: String
    var bucketName: String
    var syncFolderPath: String
    var publicDomainURL: String

    var s3EndpointURL: URL? {
        URL(string: "https://\(accountId).r2.cloudflarestorage.com")
    }

    static let defaultSyncFolder: String = {
        let homeDir = FileManager.default.homeDirectoryForCurrentUser
        return homeDir.appendingPathComponent("Documents/EasyFisk-Docs").path
    }()

    static var empty: R2Config {
        R2Config(
            accountId: "",
            accessKeyId: "",
            secretAccessKey: "",
            bucketName: "",
            syncFolderPath: defaultSyncFolder,
            publicDomainURL: "https://pub-7934cd421fb044609578237788351fae.r2.dev"
        )
    }
}

/// Managing persistent configuration via Keychain and UserDefaults
final class ConfigManager: ObservableObject {
    static let shared = ConfigManager()

    @Published var config: R2Config

    private init() {
        self.config = R2Config.empty
        self.loadConfig()
    }

    func loadConfig() {
        let defaults = UserDefaults.standard
        let accountId = (try? KeychainHelper.shared.readString(key: "r2_account_id")) ?? ""
        let accessKeyId = (try? KeychainHelper.shared.readString(key: "r2_access_key_id")) ?? ""
        let secretAccessKey = (try? KeychainHelper.shared.readString(key: "r2_secret_access_key")) ?? ""
        let bucketName = defaults.string(forKey: "r2_bucket_name") ?? ""
        let syncFolderPath = defaults.string(forKey: "r2_sync_folder_path") ?? R2Config.defaultSyncFolder
        let publicDomainURL = defaults.string(forKey: "r2_public_domain_url") ?? "https://pub-7934cd421fb044609578237788351fae.r2.dev"

        self.config = R2Config(
            accountId: accountId,
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
            bucketName: bucketName,
            syncFolderPath: syncFolderPath,
            publicDomainURL: publicDomainURL
        )
    }

    func saveConfig(_ newConfig: R2Config) {
        self.config = newConfig

        let defaults = UserDefaults.standard
        defaults.set(newConfig.bucketName, forKey: "r2_bucket_name")
        defaults.set(newConfig.syncFolderPath, forKey: "r2_sync_folder_path")
        defaults.set(newConfig.publicDomainURL, forKey: "r2_public_domain_url")

        if let suiteDefaults = UserDefaults(suiteName: "com.r2sync.app") {
            suiteDefaults.set(newConfig.bucketName, forKey: "r2_bucket_name")
            suiteDefaults.set(newConfig.syncFolderPath, forKey: "r2_sync_folder_path")
            suiteDefaults.set(newConfig.publicDomainURL, forKey: "r2_public_domain_url")
        }

        try? KeychainHelper.shared.save(key: "r2_account_id", stringValue: newConfig.accountId)
        try? KeychainHelper.shared.save(key: "r2_access_key_id", stringValue: newConfig.accessKeyId)
        try? KeychainHelper.shared.save(key: "r2_secret_access_key", stringValue: newConfig.secretAccessKey)
    }

    var isConfigured: Bool {
        !config.accountId.isEmpty &&
        !config.accessKeyId.isEmpty &&
        !config.secretAccessKey.isEmpty &&
        !config.bucketName.isEmpty &&
        !config.syncFolderPath.isEmpty
    }
}
