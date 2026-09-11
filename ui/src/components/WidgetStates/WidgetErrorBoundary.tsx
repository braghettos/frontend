import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

import { WidgetError } from './WidgetStates'

interface Props {
  children: ReactNode
  /** Identifies the widget, for the logged message. */
  widgetId?: string
  /**
   * Changing this clears a caught error and retries the render. Pass something that moves when
   * the widget's DATA moves (react-query's `dataUpdatedAt`), so a refetch that fixes the payload
   * un-sticks the boundary instead of leaving it latched on the first bad render forever.
   */
  resetKey?: unknown
}

interface State {
  error: Error | null
  resetKey: unknown
}

/**
 * Catches a RENDER-TIME throw from one widget and shows that widget's error card in place.
 *
 * Why this has to exist: the app had NO error boundary anywhere — zero `componentDidCatch` /
 * `getDerivedStateFromError` in the tree — on React 19, whose default for an uncaught render
 * error is to unmount the WHOLE tree. So a widget component that assumed a well-formed
 * `widgetData` and got something else did not produce the polished error card the app otherwise
 * commits to. It produced a blank page.
 *
 * That is not hypothetical: the CRD and `kubectl apply --dry-run=server` validate only STATIC
 * `widgetData`, never `widgetDataTemplate` output, which snowplow evaluates later. A template
 * emitting the wrong SHAPE — a string where the schema wants an array — is accepted at apply time
 * with "created, 0 errors" and fails in the browser. `WidgetRenderer`'s existing error handling
 * guards the fetch and HTTP paths only; nothing guarded the render itself.
 *
 * Scoped per widget deliberately, to preserve the property that a page with three failing widgets
 * among ten shows three error cards in place and renders the other seven.
 */
class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null, resetKey: props.resetKey }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // A new resetKey means new data — drop the latched error and let the render retry.
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The stack is the only place the offending component is named, so keep it out of the
    // user-facing copy but always log it.
    console.error(`Widget render error${this.props.widgetId ? ` (${this.props.widgetId})` : ''}:`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <WidgetError
          subtitle={`This widget could not be displayed: ${error.message || 'unknown render error'}`}
        />
      )
    }
    return this.props.children
  }
}

export default WidgetErrorBoundary
