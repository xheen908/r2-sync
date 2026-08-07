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
            publicDomainURL: "https://drive.ocpp-labs.com"
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
        let publicDomainURL = defaults.string(forKey: "r2_public_domain_url") ?? "https://drive.ocpp-labs.com"

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

    func fetchConfigFromVPS(serverUrl: String, username: String, password: String) async throws -> R2Config {
        var cleanUrl = serverUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanUrl.hasPrefix("http://") && !cleanUrl.hasPrefix("https://") {
            cleanUrl = "https://" + cleanUrl
        }
        if cleanUrl.hasSuffix("/") {
            cleanUrl = String(cleanUrl.dropLast())
        }

        guard let apiURL = URL(string: "\(cleanUrl)/api/account/sync-config") else {
            throw NSError(domain: "ConfigManager", code: 400, userInfo: [NSLocalizedDescriptionKey: "Ungültige Server-URL"])
        }

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: String] = [
            "username": username,
            "password": password
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(domain: "ConfigManager", code: 500, userInfo: [NSLocalizedDescriptionKey: "Ungültige Serverantwort"])
        }

        guard httpResponse.statusCode == 200 else {
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let errorMsg = json["error"] as? String {
                throw NSError(domain: "ConfigManager", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMsg])
            }
            throw NSError(domain: "ConfigManager", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Anmeldung fehlgeschlagen (HTTP \(httpResponse.statusCode))"])
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cfgObj = json["config"] as? [String: Any] else {
            throw NSError(domain: "ConfigManager", code: 500, userInfo: [NSLocalizedDescriptionKey: "Konfigurationsdaten unvollständig"])
        }

        let accountId = cfgObj["accountId"] as? String ?? ""
        let accessKeyId = cfgObj["accessKeyId"] as? String ?? ""
        let secretAccessKey = cfgObj["secretAccessKey"] as? String ?? ""
        let bucketName = cfgObj["bucketName"] as? String ?? ""
        let publicDomainURL = cfgObj["publicDomainUrl"] as? String ?? cleanUrl

        let newConfig = R2Config(
            accountId: accountId,
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
            bucketName: bucketName,
            syncFolderPath: self.config.syncFolderPath.isEmpty ? R2Config.defaultSyncFolder : self.config.syncFolderPath,
            publicDomainURL: publicDomainURL
        )

        saveConfig(newConfig)
        return newConfig
    }

    var isConfigured: Bool {
        !config.accountId.isEmpty &&
        !config.accessKeyId.isEmpty &&
        !config.secretAccessKey.isEmpty &&
        !config.bucketName.isEmpty &&
        !config.syncFolderPath.isEmpty
    }
}
