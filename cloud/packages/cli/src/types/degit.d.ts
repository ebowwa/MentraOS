/**
 * Type declarations for degit
 */

declare module "degit" {
  interface DegitOptions {
    cache?: boolean
    force?: boolean
    verbose?: boolean
    mode?: "tar" | "git"
  }

  interface DegitEmitter {
    clone(dest: string): Promise<void>
    on(event: string, handler: (...args: any[]) => void): void
  }

  function degit(src: string, opts?: DegitOptions): DegitEmitter

  export = degit
}
