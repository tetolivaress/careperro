import Link from "next/link";
import { FileX2 } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <FileX2 className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold text-fg">That page doesn&apos;t exist</h1>
        <p className="text-sm text-fg-muted">The tool may have moved. Try the search, or start from the home page.</p>
      </div>
      <Link
        href="/"
        className="flex h-10 items-center rounded-sm border border-border-strong bg-surface-2 px-4 text-sm font-medium text-fg hover:bg-surface-3"
      >
        Back to home
      </Link>
    </main>
  );
}
