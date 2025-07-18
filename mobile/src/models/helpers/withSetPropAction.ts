import {IStateTreeNode} from "mobx-state-tree"

/**
 * Helper to easily add a setProp action to a MST model
 */
export function withSetPropAction<T extends IStateTreeNode>(self: T) {
  return {
    actions: {
      setProp<K extends keyof T>(field: K, value: T[K]) {
        ;(self as any)[field] = value
      },
    },
  }
}
