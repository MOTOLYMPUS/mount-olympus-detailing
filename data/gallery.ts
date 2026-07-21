export interface GalleryPair {
  id: string;
  label: string;
  before: string;
  after: string;
}

export const galleryPairs: GalleryPair[] = [
  {
    id: 'g1',
    label: 'Ferrari 488 — Full Paint Correction',
    before:
      'https://images.unsplash.com/photo-1583121274602-3e2820c69888?q=80&w=1400&auto=format&fit=crop&sat=-100&con=-10',
    after:
      'https://images.unsplash.com/photo-1583121274602-3e2820c69888?q=80&w=1400&auto=format&fit=crop',
  },
  {
    id: 'g2',
    label: 'Porsche 911 Turbo S — Ceramic Coating',
    before:
      'https://images.unsplash.com/photo-1614200187524-dc4b892acf16?q=80&w=1400&auto=format&fit=crop&sat=-100&con=-10',
    after:
      'https://images.unsplash.com/photo-1614200187524-dc4b892acf16?q=80&w=1400&auto=format&fit=crop',
  },
  {
    id: 'g3',
    label: 'McLaren 720S — PPF Full Front',
    before:
      'https://images.unsplash.com/photo-1621135802920-133df287f89c?q=80&w=1400&auto=format&fit=crop&sat=-100&con=-10',
    after:
      'https://images.unsplash.com/photo-1621135802920-133df287f89c?q=80&w=1400&auto=format&fit=crop',
  },
];

export const galleryGrid: string[] = [
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=900&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1580414155951-ea3b3ab8f4c7?q=80&w=900&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?q=80&w=900&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=900&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1542362567-b07e54358753?q=80&w=900&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1553440569-bcc63803a83d?q=80&w=900&auto=format&fit=crop',
];
