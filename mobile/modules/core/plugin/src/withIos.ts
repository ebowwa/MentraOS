import {execSync} from "child_process"
import fs from "fs"
import path from "path"

import {type ConfigPlugin, withPodfile, withDangerousMod, withAppDelegate} from "expo/config-plugins"

/**
 * Add project specification after platform declaration
 */
function addProjectSpecification(podfileContent: string): string {
  // Check if already added
  if (podfileContent.includes("project 'MentraOS.xcodeproj'")) {
    return podfileContent
  }
  // Find platform declaration and add project specification after it
  const platformRegex = /(platform :ios[^\n]+\n)/
  const match = podfileContent.match(platformRegex)
  if (match) {
    const projectSpec = `\n# Specify which Xcode project to use\nproject 'MentraOS.xcodeproj'\n`
    return podfileContent.replace(platformRegex, `$1${projectSpec}`)
  }
  return podfileContent
}

/**
 * Add pod dependencies for onnxruntime-objc and SWCompression
 */
function addPodDependencies(podfileContent: string): string {
  // Check if already added
  if (podfileContent.includes("pod 'onnxruntime-objc'")) {
    return podfileContent
  }
  // Find the config = use_native_modules! line and add pods before use_frameworks!
  const nativeModulesRegex = /(config = use_native_modules!\([^)]+\)\n)/
  const match = podfileContent.match(nativeModulesRegex)
  if (match) {
    const podDependencies = `
    # Add SWCompression for TarBz2Extractor functionality
    pod 'onnxruntime-objc', '1.18.0', :modular_headers => true
    pod 'SWCompression', '~> 4.8.0'
  `
    return podfileContent.replace(nativeModulesRegex, `$1${podDependencies}\n`)
  }
  return podfileContent
}

/**
 * Add post_install configuration to exclude PrivacyInfo.xcprivacy files
 */
function addPostInstallConfiguration(podfileContent: string): string {
  // Check if privacy exclusion is already added
  if (podfileContent.includes("EXCLUDED_SOURCE_FILE_NAMES")) {
    return podfileContent
  }
  // Find the post_install block and add the configuration before the closing 'end'
  const postInstallRegex =
    /(post_install do \|installer\|[\s\S]*?react_native_post_install\([^)]*\)[\s\S]*?\))([\s\S]*?)(end[\s]*end)/
  const match = podfileContent.match(postInstallRegex)
  if (match) {
    const privacyExclusion = `
      installer.pods_project.targets.each do |target|
          target.build_configurations.each do |config|
          config.build_settings['EXCLUDED_SOURCE_FILE_NAMES'] = 'PrivacyInfo.xcprivacy'
          end
      end`
    return podfileContent.replace(postInstallRegex, `$1${privacyExclusion}\n  $3`)
  }
  return podfileContent
}

const modifyPodfile: ConfigPlugin = config => {
  return withPodfile(config, config => {
    const podfileContent = config.modResults.contents
    // Apply all Podfile modifications
    let modifiedContent = podfileContent
    // 1. Add project specification after platform declaration
    modifiedContent = addProjectSpecification(modifiedContent)
    // 2. Add pod dependencies in the target block
    modifiedContent = addPodDependencies(modifiedContent)
    // 3. Add post_install configuration
    modifiedContent = addPostInstallConfiguration(modifiedContent)
    config.modResults.contents = modifiedContent
    return config
  })
}

const withXcodeEnvLocal: ConfigPlugin = config => {
  return withDangerousMod(config, [
    "ios",
    async config => {
      try {
        // Get node executable path
        const nodeExecutable = execSync("which node", {encoding: "utf-8"}).trim()

        // Path to .xcode.env.local
        const iosPath = path.join(config.modRequest.platformProjectRoot)
        const xcodeEnvLocalPath = path.join(iosPath, ".xcode.env.local")

        // Content to write
        const content = `export NODE_BINARY=${nodeExecutable}\n`

        // Write or append to .xcode.env.local
        if (fs.existsSync(xcodeEnvLocalPath)) {
          const existingContent = fs.readFileSync(xcodeEnvLocalPath, "utf-8")
          if (!existingContent.includes("NODE_BINARY")) {
            fs.appendFileSync(xcodeEnvLocalPath, content)
          }
        } else {
          fs.writeFileSync(xcodeEnvLocalPath, content)
        }
      } catch (error) {
        console.warn("Failed to create .xcode.env.local:", error)
      }

      return config
    },
  ])
}

