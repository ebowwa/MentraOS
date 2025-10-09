import {NativeModule, requireNativeModule} from "expo"

import {CoreModuleEvents} from "./Core.types"

declare class CoreModule extends NativeModule<CoreModuleEvents> {
  PI: number
  hello(): string
  setValueAsync(value: string): Promise<void>
}

// This call loads the native module object from the JSI.
export default requireNativeModule<CoreModule>("Core")
