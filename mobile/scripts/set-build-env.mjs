#!/usr/bin/env zx
import {config} from "dotenv"
import {writeFile} from "fs/promises"

export async function setBuildEnv() {
  const gitCommit = (await $`git rev-parse --short HEAD`).stdout.trim()
  const gitBranch = (await $`git rev-parse --abbrev-ref HEAD`).stdout.trim()
  const gitUsername = (await $`git config user.name`).stdout.trim()
  const buildTime = new Date().toISOString()

  const buildVars = {
    EXPO_PUBLIC_BUILD_COMMIT: gitCommit,
    EXPO_PUBLIC_BUILD_BRANCH: gitBranch,
    EXPO_PUBLIC_BUILD_USER: gitUsername,
    EXPO_PUBLIC_BUILD_TIME: buildTime,
    EXPO_PUBLIC_MENTRAOS_VERSION: "2.2.17",
    EXPO_PUBLIC_VERSION: "2.2.18",
  }

  console.log("Build environment set:")
  Object.entries(buildVars).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`)
  })

  // Load existing .env
  const existingEnv = config().parsed || {}

  // Merge with build vars
  const updatedEnv = {...existingEnv, ...buildVars}

  // Write back to .env
  const envContent =
    Object.entries(updatedEnv)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n"

  await writeFile(".env", envContent)

  console.log("\n.env file updated successfully")

  return updatedEnv
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await setBuildEnv()
}
