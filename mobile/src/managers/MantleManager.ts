class MantleManager {
  private static instance: MantleManager | null = null

  public static getInstance(): MantleManager {
    if (!MantleManager.instance) {
      MantleManager.instance = new MantleManager()
    }
    return MantleManager.instance
  }

  private constructor() {}
}

const mantleManager = MantleManager.getInstance()
export default mantleManager
