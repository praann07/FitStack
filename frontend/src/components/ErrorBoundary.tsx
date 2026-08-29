import { Component, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
  errorInfo: { componentStack: string } | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    this.setState({ errorInfo })
    console.error('Error caught by boundary:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback || (
          <div className="flex min-h-screen items-center justify-center bg-surface p-4">
            <Card className="w-full max-w-md">
              <div className="flex flex-col gap-4 p-6 text-center">
                <AlertTriangle className="mx-auto size-12 text-danger" />
                <div>
                  <h1 className="text-lg font-bold text-ink">Something went wrong</h1>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                    We're sorry, but the app encountered an unexpected error. Don't worry — your data is safe.
                  </p>
                </div>
                {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                  <div className="rounded-lg border border-danger/20 bg-danger-soft/50 p-3 text-left">
                    <p className="text-[11px] font-mono text-danger">{this.state.error.message}</p>
                    <p className="mt-2 text-[10px] font-mono text-danger/70 max-h-32 overflow-auto">
                      {this.state.errorInfo.componentStack}
                    </p>
                  </div>
                )}
                <Button size="lg" onClick={this.handleReset}>
                  Go home
                </Button>
              </div>
            </Card>
          </div>
        )
      )
    }

    return this.props.children
  }
}
