/**
 * Create Command Tests
 *
 * Tests for the create command functionality
 */

import {describe, test, expect} from "bun:test"

import {validateApiKey, validatePackageName, validateProjectName} from "../src/utils/template"

describe("Create Command - Validation", () => {
  describe("validateProjectName", () => {
    test("should accept valid project names", () => {
      expect(validateProjectName("my-app")).toBe(true)
      expect(validateProjectName("my_app")).toBe(true)
      expect(validateProjectName("myapp123")).toBe(true)
      expect(validateProjectName("MyApp")).toBe(true)
    })

    test("should reject invalid project names", () => {
      expect(validateProjectName("")).not.toBe(true)
      expect(validateProjectName("   ")).not.toBe(true)
      expect(validateProjectName("-myapp")).not.toBe(true)
      expect(validateProjectName("_myapp")).not.toBe(true)
      expect(validateProjectName("my app")).not.toBe(true)
      expect(validateProjectName("my@app")).not.toBe(true)
    })
  })

  describe("validatePackageName", () => {
    test("should accept valid package names", () => {
      expect(validatePackageName("com.example.myapp")).toBe(true)
      expect(validatePackageName("org.company.product")).toBe(true)
      expect(validatePackageName("io.github.user")).toBe(true)
      expect(validatePackageName("com.example.my_app")).toBe(true)
      expect(validatePackageName("com.example.my-app")).toBe(true)
    })

    test("should reject invalid package names", () => {
      expect(validatePackageName("")).not.toBe(true)
      expect(validatePackageName("myapp")).not.toBe(true)
      expect(validatePackageName("com")).not.toBe(true)
      expect(validatePackageName("com.")).not.toBe(true)
      expect(validatePackageName(".com.example")).not.toBe(true)
      expect(validatePackageName("com..example")).not.toBe(true)
      expect(validatePackageName("com.Example.app")).not.toBe(true)
    })
  })

  describe("validateApiKey", () => {
    test("should accept valid API keys", () => {
      expect(validateApiKey("sk_live_abc123def456")).toBe(true)
      expect(validateApiKey("1234567890abcdef")).toBe(true)
      expect(validateApiKey("a".repeat(32))).toBe(true)
    })

    test("should reject invalid API keys", () => {
      expect(validateApiKey("")).not.toBe(true)
      expect(validateApiKey("   ")).not.toBe(true)
      expect(validateApiKey("short")).not.toBe(true)
      expect(validateApiKey("123")).not.toBe(true)
    })
  })
})

describe("Template Configuration", () => {
  test("should import templates", async () => {
    const {TEMPLATES} = await import("../src/constants/templates")
    expect(TEMPLATES).toBeDefined()
    expect(typeof TEMPLATES).toBe("object")
  })

  test("should have camera template", async () => {
    const {TEMPLATES} = await import("../src/constants/templates")
    expect(TEMPLATES.camera).toBeDefined()
    expect(TEMPLATES.camera.name).toBe("Camera Glasses App")
    expect(TEMPLATES.camera.repo).toContain("MentraOS-Camera-Example-App")
  })

  test("should have display template", async () => {
    const {TEMPLATES} = await import("../src/constants/templates")
    expect(TEMPLATES.display).toBeDefined()
    expect(TEMPLATES.display.name).toBe("Display Glasses App")
    expect(TEMPLATES.display.repo).toContain("MentraOS-Display-Example-App")
  })

  test("should have extended template", async () => {
    const {TEMPLATES} = await import("../src/constants/templates")
    expect(TEMPLATES.extended).toBeDefined()
    expect(TEMPLATES.extended.name).toBe("Extended Example App")
    expect(TEMPLATES.extended.repo).toContain("MentraOS-Extended-Example-App")
  })

  test("all templates should have required fields", async () => {
    const {TEMPLATES} = await import("../src/constants/templates")

    Object.values(TEMPLATES).forEach((template) => {
      expect(template.name).toBeDefined()
      expect(typeof template.name).toBe("string")
      expect(template.description).toBeDefined()
      expect(typeof template.description).toBe("string")
      expect(template.repo).toBeDefined()
      expect(typeof template.repo).toBe("string")
    })
  })
})

describe("Create Command Integration", () => {
  test("should import create command", async () => {
    const {createCommand} = await import("../src/commands/create")
    expect(createCommand).toBeDefined()
    expect(createCommand.name()).toBe("create")
  })

  test("should have correct description", async () => {
    const {createCommand} = await import("../src/commands/create")
    expect(createCommand.description()).toContain("template")
  })

  test("should accept project-name argument", async () => {
    const {createCommand} = await import("../src/commands/create")
    const args = createCommand.registeredArguments
    expect(args.length).toBeGreaterThan(0)
    expect(args[0].name()).toBe("project-name")
  })

  test("should have template option", async () => {
    const {createCommand} = await import("../src/commands/create")
    const options = createCommand.options
    const templateOption = options.find((opt) => opt.long === "--template")
    expect(templateOption).toBeDefined()
  })

  test("should have package-name option", async () => {
    const {createCommand} = await import("../src/commands/create")
    const options = createCommand.options
    const packageNameOption = options.find((opt) => opt.long === "--package-name")
    expect(packageNameOption).toBeDefined()
  })

  test("should have api-key option", async () => {
    const {createCommand} = await import("../src/commands/create")
    const options = createCommand.options
    const apiKeyOption = options.find((opt) => opt.long === "--api-key")
    expect(apiKeyOption).toBeDefined()
  })

  test("should have git option", async () => {
    const {createCommand} = await import("../src/commands/create")
    const options = createCommand.options
    const gitOption = options.find((opt) => opt.long === "--no-git")
    expect(gitOption).toBeDefined()
  })
})

describe("Customization Utilities", () => {
  test("should import customize functions", async () => {
    const {createEnvFile, updatePackageJson, customizeProject} =
      await import("../src/utils/customize")
    expect(createEnvFile).toBeDefined()
    expect(typeof createEnvFile).toBe("function")
    expect(updatePackageJson).toBeDefined()
    expect(typeof updatePackageJson).toBe("function")
    expect(customizeProject).toBeDefined()
    expect(typeof customizeProject).toBe("function")
  })
})

describe("Template Utilities", () => {
  test("should import template functions", async () => {
    const {cloneTemplate, directoryExists, detectPackageManager} =
      await import("../src/utils/template")
    expect(cloneTemplate).toBeDefined()
    expect(typeof cloneTemplate).toBe("function")
    expect(directoryExists).toBeDefined()
    expect(typeof directoryExists).toBe("function")
    expect(detectPackageManager).toBeDefined()
    expect(typeof detectPackageManager).toBe("function")
  })

  test("detectPackageManager should return valid value", async () => {
    const {detectPackageManager} = await import("../src/utils/template")
    const pm = detectPackageManager()
    expect(["bun", "npm", "yarn"]).toContain(pm)
  })
})
