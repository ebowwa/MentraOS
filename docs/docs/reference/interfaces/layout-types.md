---
sidebar_position: 3
title: Layout Types
---

# Layout Types

This page documents the layout interfaces used to display content on the screen.

## Layout Interface

The `Layout` type is a union of all available layout types:

```typescript
type Layout = TextWall | DoubleTextWall | DashboardCard
```

Each layout has a specific structure that defines how content is presented in the AR display.

## TextWall

A simple layout for displaying a single block of text.

```typescript
interface TextWall {
  /** Must be LayoutType.TEXT_WALL. */
  layoutType: LayoutType.TEXT_WALL

  /** The text content to display. */
  text: string
}
```

**Example:**

```typescript
// You typically won't create this directly, but would use the LayoutManager method
const textWall: TextWall = {
  layoutType: LayoutType.TEXT_WALL,
  text: "This is a simple text wall with a single message.",
}

// Using the LayoutManager
appSession.layouts.showTextWall("This is a simple text wall with a single message.")
```

## DoubleTextWall

A layout for displaying two blocks of text vertically.

```typescript
interface DoubleTextWall {
  /** Must be LayoutType.DOUBLE_TEXT_WALL. */
  layoutType: LayoutType.DOUBLE_TEXT_WALL

  /** Text for the upper section. */
  topText: string

  /** Text for the lower section. */
  bottomText: string
}
```

**Example:**

```typescript
// Using the LayoutManager
appSession.layouts.showDoubleTextWall("This is the top section", "This is the bottom section")
```

## DashboardCard

A card-style layout designed for displaying key-value pairs, typically used in dashboards.

```typescript
interface DashboardCard {
  /** Must be LayoutType.DASHBOARD_CARD. */
  layoutType: LayoutType.DASHBOARD_CARD

  /** Text for the left side (usually a label). */
  leftText: string

  /** Text for the right side (usually a value). */
  rightText: string
}
```

**Example:**

```typescript
// Using the LayoutManager
appSession.layouts.showDashboardCard("Temperature", "72°F")
```

## DisplayRequest

The `DisplayRequest` interface is the message structure sent to MentraOS Cloud when a App wants to display a layout.

```typescript
interface DisplayRequest extends BaseMessage {
  /** Must be AppToCloudMessageType.DISPLAY_REQUEST. */
  type: AppToCloudMessageType.DISPLAY_REQUEST

  /** The package name of the App making the request. */
  packageName: string

  /** The target display area (MAIN or DASHBOARD). */
  view: ViewType

  /** The specific layout configuration object to display. */
  layout: Layout

  /** Optional time (in ms) to display the layout before automatically clearing it. */
  durationMs?: number

  /** Optional flag to attempt to force display even if another app is active (use with caution). */
  forceDisplay?: boolean
}
```

**Note:** You typically don't need to create `DisplayRequest` objects directly, as the [`LayoutManager`](/reference/managers/layout-manager) methods handle this for you.

## Best Practices for Layouts

### TextWall

- Best for simple messages that need to be displayed briefly
- Keep text concise and focused on a single idea
- Good for notifications, status updates, or simple responses

### DoubleTextWall

- Use when you need to separate a header/title from content
- The top section works well for brief category or context
- The bottom section provides the main information
- Example: "Current Weather" (top) and "72°F, Partly Cloudy" (bottom)

### DashboardCard

- Designed for monitoring key metrics at a glance
- Clear label-value pairing helps with quick comprehension
- Works best with short values (numbers, brief status, etc.)
- Consider using in the [`DASHBOARD`](/reference/enums#viewtype) view for persistent display
