import RNFS from "react-native-fs"
import {Platform} from "react-native"
import {NativeModules} from "react-native"

const {AOSModule, FileProviderModule} = NativeModules

export interface ModelInfo {
  name: string
  version: string
  size: number
  language: string
  downloaded: boolean
  path?: string
}

export interface DownloadProgress {
  jobId: number
  bytesWritten: number
  contentLength: number
  percentage: number
}

export interface ExtractionProgress {
  percentage: number
  currentFile?: string
}

class STTModelManager {
  private static instance: STTModelManager
  private downloadJobId?: number
  private currentModel = "sherpa-onnx-nemo-streaming-fast-conformer-ctc-en-80ms-int8"
  private modelBaseUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"

  private constructor() {}

  static getInstance(): STTModelManager {
    if (!STTModelManager.instance) {
      STTModelManager.instance = new STTModelManager()
    }
    return STTModelManager.instance
  }

  getModelDirectory(): string {
    const baseDir = Platform.OS === "ios" ? RNFS.DocumentDirectoryPath : RNFS.DocumentDirectoryPath
    return `${baseDir}/stt_models`
  }

  getModelPath(): string {
    return `${this.getModelDirectory()}/${this.currentModel}`
  }

  async isModelAvailable(): Promise<boolean> {
    try {
      const modelPath = this.getModelPath()
      const requiredFiles = ["encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt"]

      for (const file of requiredFiles) {
        const filePath = `${modelPath}/${file}`
        const exists = await RNFS.exists(filePath)
        if (!exists) {
          return false
        }
      }

      // Validate model with native module
      const nativeModule = Platform.OS === "ios" ? AOSModule : FileProviderModule
      if (nativeModule.validateSTTModel) {
        return await nativeModule.validateSTTModel(modelPath)
      }

      return true
    } catch (error) {
      console.error("Error checking model availability:", error)
      return false
    }
  }

  async getModelInfo(): Promise<ModelInfo> {
    const downloaded = await this.isModelAvailable()
    const path = downloaded ? this.getModelPath() : undefined

    return {
      name: "NVIDIA NeMo Conformer CTC",
      version: "80ms-int8",
      size: 45 * 1024 * 1024, // 45MB
      language: "English",
      downloaded,
      path,
    }
  }

  async downloadModel(
    onProgress?: (progress: DownloadProgress) => void,
    onExtractionProgress?: (progress: ExtractionProgress) => void,
  ): Promise<void> {
    const modelUrl = `${this.modelBaseUrl}${this.currentModel}.tar.bz2`
    const tempPath = `${RNFS.TemporaryDirectoryPath}/${this.currentModel}.tar.bz2`
    const modelDir = this.getModelDirectory()
    const finalPath = this.getModelPath()

    try {
      // Create directories
      await RNFS.mkdir(modelDir, {NSURLIsExcludedFromBackupKey: true})

      // Download the model
      const downloadOptions = {
        fromUrl: modelUrl,
        toFile: tempPath,
        progress: (res: RNFS.DownloadProgressCallbackResult) => {
          const percentage = Math.round((res.bytesWritten / res.contentLength) * 100)
          onProgress?.({
            jobId: res.jobId,
            bytesWritten: res.bytesWritten,
            contentLength: res.contentLength,
            percentage,
          })
        },
        progressDivider: 10, // Update every 10%
        begin: (res: RNFS.DownloadBeginCallbackResult) => {
          console.log("Download started:", res)
        },
        connectionTimeout: 30000,
        readTimeout: 30000,
      }

      const result = await RNFS.downloadFile(downloadOptions)
      this.downloadJobId = result.jobId

      const downloadResult = await result.promise

      if (downloadResult.statusCode !== 200) {
        throw new Error(`Download failed with status code: ${downloadResult.statusCode}`)
      }

      console.log("Download completed, extracting...")

      // Extract the tar.bz2 file
      onExtractionProgress?.({percentage: 0})

      // Use the appropriate native module for extraction
      const nativeModule = Platform.OS === "ios" ? AOSModule : FileProviderModule

      if (nativeModule.extractTarBz2) {
        await nativeModule.extractTarBz2(tempPath, finalPath)
      } else {
        throw new Error("Model extraction not available on this platform.")
      }

      onExtractionProgress?.({percentage: 100})

      // Clean up temp file
      await RNFS.unlink(tempPath)

      // Set the model path in native modules
      await this.setNativeModelPath(finalPath)

      console.log("Model downloaded and extracted successfully")
    } catch (error) {
      // Clean up on error
      if (await RNFS.exists(tempPath)) {
        await RNFS.unlink(tempPath)
      }
      if (await RNFS.exists(finalPath)) {
        await RNFS.unlink(finalPath)
      }
      throw error
    }
  }

  async cancelDownload(): Promise<void> {
    if (this.downloadJobId !== undefined) {
      await RNFS.stopDownload(this.downloadJobId)
      this.downloadJobId = undefined
    }
  }

  async deleteModel(): Promise<void> {
    const modelPath = this.getModelPath()
    if (await RNFS.exists(modelPath)) {
      await RNFS.unlink(modelPath)
    }
  }

  private async setNativeModelPath(path: string): Promise<void> {
    const nativeModule = Platform.OS === "ios" ? AOSModule : FileProviderModule
    if (nativeModule.setSTTModelPath) {
      await nativeModule.setSTTModelPath(path)
    }
  }

  async getStorageInfo(): Promise<{free: number; total: number}> {
    const fsInfo = await RNFS.getFSInfo()
    return {
      free: fsInfo.freeSpace,
      total: fsInfo.totalSpace,
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }
}

export default STTModelManager.getInstance()
