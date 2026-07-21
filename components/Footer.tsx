export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-14">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10 px-6 lg:flex-row lg:items-start lg:justify-between lg:px-10">
        <div>
          <p className="font-display text-lg font-bold tracking-tightest">
            APEX <span className="text-apex">/</span> ATELIER
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-smoke/50">
            Luxury paint correction, ceramic coating, and paint protection film for the world&rsquo;s
            finest performance vehicles.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <p className="eyebrow mb-4">Studio</p>
            <ul className="flex flex-col gap-2.5 text-sm text-smoke/60">
              <li><a href="#services" className="hover:text-white">Services</a></li>
              <li><a href="#gallery" className="hover:text-white">Gallery</a></li>
              <li><a href="#about" className="hover:text-white">About</a></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-4">Contact</p>
            <ul className="flex flex-col gap-2.5 text-sm text-smoke/60">
              <li>hello@apexatelier.com</li>
              <li>(555) 019-2244</li>
              <li>By appointment only</li>
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-4">Hours</p>
            <ul className="flex flex-col gap-2.5 text-sm text-smoke/60">
              <li>Mon–Sat · 8:00–19:00</li>
              <li>Sunday · Closed</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-[1400px] px-6 lg:px-10">
        <div className="hairline" />
        <p className="mt-6 font-mono text-[11px] uppercase tracking-widest2 text-smoke/40">
          © {new Date().getFullYear()} Apex Detailing Atelier. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
