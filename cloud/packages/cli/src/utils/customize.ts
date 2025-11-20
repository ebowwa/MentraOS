/**
 * Project customization utilities
 *
 * Handles customizing cloned templates with user-specific values
 */

import * as fs from "fs/promises"
import * as path from "path"

import {error} from "./output.js"

export interface ProjectConfig {
  packageName: string
  apiKey: string
  port?: number
}

/**
 * Checks if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Creates .env file with user's configuration
 */
export async function createEnvFile(projectDir: string, config: ProjectConfig): Promise<void> {
  try {
    const envPath = path.join(projectDir, ".env")
    const envExamplePath = path.join(projectDir, ".env.example")

    let envContent = ""

    // Try to read .env.example from the template
    if (await fileExists(envExamplePath)) {
      envContent = await fs.readFile(envExamplePath, "utf-8")

      // Replace placeholders with actual values
      envContent = envContent
        .replace(/PACKAGE_NAME=.*/, `PACKAGE_NAME=${config.packageName}`)
        .replace(/API_KEY=.*/, `API_KEY=${config.apiKey}`)

      if (config.port) {
        envContent = envContent.replace(/PORT=.*/, `PORT=${config.port}`)
      }
    } else {
      // Fallback: create a basic .env file
      envContent = `# MentraOS Configuration
PACKAGE_NAME=${config.packageName}
API_KEY=${config.apiKey}
PORT=${config.port || 3000}
MENTRA_OS_WEBSOCKET_URL=ws://localhost:8002/app-ws
NODE_ENV=development
`
    }

    // Write .env file
    await fs.writeFile(envPath, envContent.trim() + "\n")

    // Set secure permissions (owner read/write only)
    try {
      await fs.chmod(envPath, 0o600)
    } catch {
      // chmod might not work on all platforms, continue anyway
    }
  } catch (err) {
    if (err instanceof Error) {
      error(`Failed to create .env file: ${err.message}`)
      throw err
    }
    throw new Error("Failed to create .env file")
  }
}

/**
 * Updates package.json with project name
 */
export async function updatePackageJson(projectDir: string, projectName: string): Promise<void> {
  try {
    const pkgPath = path.join(projectDir, "package.json")

    if (!(await fileExists(pkgPath))) {
      // If package.json doesn't exist, skip (some templates might not have it)
      return
    }

    const pkgContent = await fs.readFile(pkgPath, "utf-8")
    const pkg = JSON.parse(pkgContent)

    // Update name and version
    pkg.name = projectName
    pkg.version = "0.1.0"

    // Write back
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
  } catch (err) {
    if (err instanceof Error) {
      error(`Failed to update package.json: ${err.message}`)
      throw err
    }
    throw new Error("Failed to update package.json")
  }
}

/**
 * Updates README with project-specific information
 */
export async function updateReadme(
  projectDir: string,
  projectName: string,
  packageName: string,
): Promise<void> {
  try {
    const readmePath = path.join(projectDir, "README.md")

    if (!(await fileExists(readmePath))) {
      // If README doesn't exist, skip
      return
    }

    let content = await fs.readFile(readmePath, "utf-8")

    // Replace common template placeholders
    content = content
      .replace(/# .+ Example/g, `# ${projectName}`)
      .replace(/your-package-name/g, packageName)
      .replace(/com\.example\.\w+/g, packageName)

    await fs.writeFile(readmePath, content)
  } catch {
    // If README update fails, it's not critical
    // Continue without error
  }
}

/**
 * Customizes the entire project
 */
export async function customizeProject(
  projectDir: string,
  projectName: string,
  config: ProjectConfig,
): Promise<void> {
  await createEnvFile(projectDir, config)
  await updatePackageJson(projectDir, projectName)
  await updateReadme(projectDir, projectName, config.packageName)
}
