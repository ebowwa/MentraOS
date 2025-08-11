import type {SidebarsConfig} from "@docusaurus/plugin-content-docs"

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // Manually defined sidebar structure
  tutorialSidebar: [
    "index",
    {
      type: "category",
      label: "Getting Started",
      link: {
        type: "doc",
        id: "quickstart",
      },
      items: [
        {
          type: "doc",
          id: "example-apps",
          label: "Example Apps",
        },
        {
          type: "doc",
          id: "getting-started",
          label: "Build From Scratch",
        },
        {
          type: "doc",
          id: "voice-activation",
          label: "Voice Activation Tutorial",
        },
        {
          type: "doc",
          id: "railway-deployment",
          label: "Deploy to Railway",
        },
        {
          type: "doc",
          id: "ubuntu-deployment",
          label: "Deploy to Ubuntu Server",
        },
      ],
    },
    {
      type: "category",
      label: "Core Concepts",
      link: {
        type: "doc",
        id: "core-concepts",
      },
      items: [
        {
          type: "doc",
          id: "app-lifecycle",
          label: "App Lifecycle",
        },
        "events",
        "permissions",
        "layouts",
        "settings",
        "audio",
        "tools",
        "capabilities",
        {
          type: "category",
          label: "Camera",
          link: {
            type: "doc",
            id: "camera/README",
          },
          items: ["camera/photo-capture", "camera/rtmp-streaming"],
        },
        "webview-auth-overview",
        "react-webviews",
        "dashboard",
      ],
    },
    {
      type: "category",
      label: "SDK Reference",
      link: {
        type: "doc",
        id: "reference/index",
      },
      items: [
        "reference/app-server",
        "reference/app-session",
        {
          type: "category",
          label: "Managers",
          items: [
            "reference/managers/event-manager",
            "reference/managers/layout-manager",
            "reference/managers/settings-manager",
            "reference/managers/audio-manager",
            "reference/managers/camera",
            "reference/managers/location-manager",
          ],
        },
        "reference/enums",
        {
          type: "category",
          label: "Interfaces",
          items: [
            "reference/interfaces/config-types",
            "reference/interfaces/event-types",
            "reference/interfaces/layout-types",
            "reference/interfaces/capabilities",
            "reference/interfaces/webhook-types",
            "reference/interfaces/message-types",
            "reference/interfaces/tool-types",
            "reference/interfaces/setting-types",
          ],
        },
        "reference/dashboard-api",
        "reference/utilities",
      ],
    },
    {
      type: "category",
      label: "Contributing",
      link: {
        type: "doc",
        id: "contributing",
      },
      items: [
        {
          type: "doc",
          id: "contributing/mentraos-manager-guidelines",
          label: "MentraOS Mobile App Guidelines",
        },
        {
          type: "doc",
          id: "contributing/mentraos-asg-client-guidelines",
          label: "MentraOS ASG Client Guidelines",
        },
        {
          type: "doc",
          id: "contributing/add-new-glasses-support",
          label: "Adding New Glasses Support",
        },
        {
          type: "category",
          label: "ASG Client",
          link: {
            type: "doc",
            id: "asg-client/README",
          },
          items: [
            "asg-client/architecture",
            "asg-client/mentra-live",
            "asg-client/button-system",
            "asg-client/rtmp-streaming",
          ],
        },
      ],
    },
  ],
}

export default sidebars
