import { BUSINESS_DETAILS_ARE_PLACEHOLDER, business } from '@/lib/business';

export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-14">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10 px-6 lg:flex-row lg:items-start lg:justify-between lg:px-10">
        <div>
          <p className="font-display text-lg font-bold tracking-tightest">
            {business.logo.lead} <span className="text-apex">/</span> {business.logo.tail}
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Detailing, correction, and protective coatings for automotive, marine, and aviation
            owners who hold their property to a standard.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <p className="eyebrow mb-4">Studio</p>
            <ul className="flex flex-col gap-2.5 text-sm text-muted">
              <li>
                <a href="#services" className="hover:text-white">
                  Services
                </a>
              </li>
              <li>
                <a href="#gallery" className="hover:text-white">
                  Gallery
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-white">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#about" className="hover:text-white">
                  About
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="eyebrow mb-4">Contact</p>
            <ul className="flex flex-col gap-2.5 text-sm text-muted">
              <li>
                <a href={`mailto:${business.email}`} className="break-all hover:text-white">
                  {business.email}
                </a>
              </li>
              <li>
                <a href={business.phoneHref} className="hover:text-white">
                  {business.phone}
                </a>
              </li>
              <li>{business.serviceArea}</li>
            </ul>
          </div>

          <div>
            <p className="eyebrow mb-4">Hours</p>
            <ul className="flex flex-col gap-2.5 text-sm text-muted">
              {business.hours.map((h) => (
                <li key={h.days}>
                  <span className="block">{h.days}</span>
                  <span className="text-subtle">{h.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-[1400px] px-6 lg:px-10">
        <div className="hairline" />

        {/* Renders only while lib/business.ts still holds placeholder details. */}
        {BUSINESS_DETAILS_ARE_PLACEHOLDER && (
          <p className="mt-6 rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[12px] leading-relaxed text-amber-200">
            <strong className="font-semibold">Setup notice:</strong> the contact details above are
            placeholders. Replace them in <code className="font-mono">lib/business.ts</code> and set{' '}
            <code className="font-mono">BUSINESS_DETAILS_ARE_PLACEHOLDER</code> to{' '}
            <code className="font-mono">false</code>.
          </p>
        )}

        <p className="mt-6 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
          © {new Date().getFullYear()} {business.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
