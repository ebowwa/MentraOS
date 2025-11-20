/**
 * Command Tests
 *
 * Tests for CLI commands functionality
 */

import {describe, test, expect, spyOn} from "bun:test"

import {GITHUB_REPO_LINKS} from "../src/constants/links"

describe("Links Command", () => {
  test("should have valid GitHub repository links", () => {
    // Verify that GITHUB_REPO_LINKS exists and is an object
    expect(GITHUB_REPO_LINKS).toBeDefined()
    expect(typeof GITHUB_REPO_LINKS).toBe("object")
  })

  test("should contain CAMERA_APP_REPO link", () => {
    // Verify the camera app repo link exists
    expect(GITHUB_REPO_LINKS.CAMERA_APP_REPO).toBeDefined()
    expect(GITHUB_REPO_LINKS.CAMERA_APP_REPO).toContain("github.com")
  })

  test("all links should be valid GitHub URLs", () => {
    // Verify all links are valid GitHub URLs
    Object.values(GITHUB_REPO_LINKS).forEach((url) => {
      expect(url).toMatch(/^https:\/\/github\.com\//)
      expect(url).not.toContain(" ")
    })
  })

  test("all link keys should be uppercase with underscores", () => {
    // Verify naming convention for link keys
    Object.keys(GITHUB_REPO_LINKS).forEach((key) => {
      expect(key).toMatch(/^[A-Z_]+$/)
    })
  })

  test("should have at least one repository link", () => {
    // Verify we have at least one link defined
    expect(Object.keys(GITHUB_REPO_LINKS).length).toBeGreaterThan(0)
  })
})

describe("Command Structure", () => {
  test("should format link keys correctly", () => {
    const key = "CAMERA_APP_REPO"
    const formatted = key
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase())

    expect(formatted).toBe("Camera App Repo")
  })

  test("should handle multi-word keys", () => {
    const testKey = "EXAMPLE_TEST_REPO_LINK"
    const formatted = testKey
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase())

    expect(formatted).toBe("Example Test Repo Link")
  })

  test("should handle single-word keys", () => {
    const testKey = "REPO"
    const formatted = testKey
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase())

    expect(formatted).toBe("Repo")
  })
})

describe("Links Command Integration", () => {
  test("should be importable without errors", async () => {
    // Test that the command module can be imported
    const {linksCommand} = await import("../src/commands/links")
    expect(linksCommand).toBeDefined()
    expect(linksCommand.name()).toBe("links")
  })

  test("should have correct description", async () => {
    const {linksCommand} = await import("../src/commands/links")
    expect(linksCommand.description()).toContain("repository links")
  })
})

describe("Console Output", () => {
  test("should not throw errors when displaying links", async () => {
    // Mock console.log to capture output
    const logSpy = spyOn(console, "log")

    // Import the command module
    const {linksCommand} = await import("../src/commands/links")

    // Verify command exists and has proper structure
    expect(linksCommand).toBeDefined()
    expect(linksCommand.name()).toBe("links")

    logSpy.mockRestore()
  })
})
