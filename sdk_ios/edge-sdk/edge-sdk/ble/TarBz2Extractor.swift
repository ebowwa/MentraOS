import Foundation
import SWCompression

@objc(TarBz2Extractor)
public class TarBz2Extractor: NSObject {
    @objc public static func extractTarBz2From(_ sourcePath: String, to destinationPath: String, error: NSErrorPointer) -> Bool {
        print("TarBz2Extractor: Starting extraction from \(sourcePath) to \(destinationPath)")
        do {
            try extractTarBz2Internal(from: sourcePath, to: destinationPath)
            print("TarBz2Extractor: Extraction completed successfully")
            return true
        } catch let extractionError as NSError {
            print("TarBz2Extractor: Extraction failed with error: \(extractionError)")
            if let errorPtr = error {
                errorPtr.pointee = extractionError
            }
            return false
        } catch let unknownError {
            print("TarBz2Extractor: Extraction failed with unknown error: \(unknownError)")
            if let errorPtr = error {
                errorPtr.pointee = NSError(domain: "TarBz2Extractor", code: 0, userInfo: [NSLocalizedDescriptionKey: unknownError.localizedDescription])
            }
            return false
        }
    }

    private static func extractTarBz2Internal(from sourcePath: String, to destinationPath: String) throws {
        print("TarBz2Extractor: Reading file from \(sourcePath)")

        // Check file size
        let fileURL = URL(fileURLWithPath: sourcePath)
        let fileAttributes = try FileManager.default.attributesOfItem(atPath: sourcePath)
        let fileSize = fileAttributes[.size] as? Int64 ?? 0
        print("TarBz2Extractor: File size is \(fileSize / 1024 / 1024) MB")

        // Read the compressed file with autoreleasepool to manage memory
        var compressedData: Data?
        autoreleasepool {
            compressedData = try? Data(contentsOf: fileURL, options: .mappedIfSafe)
        }

        guard let data = compressedData else {
            throw NSError(domain: "TarBz2Extractor", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to read compressed file"])
        }
        print("TarBz2Extractor: Read \(data.count / 1024 / 1024) MB")

        // Decompress bz2 with timeout check
        print("TarBz2Extractor: Starting bz2 decompression...")
        let startTime = Date()
        let decompressedData: Data

        do {
            // Use autoreleasepool to manage memory during decompression
            let result = try autoreleasepool { () -> Data in
                return try BZip2.decompress(data: data)
            }
            decompressedData = result

            let elapsed = Date().timeIntervalSince(startTime)
            print("TarBz2Extractor: Decompressed to \(decompressedData.count / 1024 / 1024) MB in \(elapsed) seconds")
        } catch {
            print("TarBz2Extractor: BZip2 decompression failed: \(error)")
            throw NSError(domain: "TarBz2Extractor", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to decompress bz2: \(error.localizedDescription)"])
        }

        // Extract tar
        print("TarBz2Extractor: Starting tar extraction...")
        let tarEntries: [TarEntry]
        do {
            tarEntries = try TarContainer.open(container: decompressedData)
            print("TarBz2Extractor: Found \(tarEntries.count) entries in tar")
        } catch {
            print("TarBz2Extractor: Tar extraction failed: \(error)")
            throw NSError(domain: "TarBz2Extractor", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to extract tar: \(error.localizedDescription)"])
        }

        // Create destination directory
        let fileManager = FileManager.default
        try? fileManager.createDirectory(atPath: destinationPath, withIntermediateDirectories: true, attributes: nil)

        // Extract files, stripping the first directory component
        for entry in tarEntries {
            guard let entryData = entry.data else { continue }

            var entryName = entry.info.name

            // Remove leading ./ if present
            if entryName.hasPrefix("./") {
                entryName = String(entryName.dropFirst(2))
            }

            // Strip the first directory component (like --strip-components=1)
            if let firstSlashIndex = entryName.firstIndex(of: "/") {
                entryName = String(entryName[entryName.index(after: firstSlashIndex)...])
            } else {
                // Skip entries that don't have a directory component
                continue
            }

            // Skip empty entries
            if entryName.isEmpty { continue }

            let destinationURL = URL(fileURLWithPath: destinationPath).appendingPathComponent(entryName)

            if entry.info.type == .directory {
                // Create directory
                try? fileManager.createDirectory(at: destinationURL, withIntermediateDirectories: true, attributes: nil)
            } else if entry.info.type == .regular {
                // Create parent directory if needed
                let parentDir = destinationURL.deletingLastPathComponent()
                try? fileManager.createDirectory(at: parentDir, withIntermediateDirectories: true, attributes: nil)

                // Handle file renaming for specific model files
                var finalURL = destinationURL
                let fileName = destinationURL.lastPathComponent

                if fileName == "encoder-epoch-99-avg-1.onnx" {
                    finalURL = parentDir.appendingPathComponent("encoder.onnx")
                } else if fileName == "decoder-epoch-99-avg-1.onnx" {
                    finalURL = parentDir.appendingPathComponent("decoder.onnx")
                } else if fileName == "joiner-epoch-99-avg-1.int8.onnx" {
                    finalURL = parentDir.appendingPathComponent("joiner.onnx")
                }

                // Write file
                do {
                    try entryData.write(to: finalURL)
                } catch {
                    print("Failed to write file \(finalURL): \(error)")
                }
            }
        }

        // Check if files were extracted into a nested directory (for archives with ./ prefix)
        let nestedDirURL = URL(fileURLWithPath: destinationPath).appendingPathComponent(URL(fileURLWithPath: destinationPath).lastPathComponent)
        if fileManager.fileExists(atPath: nestedDirURL.path) {
            // Move files from nested directory to parent
            do {
                let nestedFiles = try fileManager.contentsOfDirectory(at: nestedDirURL, includingPropertiesForKeys: nil)
                for file in nestedFiles {
                    let destFile = URL(fileURLWithPath: destinationPath).appendingPathComponent(file.lastPathComponent)
                    try? fileManager.moveItem(at: file, to: destFile)
                }
                // Remove the now-empty nested directory
                try? fileManager.removeItem(at: nestedDirURL)
            } catch {
                print("Failed to handle nested directory: \(error)")
            }
        }
    }
}
