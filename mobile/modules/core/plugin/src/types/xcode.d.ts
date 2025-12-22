/**
 * Type declarations for the 'xcode' npm package (Apache Cordova)
 * @see https://github.com/apache/cordova-node-xcode
 * @see https://x.com/simulationapi
 */

declare module "xcode" {
  export interface XcodeProject {
    /**
     * Parse the project file synchronously
     */
    parseSync(): void

    /**
     * Write the project file back to disk synchronously
     */
    writeSync(): string

    /**
     * Get the first target in the project
     */
    getFirstTarget(): {uuid: string; firstTarget: PBXNativeTarget} | null

    /**
     * Get the first project
     */
    getFirstProject(): {uuid: string; firstProject: PBXProject} | null

    /**
     * Add a file to the project
     */
    addFile(path: string, group?: string, opt?: object): PBXFile | null

    /**
     * Add a framework to the project
     */
    addFramework(path: string, opt?: object): PBXFile | null

    /**
     * Generate a unique UUID for the project
     */
    generateUuid(): string

    /**
     * Hash containing all parsed objects
     */
    hash: {
      project: {
        objects: PBXObjects
        archiveVersion: string
        objectVersion: string
        rootObject: string
      }
    }

    /**
     * Add to PBXBuildFile section
     */
    addToPbxBuildFileSection(file: object): void

    /**
     * Add to Frameworks build phase
     */
    addToPbxFrameworksBuildPhase(file: object): void
  }

  export interface PBXObjects {
    PBXBuildFile: Record<string, PBXBuildFile | string>
    PBXFileReference: Record<string, PBXFileReference | string>
    PBXFrameworksBuildPhase: Record<string, PBXFrameworksBuildPhase | string>
    PBXGroup: Record<string, PBXGroup | string>
    PBXNativeTarget: Record<string, PBXNativeTarget | string>
    PBXProject: Record<string, PBXProject | string>
    PBXSourcesBuildPhase: Record<string, PBXSourcesBuildPhase | string>
    XCBuildConfiguration: Record<string, XCBuildConfiguration | string>
    XCConfigurationList: Record<string, XCConfigurationList | string>
    XCRemoteSwiftPackageReference?: Record<string, XCRemoteSwiftPackageReference | string>
    XCSwiftPackageProductDependency?: Record<string, XCSwiftPackageProductDependency | string>
  }

  export interface PBXBuildFile {
    isa: "PBXBuildFile"
    fileRef?: string
    productRef?: string
    settings?: object
  }

  export interface PBXFileReference {
    isa: "PBXFileReference"
    name?: string
    path: string
    sourceTree: string
  }

  export interface PBXFrameworksBuildPhase {
    isa: "PBXFrameworksBuildPhase"
    buildActionMask: number
    files: string[]
    runOnlyForDeploymentPostprocessing: number
  }

  export interface PBXGroup {
    isa: "PBXGroup"
    children: string[]
    name?: string
    path?: string
    sourceTree: string
  }

  export interface PBXNativeTarget {
    isa: "PBXNativeTarget"
    buildConfigurationList: string
    buildPhases: string[]
    buildRules: string[]
    dependencies: string[]
    name: string
    packageProductDependencies?: string[]
    productName: string
    productReference: string
    productType: string
  }

  export interface PBXProject {
    isa: "PBXProject"
    buildConfigurationList: string
    compatibilityVersion: string
    developmentRegion: string
    hasScannedForEncodings: number
    knownRegions: string[]
    mainGroup: string
    packageReferences?: string[]
    productRefGroup: string
    projectDirPath: string
    projectRoot: string
    targets: string[]
  }

  export interface PBXSourcesBuildPhase {
    isa: "PBXSourcesBuildPhase"
    buildActionMask: number
    files: string[]
    runOnlyForDeploymentPostprocessing: number
  }

  export interface XCBuildConfiguration {
    isa: "XCBuildConfiguration"
    buildSettings: Record<string, string | string[]>
    name: string
  }

  export interface XCConfigurationList {
    isa: "XCConfigurationList"
    buildConfigurations: string[]
    defaultConfigurationIsVisible: number
    defaultConfigurationName: string
  }

  export interface XCRemoteSwiftPackageReference {
    isa: "XCRemoteSwiftPackageReference"
    repositoryURL: string
    requirement: {
      kind: "upToNextMajorVersion" | "upToNextMinorVersion" | "exactVersion" | "branch" | "revision"
      minimumVersion?: string
      version?: string
      branch?: string
      revision?: string
    }
  }

  export interface XCSwiftPackageProductDependency {
    isa: "XCSwiftPackageProductDependency"
    package: string
    productName: string
  }

  export interface PBXFile {
    uuid: string
    fileRef: string
    basename: string
    group?: string
  }

  /**
   * Create a new XcodeProject from a project.pbxproj file path
   */
  export function project(projectPath: string): XcodeProject
}
