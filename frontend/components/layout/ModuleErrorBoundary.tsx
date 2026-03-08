"use client";

import { Component, type ReactNode } from "react";

interface ModuleErrorBoundaryProps {
  moduleName: string;
  children: ReactNode;
}

interface ModuleErrorBoundaryState {
  hasError: boolean;
}

export class ModuleErrorBoundary extends Component<
  ModuleErrorBoundaryProps,
  ModuleErrorBoundaryState
> {
  constructor(props: ModuleErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ModuleErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error(`[${this.props.moduleName}] Ⱦ쳣:`, error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl card-surface p-6">
          <div className="flex items-center justify-center py-6">
            <span className="text-sm text-red-400">
              {this.props.moduleName} ʧ
            </span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
