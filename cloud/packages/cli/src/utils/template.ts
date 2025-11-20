/**
 * Template cloning utilities
 *
 * Handles cloning templates from GitHub repositories
 */

import degit from "degit"
import * as fs from "fs/promises"
import * as path from "path"

import {error} from "./output.js"

/**
 * Validates project name format
 */
export function validateProjectName(name: string): true | string {
  if (!name || name.trim().length === 0) {
    return "Project name is required"
  }

  if (!/^[a-z0-9-_]+$/i.test(name)) {
    return "Project name must contain only letters, numbers, hyphens, and underscores"
  }

  if (name.startsWith("-") || name.startsWith("_")) {
    return "Project name cannot start with a hyphen or underscore"
  }

  return true
}

/**
 * Validates package name (reverse domain notation)
 */
export function validatePackageName(name: string): true | string {
  if (!name || name.trim().length === 0) {
    return "Package name is required"
  }

  // Reverse domain notation: com.example.myapp
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_-]*)+$/i.test(name)) {
    return "Package name must be in reverse domain notation (e.g., com.example.myapp)"
  }

  return true
}

/**
 * Validates API key format
 */
export function validateApiKey(key: string): true | string {
  if (!key || key.trim().length === 0) {
    return "API key is required"
  }

  if (key.length < 10) {
    return "API key appears to be invalid (too short)"
  }

  return true
}

/**
 * Checks if a directory exists
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

/**
 * Clones a template from GitHub
 */
export async function cloneTemplate(repoUrl: string, targetDir: string): Promise<void> {
  try {
    // Check if target directory already exists
    if (await directoryExists(targetDir)) {
      throw new Error(`Directory "${targetDir}" already exists`)
    }

    // Clone the template using degit
    const emitter = degit(repoUrl, {
      cache: false,
      force: false,
      verbose: false,
    })

    await emitter.clone(targetDir)
  } catch (err) {
    if (err instanceof Error) {
      error(`Failed to clone template: ${err.message}`)
      throw err
    }
    throw new Error("Failed to clone template")
  }
}

/**
 * Detects the package manager used in the project
 */
export function detectPackageManager(): "bun" | "npm" | "yarn" {
  // Check if bun is available
  try {
    // In Bun runtime, Bun is always available
    if (typeof Bun !== "undefined") {
      return "bun"
    }
  } catch {
    // Continue to check for other package managers
  }

  // Check for lock files
  // This would require async fs access, so we default to bun
  return "bun"
}
