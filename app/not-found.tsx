import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow mb-4">404</p>
      <h1 className="font-display text-4xl font-bold tracking-tightest sm:text-5xl">
        That page isn&rsquo;t here.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        The link may be out of date. Everything — services, pricing, and estimates for
        automotive, marine, and aviation — lives on the main page.
      </p>
      <Link href="/" className="btn-apex mt-8">
        Back to Home
      </Link>
    </main>
  );
}
