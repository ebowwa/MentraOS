package com.mentra.mentra;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

public class FileProviderModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private static final String AUTHORITY = "com.mentra.mentra.provider";
    private static final String STT_MODEL_PATH_KEY = "stt_model_path";
    private static final String STT_MODEL_LANGUAGE_KEY = "stt_model_language";
    private static final String PREFS_NAME = "AugmentosPrefs";

    public FileProviderModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return "FileProviderModule";
    }

    /**
     * Convert a file path to a content:// URI using FileProvider
     *
     * @param filePath Absolute path to the file
     * @param promise Promise to resolve with the content URI
     */
    @ReactMethod
    public void getUriForFile(String filePath, Promise promise) {
        try {
            // Log debug info
            System.out.println("FileProviderModule: getUriForFile called with path: " + filePath);
            
            File file = new File(filePath);
            
            if (!file.exists()) {
                System.out.println("FileProviderModule: File does not exist: " + filePath);
                promise.reject("FILE_NOT_FOUND", "The file does not exist: " + filePath);
                return;
            }
            
            System.out.println("FileProviderModule: File exists, size: " + file.length() + " bytes");
            System.out.println("FileProviderModule: Using authority: " + AUTHORITY);
            
            Context context = reactContext.getApplicationContext();
            Uri contentUri = FileProvider.getUriForFile(
                context,
                AUTHORITY,
                file
            );
            
            System.out.println("FileProviderModule: Content URI created: " + contentUri.toString());
            promise.resolve(contentUri.toString());
        } catch (Exception e) {
            System.out.println("FileProviderModule: Error: " + e.getMessage());
            e.printStackTrace();
            promise.reject("FILE_PROVIDER_ERROR", e.getMessage(), e);
        }
    }
    
    /**
     * Share a file directly using an Intent
     * 
     * @param filePath Path to the file to share
     * @param mimeType MIME type of the file
     * @param title Title for the share dialog
     * @param message Optional message to include with the share
     * @param promise Promise to resolve when sharing is complete
     */
    @ReactMethod
    public void shareFile(String filePath, String mimeType, String title, String message, Promise promise) {
        try {
            System.out.println("FileProviderModule: shareFile called with path: " + filePath);
            
            File file = new File(filePath);
            if (!file.exists()) {
                System.out.println("FileProviderModule: File does not exist: " + filePath);
                promise.reject("FILE_NOT_FOUND", "The file does not exist: " + filePath);
                return;
            }
            
            Context context = reactContext.getApplicationContext();
            Uri contentUri = FileProvider.getUriForFile(
                context,
                AUTHORITY,
                file
            );
            
            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_SEND);
            intent.setType(mimeType);
            intent.putExtra(android.content.Intent.EXTRA_STREAM, contentUri);
            
            if (message != null && !message.isEmpty()) {
                intent.putExtra(android.content.Intent.EXTRA_TEXT, message);
            }
            
            intent.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            
            // Create chooser intent
            android.content.Intent chooser = android.content.Intent.createChooser(intent, title);
            chooser.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            
            context.startActivity(chooser);
            promise.resolve(true);
        } catch (Exception e) {
            System.out.println("FileProviderModule: Error sharing: " + e.getMessage());
            e.printStackTrace();
            promise.reject("SHARE_ERROR", e.getMessage(), e);
        }
    }

    // STT Model Management Methods
    @ReactMethod
    public void setSttModelDetails(String path, String languageCode, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
            .putString(STT_MODEL_LANGUAGE_KEY, languageCode)
            .putString(STT_MODEL_PATH_KEY, path)
            .apply();

            System.out.println("FileProviderModule: Setting STT model path to: " + path);
            System.out.println("FileProviderModule: Setting STT model language to: " + languageCode);
            
            
            // Also set it as a system property for SherpaOnnxTranscriber to access
            System.setProperty("stt.model.path", path);
            System.setProperty("stt.model.language", languageCode);
            
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("STT_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void getSTTModelPath(Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String modelPath = prefs.getString(STT_MODEL_PATH_KEY, null);
            promise.resolve(modelPath);
        } catch (Exception e) {
            promise.reject("STT_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void isSTTModelAvailable(Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String modelPath = prefs.getString(STT_MODEL_PATH_KEY, null);
            
            if (modelPath == null) {
                promise.resolve(false);
                return;
            }
            
            File modelDir = new File(modelPath);
            
            // Check for tokens.txt (required for all models)
            File tokensFile = new File(modelDir, "tokens.txt");
            if (!tokensFile.exists()) {
                promise.resolve(false);
                return;
            }
            
            // Check for CTC model
            File ctcModelFile = new File(modelDir, "model.int8.onnx");
            if (ctcModelFile.exists()) {
                promise.resolve(true);
                return;
            }
            
            // Check for transducer model
            String[] transducerFiles = {"encoder.onnx", "decoder.onnx", "joiner.onnx"};
            for (String fileName : transducerFiles) {
                File file = new File(modelDir, fileName);
                if (!file.exists()) {
                    promise.resolve(false);
                    return;
                }
            }
            
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("STT_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void validateSTTModel(String path, Promise promise) {
        try {
            File modelDir = new File(path);
            
            // Check for tokens.txt (required for all models)
            File tokensFile = new File(modelDir, "tokens.txt");
            if (!tokensFile.exists()) {
                promise.resolve(false);
                return;
            }
            
            // Check for CTC model
            File ctcModelFile = new File(modelDir, "model.int8.onnx");
            if (ctcModelFile.exists()) {
                promise.resolve(true);
                return;
            }
            
            // Check for transducer model
            String[] transducerFiles = {"encoder.onnx", "decoder.onnx", "joiner.onnx"};
            for (String fileName : transducerFiles) {
                File file = new File(modelDir, fileName);
                if (!file.exists()) {
                    promise.resolve(false);
                    return;
                }
            }
            
            // TODO: Actually try to initialize SherpaOnnxTranscriber to validate
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("STT_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void extractTarBz2(String sourcePath, String destinationPath, Promise promise) {
        try {
            File sourceFile = new File(sourcePath);
            File destDir = new File(destinationPath);
            
            if (!sourceFile.exists()) {
                promise.reject("EXTRACTION_ERROR", "Source file does not exist");
                return;
            }
            
            // Create destination directory
            if (!destDir.exists()) {
                destDir.mkdirs();
            }
            
            // Extract tar.bz2
            try (FileInputStream fis = new FileInputStream(sourceFile);
                 BufferedInputStream bis = new BufferedInputStream(fis);
                 BZip2CompressorInputStream bzIn = new BZip2CompressorInputStream(bis);
                 TarArchiveInputStream tarIn = new TarArchiveInputStream(bzIn)) {
                
                TarArchiveEntry entry;
                String rootDirName = null;
                
                while ((entry = tarIn.getNextTarEntry()) != null) {
                    String entryName = entry.getName();
                    
                    // Remove leading ./ if present
                    if (entryName.startsWith("./")) {
                        entryName = entryName.substring(2);
                    }
                    
                    // Extract the root directory name if we haven't yet
                    if (rootDirName == null && entryName.contains("/")) {
                        rootDirName = entryName.substring(0, entryName.indexOf("/"));
                    }
                    
                    // Remove the root directory from the path to extract files directly to destDir
                    if (rootDirName != null && entryName.startsWith(rootDirName + "/")) {
                        entryName = entryName.substring(rootDirName.length() + 1);
                    }
                    
                    // Skip empty entries
                    if (entryName.isEmpty()) continue;
                    
                    File outputFile = new File(destDir, entryName);
                    
                    if (entry.isDirectory()) {
                        outputFile.mkdirs();
                    } else {
                        // Create parent directories if needed
                        outputFile.getParentFile().mkdirs();
                        
                        // Handle file renaming for the specific model files
                        if (entryName.equals("encoder-epoch-99-avg-1.onnx")) {
                            outputFile = new File(destDir, "encoder.onnx");
                        } else if (entryName.equals("decoder-epoch-99-avg-1.onnx")) {
                            outputFile = new File(destDir, "decoder.onnx");
                        } else if (entryName.equals("joiner-epoch-99-avg-1.int8.onnx")) {
                            outputFile = new File(destDir, "joiner.onnx");
                        }
                        
                        // Write file
                        try (FileOutputStream fos = new FileOutputStream(outputFile);
                             BufferedOutputStream bos = new BufferedOutputStream(fos)) {
                            
                            byte[] buffer = new byte[4096];
                            int count;
                            while ((count = tarIn.read(buffer)) != -1) {
                                bos.write(buffer, 0, count);
                            }
                        }
                    }
                }
            }
            
            // Check if files were extracted into a nested directory with the same name
            // This can happen with some tar archives that have ./ prefix
            File nestedDir = new File(destDir, destDir.getName());
            if (nestedDir.exists() && nestedDir.isDirectory()) {
                // Move all files from nested directory to parent
                File[] nestedFiles = nestedDir.listFiles();
                if (nestedFiles != null) {
                    for (File file : nestedFiles) {
                        File destFile = new File(destDir, file.getName());
                        file.renameTo(destFile);
                    }
                    // Delete the now-empty nested directory
                    nestedDir.delete();
                }
            }
            
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("EXTRACTION_ERROR", e.getMessage(), e);
        }
    }
}