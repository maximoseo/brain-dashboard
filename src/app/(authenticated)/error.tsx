"use client";

import { ErrorState } from "@/components/feedback/states";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState message={error.message || "The page encountered an unexpected error."} onRetry={reset} />;
}
