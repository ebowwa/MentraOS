#!/usr/bin/env bun
/**
 * Mentra CLI
 *
 * Command-line tool for managing Mentra apps and organizations
 */

import {Command} from "commander"
import {appCommand} from "./commands/app"
import {authCommand} from "./commands/auth"
import {cloudCommand} from "./commands/cloud"
import {createCommand} from "./commands/create"
import {linksCommand} from "./commands/links"
import {orgCommand} from "./commands/org"

const program = new Command()

program.name("mentra").description("Mentra CLI - Manage apps and organizations").version("1.0.0")

// Add commands
program.addCommand(appCommand)
program.addCommand(authCommand)
program.addCommand(cloudCommand)
program.addCommand(createCommand)
program.addCommand(linksCommand)
program.addCommand(orgCommand)

// Global options
program.option("--json", "Output JSON")
program.option("--quiet", "Suppress non-essential output")
program.option("--verbose", "Show debug info")
program.option("--no-color", "Disable colors")

// Parse arguments
program.parse()
