/**
 * Create Command
 *
 * Scaffold a new MentraOS app from a template
 */

import {Command} from "commander"
import {spawn} from "child_process"
import chalk from "chalk"

import {TEMPLATES, TEMPLATE_KEYS} from "../constants/templates.js"
import {confirm, input, password, select} from "../utils/prompt.js"
import {error, info, success} from "../utils/output.js"
import {
  cloneTemplate,
  detectPackageManager,
  validateApiKey,
  validatePackageName,
  validateProjectName,
} from "../utils/template.js"
import {customizeProject} from "../utils/customize.js"
import {loadCredentials} from "../config/credentials.js"
import {api} from "../api/client.js"

interface CreateOptions {
  template?: string
  packageName?: string
  apiKey?: string
  git?: boolean
}

/**
 * Initializes git repository
 */
async function initializeGit(projectDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const commands = [
      ["git", ["init"]],
      ["git", ["add", "."]],
      ["git", ["commit", "-m", "Initial commit from mentra create"]],
    ] as const

    const runCommand = (index: number) => {
      if (index >= commands.length) {
        resolve()
        return
      }

      const [cmd, args] = commands[index]
      const proc = spawn(cmd, args, {
        cwd: projectDir,
        stdio: "ignore",
      })

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Git command failed: ${cmd} ${args.join(" ")}`))
        } else {
          runCommand(index + 1)
        }
      })

      proc.on("error", (err) => {
        reject(err)
      })
    }

    runCommand(0)
  })
}

/**
 * Displays next steps after project creation
 */
function displayNextSteps(projectName: string): void {
  const pkgManager = detectPackageManager()

  success("\n✓ Project created successfully!")
  success("✓ .env configured with package name and API key\n")

  info("Next steps:\n")
  console.log(`  1. ${chalk.bold(`cd ${projectName}`)}`)
  console.log(`  2. ${chalk.bold(`${pkgManager} install`)}`)
  console.log(`  3. ${chalk.bold(`${pkgManager} run dev`)}`)
  console.log(`  4. Start building! 🚀\n`)

  info("Useful commands:\n")
  console.log(`  ${chalk.bold(`${pkgManager} dev`)}          Start development server`)
  console.log(`  ${chalk.bold(`${pkgManager} build`)}        Build for production`)
  console.log(`  ${chalk.bold("mentra app list")}  List your apps\n`)

  console.log(chalk.gray("Documentation: https://docs.mentra.glass"))
  console.log(chalk.gray("Discord: https://discord.gg/5ukNvkEAqT\n"))
}

/**
 * Main create command action
 */
async function createAction(
  projectNameArg: string | undefined,
  options: CreateOptions,
): Promise<void> {
  try {
    // Welcome message
    info("\n🌟 Create MentraOS App\n")

    // Check for existing authentication
    const credentials = await loadCredentials()
    if (credentials) {
      console.log(chalk.green("✓ Authenticated as:"), chalk.cyan(credentials.email))
      console.log(chalk.dim(`  Key: ${credentials.keyName || "CLI Key"}\n`))
    } else {
      console.log(chalk.yellow("⚠ Not authenticated"))
      console.log(chalk.dim("  Run 'mentra auth <token>' to authenticate\n"))
    }

    // 1. Select template
    let templateKey: string
    if (options.template && TEMPLATE_KEYS.includes(options.template)) {
      templateKey = options.template
    } else {
      const templateChoices = TEMPLATE_KEYS.map((key) => {
        const template = TEMPLATES[key]
        return {
          name: template.name,
          value: key,
          description: template.description,
        }
      })

      templateKey = await select("Select a template:", templateChoices)
    }

    const template = TEMPLATES[templateKey]

    // 2. Get project name
    let projectName: string
    if (projectNameArg) {
      const validation = validateProjectName(projectNameArg)
      if (validation !== true) {
        error(validation)
        process.exit(1)
      }
      projectName = projectNameArg
    } else {
      projectName = await input("Project name:", {
        default: "my-mentraos-app",
        validate: validateProjectName,
      })
    }

    // 3. Get package name
    let packageName: string
    if (options.packageName) {
      const validation = validatePackageName(options.packageName)
      if (validation !== true) {
        error(validation)
        process.exit(1)
      }
      packageName = options.packageName
    } else {
      const defaultPackageName = `com.example.${projectName.replace(/[^a-z0-9]/gi, "").toLowerCase()}`
      packageName = await input("Package name (reverse domain notation):", {
        default: defaultPackageName,
        validate: validatePackageName,
      })
    }

    // 4. Get API key
    let apiKey: string
    if (options.apiKey) {
      // Use API key from command-line option
      const validation = validateApiKey(options.apiKey)
      if (validation !== true) {
        error(validation)
        process.exit(1)
      }
      apiKey = options.apiKey
    } else if (credentials && credentials.token) {
      // Auto-use API key from authenticated session
      apiKey = credentials.token
      console.log(chalk.green("✓ Using API key from authenticated session\n"))
    } else {
      // Prompt for API key
      console.log(
        chalk.dim("\nGet your API key from: ") + chalk.underline("https://console.mentra.glass\n"),
      )
      apiKey = await password("Enter your API key:", {
        validate: validateApiKey,
      })
    }

    // 5. Optional: Initialize git
    let shouldInitGit = true
    if (options.git === false) {
      shouldInitGit = false
    } else if (options.git === undefined) {
      shouldInitGit = await confirm("Initialize git repository?", true)
    }

    // 6. Clone template
    console.log() // Empty line
    info("📦 Cloning template...")
    await cloneTemplate(template.repo, projectName)

    // 7. Customize project
    info("⚙️  Customizing project...")
    await customizeProject(projectName, projectName, {
      packageName,
      apiKey,
      port: 3000,
    })

    // 8. Initialize git
    if (shouldInitGit) {
      info("🎯 Initializing git repository...")
      try {
        await initializeGit(projectName)
      } catch (err) {
        // Git init is optional, don't fail if it doesn't work
        console.log(chalk.yellow("⚠ Failed to initialize git repository (non-critical)"))
      }
    }

    // 9. Register app with MentraOS
    console.log() // Empty line
    info("📝 Registering app with MentraOS...")
    try {
      const appData = {
        packageName,
        name: projectName,
        appType: "background",
        publicUrl: "http://localhost:3000", // Default for local development
        description: `${template.name} created with Mentra CLI`,
      }

      const result = await api.createApp(appData)

      success(`✓ App registered: ${packageName}`)

      // Update .env with the new app-specific API key
      if (result.apiKey) {
        // Update the .env file with the new API key
        await customizeProject(projectName, projectName, {
          packageName,
          apiKey: result.apiKey, // Use the new app-specific API key
          port: 3000,
        })

        console.log()
        console.log(chalk.yellow("📋 App-specific API key generated and saved to .env:"))
        console.log(chalk.dim("   (This is different from your CLI authentication key)"))
        console.log()
        console.log(chalk.cyan("   API Key: ") + chalk.bold.white(result.apiKey))
        console.log()
      }
    } catch (err: any) {
      // App registration is not critical - project is already created
      console.log(chalk.yellow("⚠ Failed to register app with MentraOS (non-critical)"))
      console.log(chalk.dim(`   Error: ${err.message}`))
      console.log(chalk.dim("   You can register manually later with: mentra app create"))
    }

    // 10. Display next steps
    displayNextSteps(projectName)
  } catch (err) {
    if (err instanceof Error) {
      error(`\n✗ ${err.message}`)
    } else {
      error("\n✗ An unexpected error occurred")
    }
    process.exit(1)
  }
}

export const createCommand = new Command("create")
  .description("Create a new MentraOS app from a template")
  .argument("[project-name]", "Name of the project directory")
  .option("-t, --template <type>", `Template to use (${TEMPLATE_KEYS.join("|")})`)
  .option("-p, --package-name <name>", "Package name in reverse domain notation")
  .option("-k, --api-key <key>", "API key from console.mentra.glass")
  .option("--no-git", "Skip git initialization")
  .action(createAction)
