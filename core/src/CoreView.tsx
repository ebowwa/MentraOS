import {requireNativeView} from "expo"
// eslint-disable-next-line
import * as React from "react"

import {CoreViewProps} from "./Core.types"

const NativeView: React.ComponentType<CoreViewProps> = requireNativeView("Core")

export default function CoreView(props: CoreViewProps) {
  return <NativeView {...props} />
}
