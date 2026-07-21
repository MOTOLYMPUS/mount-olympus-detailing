// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  IMAGERY — READ BEFORE LAUNCH
//
// Every URL in this file is a third-party Unsplash stock photo, NOT this
// business's own work. Two consequences:
//
//   1. The hero images were selected by subject description, and the automotive
//      hero is a red mid-engine supercar rather than a verified Ferrari 488.
//      Sourcing a licensed 4K Ferrari 488 / performance boat / private jet
//      photo requires a stock licence or your own photography.
//   2. Hot-linking Unsplash puts a third-party DNS + TLS handshake on the
//      critical path for your LCP element. Once you have real photography,
//      move the files into /public and drop the remotePatterns entry in
//      next.config.js.
//
// Replace the values here; nothing else in the codebase hardcodes an image URL.
// ─────────────────────────────────────────────────────────────────────────────

export const MEDIA_IS_PLACEHOLDER = true;

const UNSPLASH = 'https://images.unsplash.com';

/** Build a sized Unsplash URL. `w` should match the largest rendered width. */
function u(id: string, w: number) {
  return `${UNSPLASH}/${id}?q=85&w=${w}&auto=format&fit=crop`;
}

export const heroImages: Record<string, { src: string; alt: string }> = {
  automotive: {
    src: u('photo-1592198084033-aade902d1aae', 3840),
    alt: 'A red mid-engine supercar photographed in profile under studio lighting',
  },
  marine: {
    src: u('photo-1567899378494-47b22a2ae96a', 3840),
    alt: 'A luxury performance motor yacht underway on open water',
  },
  aviation: {
    src: u('photo-1540962351504-03099e0a754b', 3840),
    alt: 'A private business jet parked on a tarmac at golden hour',
  },
};

// Every id below was verified to return a live image — re-run
// `node scripts/check-images.mjs` after changing any of them.
//
// A few ids repeat across entries. That is deliberate: the first pass used
// plausible-looking ids that turned out to be 404s, so dead ones were replaced
// with verified-live images from the same category rather than more guesses.
// Duplication disappears as soon as real photography lands here.
export const serviceImages = {
  // Automotive
  autoExteriorWash: u('photo-1520340356584-f9917d1eea6f', 1600),
  autoInterior: u('photo-1552519507-da3b142c6e3d', 1600),
  autoFullDetail: u('photo-1503376780353-7e6692767b70', 1600),
  autoMaintenance: u('photo-1520340356584-f9917d1eea6f', 1600),
  autoPaintCorrection: u('photo-1601362840469-51e4d8d58785', 1600),
  autoCeramic: u('photo-1567818735868-e71b99932e29', 1600),
  motorcycle: u('photo-1558981806-ec527fa84c39', 1600),
  motorcycleOem: u('photo-1568772585407-9361f9bf3a87', 1600),

  // Marine
  marineWash: u('photo-1544551763-46a013bb70d5', 1600),
  marineFullDetail: u('photo-1540946485063-a40da27545f8', 1600),
  marineHull: u('photo-1500514966906-fe245eea9344', 1600),
  marineCeramic: u('photo-1567899378494-47b22a2ae96a', 1600),
  marineCabin: u('photo-1605281317010-fe5ffe798166', 1600),

  // Aviation
  aviationDryWash: u('photo-1436491865332-7a61a109cc05', 1600),
  aviationWetWash: u('photo-1474302770737-173ee21bab63', 1600),
  aviationPolish: u('photo-1474302770737-173ee21bab63', 1600),
  aviationPaint: u('photo-1540962351504-03099e0a754b', 1600),
  aviationCeramic: u('photo-1436491865332-7a61a109cc05', 1600),
  aviationCabin: u('photo-1540339832862-474599807836', 1600),
};
