/**
 * Links Command
 *
 * Display useful repository links and external resources
 */

import {Command} from "commander"
import {GITHUB_REPO_LINKS} from "../constants/links.js"
import {info} from "../utils/output.js"
import chalk from "chalk"

export const linksCommand = new Command("links")
  .description("Display useful repository links and external resources")
  .action(() => {
    info("\n📚 Mentra Repository Links:\n")

    Object.entries(GITHUB_REPO_LINKS).forEach(([key, url]) => {
      // Format the key nicely (e.g., CAMERA_APP_REPO -> Camera App Repo)
      const label = key
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (l) => l.toUpperCase())

      console.log(`  ${chalk.cyan("•")} ${chalk.bold(label)}:`)
      console.log(`    ${chalk.dim(url)}\n`)
    })
  })
