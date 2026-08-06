import Foundation
import AppKit
import CommonCrypto

guard CommandLine.arguments.count > 1 else { exit(0) }

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath)

let defaults = UserDefaults.standard
let syncFolderPath = defaults.string(forKey: "r2_sync_folder_path") ?? (FileManager.default.homeDirectoryForCurrentUser.path + "/Documents/EasyFisk-Docs")

// Read Keychain credentials
func readKeychain(key: String) -> String {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: key,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var dataTypeRef: AnyObject?
    if SecItemCopyMatching(query as CFDictionary, &dataTypeRef) == errSecSuccess,
       let data = dataTypeRef as? Data,
       let str = String(data: data, encoding: .utf8) {
        return str
    }
    return ""
}

let accountId = readKeychain(key: "r2_account_id")
let accessKeyId = readKeychain(key: "r2_access_key_id")
let secretAccessKey = readKeychain(key: "r2_secret_access_key")
let bucketName = defaults.string(forKey: "r2_bucket_name") ?? "easyfisk-docs"
let expirationSeconds: Int = 86400 // 24 Hours default TTL

// Calculate S3 Key
let rootURL = URL(fileURLWithPath: syncFolderPath)
var objectKey = String(fileURL.path.dropFirst(rootURL.path.count))
if objectKey.hasPrefix("/") { objectKey = String(objectKey.dropFirst()) }

let host = "\(accountId).r2.cloudflarestorage.com"
let encodedPath = "/" + bucketName + "/" + objectKey.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!

// AWS SigV4 Presigned URL Calculation
let now = Date()
let dateFormatter = DateFormatter()
dateFormatter.timeZone = TimeZone(secondsFromGMT: 0)
dateFormatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
let amzDate = dateFormatter.string(from: now)

dateFormatter.dateFormat = "yyyyMMdd"
let dateStamp = dateFormatter.string(from: now)

let region = "auto"
let service = "s3"
let credentialScope = "\(dateStamp)/\(region)/\(service)/aws4_request"

let queryParams = [
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": "\(accessKeyId)/\(credentialScope)".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "\(expirationSeconds)",
    "X-Amz-SignedHeaders": "host"
]

let sortedQuery = queryParams.sorted(by: { $0.key < $1.key })
let canonicalQueryString = sortedQuery.map { "\($0.key)=\($0.value)" }.joined(separator: "&")

let canonicalHeaders = "host:\(host)\n"
let signedHeaders = "host"
let payloadHash = "UNSIGNED-PAYLOAD"

let canonicalRequest = "GET\n\(encodedPath)\n\(canonicalQueryString)\n\(canonicalHeaders)\n\(signedHeaders)\n\(payloadHash)"

func sha256Hex(_ string: String) -> String {
    let data = string.data(using: .utf8)!
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    data.withUnsafeBytes {
        _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &digest)
    }
    return digest.map { String(format: "%02x", $0) }.joined()
}

func hmacSHA256(key: Data, data: Data) -> Data {
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    key.withUnsafeBytes { keyBytes in
        data.withUnsafeBytes { dataBytes in
            CCHmac(CCHmacAlgorithm(kCCHmacAlgSHA256), keyBytes.baseAddress, key.count, dataBytes.baseAddress, data.count, &digest)
        }
    }
    return Data(digest)
}

let canonicalRequestHash = sha256Hex(canonicalRequest)
let stringToSign = "AWS4-HMAC-SHA256\n\(amzDate)\n\(credentialScope)\n\(canonicalRequestHash)"

let kDate = hmacSHA256(key: ("AWS4" + secretAccessKey).data(using: .utf8)!, data: dateStamp.data(using: .utf8)!)
let kRegion = hmacSHA256(key: kDate, data: region.data(using: .utf8)!)
let kService = hmacSHA256(key: kRegion, data: service.data(using: .utf8)!)
let kSigning = hmacSHA256(key: kService, data: "aws4_request".data(using: .utf8)!)

let signatureData = hmacSHA256(key: kSigning, data: stringToSign.data(using: .utf8)!)
let signature = signatureData.map { String(format: "%02x", $0) }.joined()

let presignedURL = "https://\(host)\(encodedPath)?\(canonicalQueryString)&X-Amz-Signature=\(signature)"

let pasteboard = NSPasteboard.general
pasteboard.clearContents()
pasteboard.declareTypes([.string], owner: nil)
pasteboard.setString(presignedURL, forType: .string)

print("COPIED PRESIGNED R2 URL (Valid 24h):", presignedURL)
