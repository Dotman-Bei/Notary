import { Component, type ReactNode } from 'react'

// A crash in one screen shows a message instead of an empty page.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="crash">
        <h1>This page hit an error</h1>
        <p>Something in this screen failed to render. The registry on BOT Chain is unaffected.</p>
        <p><a href="/">Back to the start</a> · <a href={location.href}>Reload</a></p>
      </main>
    )
  }
}
