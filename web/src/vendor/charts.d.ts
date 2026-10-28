// Types for the side-effect module that defines window.Charts (from the design-taste-frontend skill).
export {}
declare global {
  interface Window {
    Charts: {
      line: (el: HTMLElement, opts: Record<string, unknown>) => unknown
      bars: (el: HTMLElement, opts: Record<string, unknown>) => unknown
      fmt: Record<string, (...a: never[]) => (v: number) => string> & { int: (v: number) => string }
    }
  }
}
