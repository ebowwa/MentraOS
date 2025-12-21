import { execSync } from "child_process"
import fs from "fs"
import path from "path"

import { type ConfigPlugin, withPodfile, withDangerousMod, withAppDelegate } from "expo/config-plugins"

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
        const nodeExecutable = execSync("which node", { encoding: "utf-8" }).trim()

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
    const openUrlMethodRegex = /(public override func application\(\s*_ app: UIApplication,\s*open url: URL,\s*options:[^)]+\)\s*->\s*Bool\s*\{\s*\n)(\s*return )/

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
 * This automates adding the SPM dependency so you don't have to do it manually after prebuild
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

      // Generate UUIDs for the package reference and dependencies
      const packageRefId = generatePbxUUID()
      const mwdatCoreDepId = generatePbxUUID()
      const mwdatCameraDepId = generatePbxUUID()
      const mwdatCoreProdId = generatePbxUUID()
      const mwdatCameraProdId = generatePbxUUID()
      const frameworkBuildPhaseId = findFrameworksBuildPhaseId(projectContent)

      // 1. Add XCRemoteSwiftPackageReference to the project
      const packageReference = `
		${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */ = {
			isa = XCRemoteSwiftPackageReference;
			repositoryURL = "https://github.com/facebook/meta-wearables-dat-ios";
			requirement = {
				kind = upToNextMajorVersion;
				minimumVersion = 0.3.0;
			};
		};`

      // 2. Add XCSwiftPackageProductDependency entries
      const productDependencies = `
		${mwdatCoreDepId} /* MWDATCore */ = {
			isa = XCSwiftPackageProductDependency;
			package = ${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */;
			productName = MWDATCore;
		};
		${mwdatCameraDepId} /* MWDATCamera */ = {
			isa = XCSwiftPackageProductDependency;
			package = ${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */;
			productName = MWDATCamera;
		};`

      // 3. Add PBXBuildFile entries for the frameworks
      const buildFileEntries = `
		${mwdatCoreProdId} /* MWDATCore in Frameworks */ = {isa = PBXBuildFile; productRef = ${mwdatCoreDepId} /* MWDATCore */; };
		${mwdatCameraProdId} /* MWDATCamera in Frameworks */ = {isa = PBXBuildFile; productRef = ${mwdatCameraDepId} /* MWDATCamera */; };`

      // Insert package reference into XCRemoteSwiftPackageReference section (or create it)
      if (projectContent.includes("/* Begin XCRemoteSwiftPackageReference section */")) {
        projectContent = projectContent.replace(
          "/* Begin XCRemoteSwiftPackageReference section */",
          `/* Begin XCRemoteSwiftPackageReference section */${packageReference}`
        )
      } else {
        // Create the section before XCSwiftPackageProductDependency or at end
        const insertPoint = projectContent.lastIndexOf("/* End XCConfigurationList section */")
        if (insertPoint !== -1) {
          const sectionToInsert = `
/* Begin XCRemoteSwiftPackageReference section */${packageReference}
/* End XCRemoteSwiftPackageReference section */

`
          projectContent = projectContent.slice(0, insertPoint) + sectionToInsert + projectContent.slice(insertPoint)
        }
      }

      // Insert product dependencies into XCSwiftPackageProductDependency section (or create it)
      if (projectContent.includes("/* Begin XCSwiftPackageProductDependency section */")) {
        projectContent = projectContent.replace(
          "/* Begin XCSwiftPackageProductDependency section */",
          `/* Begin XCSwiftPackageProductDependency section */${productDependencies}`
        )
      } else {
        const insertPoint = projectContent.lastIndexOf("/* End XCRemoteSwiftPackageReference section */")
        if (insertPoint !== -1) {
          const endOfSection = projectContent.indexOf("\n", insertPoint) + 1
          const sectionToInsert = `
/* Begin XCSwiftPackageProductDependency section */${productDependencies}
/* End XCSwiftPackageProductDependency section */

`
          projectContent = projectContent.slice(0, endOfSection) + sectionToInsert + projectContent.slice(endOfSection)
        }
      }

      // Insert build file entries into PBXBuildFile section
      projectContent = projectContent.replace(
        "/* Begin PBXBuildFile section */",
        `/* Begin PBXBuildFile section */${buildFileEntries}`
      )

      // Add to packageReferences in PBXProject section
      const packageRefsMatch = projectContent.match(/packageReferences = \(\s*\n([^)]*)\);/)
      if (packageRefsMatch) {
        const newPackageRef = `				${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */,\n`
        projectContent = projectContent.replace(
          packageRefsMatch[0],
          packageRefsMatch[0].replace("packageReferences = (\n", `packageReferences = (\n${newPackageRef}`)
        )
      } else {
        // Add packageReferences array to PBXProject if it doesn't exist
        const projectSectionMatch = projectContent.match(/(\s+buildConfigurationList = [^;]+;)(\s+compatibilityVersion)/)
        if (projectSectionMatch) {
          const newPackageRefs = `\n				packageReferences = (\n					${packageRefId} /* XCRemoteSwiftPackageReference "meta-wearables-dat-ios" */,\n				);`
          projectContent = projectContent.replace(
            projectSectionMatch[0],
            projectSectionMatch[1] + newPackageRefs + projectSectionMatch[2]
          )
        }
      }

      // Add packageProductDependencies to target
      const targetPackageDepsMatch = projectContent.match(/packageProductDependencies = \(\s*\n([^)]*)\);/)
      if (targetPackageDepsMatch) {
        const newDeps = `				${mwdatCoreDepId} /* MWDATCore */,\n				${mwdatCameraDepId} /* MWDATCamera */,\n`
        projectContent = projectContent.replace(
          targetPackageDepsMatch[0],
          targetPackageDepsMatch[0].replace("packageProductDependencies = (\n", `packageProductDependencies = (\n${newDeps}`)
        )
      } else {
        // Add packageProductDependencies array to target
        const targetMatch = projectContent.match(/(name = MentraOS;\s+packageProductDependencies)|(productName = MentraOS;\s+productReference)/)
        if (targetMatch) {
          // Find the target section and add packageProductDependencies
          const buildRulesMatch = projectContent.match(/buildRules = \(\s*\);/)
          if (buildRulesMatch) {
            const newDeps = `\n				packageProductDependencies = (\n					${mwdatCoreDepId} /* MWDATCore */,\n					${mwdatCameraDepId} /* MWDATCamera */,\n				);`
            projectContent = projectContent.replace(
              buildRulesMatch[0],
              buildRulesMatch[0] + newDeps
            )
          }
        }
      }

      // Add to Frameworks build phase
      if (frameworkBuildPhaseId) {
        const frameworkFilesMatch = projectContent.match(new RegExp(`${frameworkBuildPhaseId}[^}]+files = \\(\\s*\\n([^)]*)`))
        if (frameworkFilesMatch) {
          const newFiles = `				${mwdatCoreProdId} /* MWDATCore in Frameworks */,\n				${mwdatCameraProdId} /* MWDATCamera in Frameworks */,\n`
          projectContent = projectContent.replace(
            frameworkFilesMatch[0],
            frameworkFilesMatch[0].replace("files = (\n", `files = (\n${newFiles}`)
          )
        }
      }

      fs.writeFileSync(projectPath, projectContent, "utf-8")
      console.log("[withMetaWearablesSPM] Successfully added MetaWearablesDAT Swift Package!")

      return config
    },
  ])
}

/**
 * Generate a unique ID for pbxproj entries (24 hex chars)
 */
function generatePbxUUID(): string {
  const chars = "0123456789ABCDEF"
  let uuid = ""
  for (let i = 0; i < 24; i++) {
    uuid += chars[Math.floor(Math.random() * 16)]
  }
  return uuid
}

/**
 * Find the Frameworks build phase ID for the main target
 */
function findFrameworksBuildPhaseId(content: string): string | null {
  const match = content.match(/([A-F0-9]{24}) \/\* Frameworks \*\/ = \{\s*isa = PBXFrameworksBuildPhase/)
  return match ? match[1] : null
}

export const withIosConfiguration: ConfigPlugin<{ node?: boolean }> = (config, props) => {
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