/**
 * Add Meta AI URL callback handling to AppDelegate
 * This allows the app to receive callbacks from Meta AI app after registration/permission approval
 */
const withMetaUrlHandler: ConfigPlugin = config => {
  return withAppDelegate(config, config => {
    let contents = config.modResults.contents

    // Check if already added
    if (contents.includes("metaWearablesAction")) {
      console.log("[withMetaUrlHandler] Meta URL handler already exists")
      return config
    }

    console.log("[withMetaUrlHandler] Adding Meta URL callback handling...")

    // Look for the existing openURL method and inject Meta handling at the start
    // Pattern: public override func application(_ app: UIApplication, open url: URL, options: ...) -> Bool {
    //            return super.application(app, open: url, options: options) || RCTLinkingManager...
    const openUrlMethodRegex =
      /(public override func application\(\s*_ app: UIApplication,\s*open url: URL,\s*options:[^)]+\)\s*->\s*Bool\s*\{\s*\n)(\s*return )/

    const match = contents.match(openUrlMethodRegex)
    if (match) {
      const metaUrlCheck = `    // Handle Meta AI app callbacks for DAT SDK registration
    if let components = URLComponents(url: url, resolvingAgainstBaseURL: true),
       components.queryItems?.contains(where: { $0.name == "metaWearablesAction" }) == true {
      NotificationCenter.default.post(name: Notification.Name("MetaAICallback"), object: url)
      return true
    }
    `
      contents = contents.replace(openUrlMethodRegex, `$1${metaUrlCheck}$2`)
      config.modResults.contents = contents
      console.log("[withMetaUrlHandler] Successfully added Meta URL handler!")
    } else {
      console.warn("[withMetaUrlHandler] Could not find openURL method to inject handler")
    }

    return config
  })
}

/**
 * Add Meta Wearables DAT SDK Swift Package to Xcode project
 * Uses regex-based manipulation (xcode package has serialization issues with SPM structures)
 * @see https://x.com/simulationapi
 */
const withMetaWearablesSPM: ConfigPlugin = config => {
  return withDangerousMod(config, [
    "ios",
    async config => {
      const projectRoot = config.modRequest.platformProjectRoot
      const projectPath = path.join(projectRoot, "MentraOS.xcodeproj", "project.pbxproj")

      if (!fs.existsSync(projectPath)) {
        console.warn("[withMetaWearablesSPM] project.pbxproj not found at:", projectPath)
        return config
      }

      let projectContent = fs.readFileSync(projectPath, "utf-8")

      // Check if MetaWearablesDAT package is already added
      if (projectContent.includes("meta-wearables-dat-ios")) {
        console.log("[withMetaWearablesSPM] MetaWearablesDAT package already exists")
        return config
      }

      console.log("[withMetaWearablesSPM] Adding MetaWearablesDAT Swift Package...")

      // Generate UUIDs (24 hex characters)
      const generateUuid = (): string => {
        const chars = "0123456789ABCDEF"
        let uuid = ""
        for (let i = 0; i < 24; i++) {
          uuid += chars[Math.floor(Math.random() * 16)]
        }
        return uuid
      }

      const packageRefId = generateUuid()
      const mwdatCoreDepId = generateUuid()
      const mwdatCameraDepId = generateUuid()
      const mwdatCoreBuildFileId = generateUuid()
      const mwdatCameraBuildFileId = generateUuid()

      // Find project root object UUID using regex
      const rootObjMatch = projectContent.match(/rootObject = ([A-F0-9]{24})/)
      const projectUuid = rootObjMatch ? rootObjMatch[1] : null

      // Find main target UUID (look for PBXNativeTarget with productType = application)
      const targetMatch = projectContent.match(/([A-F0-9]{24}) \/\* MentraOS \*\/ = \{\s*isa = PBXNativeTarget/)
      const targetUuid = targetMatch ? targetMatch[1] : null

      // Find Frameworks build phase ID
      const frameworksMatch = projectContent.match(
        /([A-F0-9]{24}) \/\* Frameworks \*\/ = \{\s*isa = PBXFrameworksBuildPhase/,
      )
      const frameworksBuildPhaseId = frameworksMatch ? frameworksMatch[1] : null

      // 1. Add PBXBuildFile entries
      const buildFileEntry = `\t\t${mwdatCoreBuildFileId} /* MWDATCore in Frameworks */ = {isa = PBXBuildFile; productRef = ${mwdatCoreDepId} /* MWDATCore */; };
\t\t${mwdatCameraBuildFileId} /* MWDATCamera in Frameworks */ = {isa = PBXBuildFile; productRef = ${mwdatCameraDepId} /* MWDATCamera */; };`

      projectContent = projectContent.replace(
        "/* Begin PBXBuildFile section */",
        `/* Begin PBXBuildFile section */\n${buildFileEntry}`,
      )

      // 2. Add to Frameworks build phase files
      if (frameworksBuildPhaseId) {
        const frameworkFilesRegex = new RegExp(`(${frameworksBuildPhaseId}[^}]+files = \\()`, "s")
        projectContent = projectContent.replace(
          frameworkFilesRegex,
          `$1\n\t\t\t\t${mwdatCoreBuildFileId} /* MWDATCore in Frameworks */,\n\t\t\t\t${mwdatCameraBuildFileId} /* MWDATCamera in Frameworks */,`,
        )
      }

      // 3. Add packageReferences to PBXProject (insert after targets array)
      if (projectUuid) {
        // Find the targets = (...); line in PBXProject and add packageReferences after it
        const targetsEndRegex = new RegExp(`(${projectUuid}[\\s\\S]*?targets = \\([\\s\\S]*?\\);)`, "m")
        if (!projectContent.includes("packageReferences = (")) {
          projectContent = projectContent.replace(
            targetsEndRegex,
            `$1\n\t\t\tpackageReferences = (\n\t\t\t\t${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */,\n\t\t\t);`,
          )
        }
      }

      // 4. Add packageProductDependencies to target
      if (targetUuid) {
        const targetRegex = new RegExp(`(${targetUuid}[^}]+)(productName)`, "s")
        if (!projectContent.match(new RegExp(`${targetUuid}[^}]+packageProductDependencies`))) {
          projectContent = projectContent.replace(
            targetRegex,
            `$1packageProductDependencies = (\n\t\t\t\t${mwdatCoreDepId} /* MWDATCore */,\n\t\t\t\t${mwdatCameraDepId} /* MWDATCamera */,\n\t\t\t);\n\t\t\t$2`,
          )
        }
      }

      // 5. Add XCRemoteSwiftPackageReference section
      const packageRefSection = `/* Begin XCRemoteSwiftPackageReference section */
\t\t${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */ = {
\t\t\tisa = XCRemoteSwiftPackageReference;
\t\t\trepositoryURL = "https://github.com/facebook/meta-wearables-dat-ios";
\t\t\trequirement = {
\t\t\t\tkind = upToNextMajorVersion;
\t\t\t\tminimumVersion = 0.3.0;
\t\t\t};
\t\t};
/* End XCRemoteSwiftPackageReference section */

`
      if (projectContent.includes("/* Begin XCRemoteSwiftPackageReference section */")) {
        projectContent = projectContent.replace(
          /\/\* Begin XCRemoteSwiftPackageReference section \*\/\n/,
          `/* Begin XCRemoteSwiftPackageReference section */
\t\t${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */ = {
\t\t\tisa = XCRemoteSwiftPackageReference;
\t\t\trepositoryURL = "https://github.com/facebook/meta-wearables-dat-ios";
\t\t\trequirement = {
\t\t\t\tkind = upToNextMajorVersion;
\t\t\t\tminimumVersion = 0.3.0;
\t\t\t};
\t\t};
`,
        )
      } else {
        const insertPoint = projectContent.lastIndexOf("/* End XCConfigurationList section */")
        if (insertPoint !== -1) {
          const endOfSection = projectContent.indexOf("\n", insertPoint) + 1
          projectContent =
            projectContent.slice(0, endOfSection) + "\n" + packageRefSection + projectContent.slice(endOfSection)
        }
      }

      // 6. Add XCSwiftPackageProductDependency section
      const productDepSection = `/* Begin XCSwiftPackageProductDependency section */
\t\t${mwdatCoreDepId} /* MWDATCore */ = {
\t\t\tisa = XCSwiftPackageProductDependency;
\t\t\tpackage = ${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */;
\t\t\tproductName = MWDATCore;
\t\t};
\t\t${mwdatCameraDepId} /* MWDATCamera */ = {
\t\t\tisa = XCSwiftPackageProductDependency;
\t\t\tpackage = ${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */;
\t\t\tproductName = MWDATCamera;
\t\t};
/* End XCSwiftPackageProductDependency section */

`
      if (projectContent.includes("/* Begin XCSwiftPackageProductDependency section */")) {
        projectContent = projectContent.replace(
          /\/\* Begin XCSwiftPackageProductDependency section \*\/\n/,
          `/* Begin XCSwiftPackageProductDependency section */
\t\t${mwdatCoreDepId} /* MWDATCore */ = {
\t\t\tisa = XCSwiftPackageProductDependency;
\t\t\tpackage = ${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */;
\t\t\tproductName = MWDATCore;
\t\t};
\t\t${mwdatCameraDepId} /* MWDATCamera */ = {
\t\t\tisa = XCSwiftPackageProductDependency;
\t\t\tpackage = ${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */;
\t\t\tproductName = MWDATCamera;
\t\t};
`,
        )
      } else {
        const insertPoint = projectContent.lastIndexOf("/* End XCRemoteSwiftPackageReference section */")
        if (insertPoint !== -1) {
          const endOfSection = projectContent.indexOf("\n", insertPoint) + 1
          projectContent =
            projectContent.slice(0, endOfSection) + "\n" + productDepSection + projectContent.slice(endOfSection)
        }
      }

      fs.writeFileSync(projectPath, projectContent, "utf-8")
      console.log("[withMetaWearablesSPM] Successfully added MetaWearablesDAT Swift Package!")

      // Resolve SPM package dependencies (download from GitHub)
      console.log("[withMetaWearablesSPM] Resolving package dependencies...")
      try {
        const xcprojPath = path.join(projectRoot, "MentraOS.xcodeproj")
        execSync(`xcodebuild -project "${xcprojPath}" -resolvePackageDependencies`, {
          cwd: projectRoot,
          stdio: "pipe",
          timeout: 120000, // 2 minute timeout
        })
        console.log("[withMetaWearablesSPM] Package dependencies resolved successfully!")
      } catch (error: any) {
        console.warn("[withMetaWearablesSPM] Failed to resolve package dependencies automatically.")
        console.warn("[withMetaWearablesSPM] You may need to open Xcode and let it resolve packages.")
        if (error.message) {
          console.warn("[withMetaWearablesSPM] Error:", error.message.slice(0, 200))
        }
      }

      return config
    },
  ])
}

export const withIosConfiguration: ConfigPlugin<{node?: boolean}> = (config, props) => {
  config = modifyPodfile(config)
  config = withMetaUrlHandler(config)
  config = withMetaWearablesSPM(config)
  // Note: MWDAT configuration is now in app.config.ts infoPlist directly
  // to include AppLinkURLScheme, MetaAppID, ClientToken, and Analytics
  if (props?.node) {
    config = withXcodeEnvLocal(config)
  }
  return config
}
