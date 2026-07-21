import { Service } from '@/lib/types';

export const services: Service[] = [
  {
    id: 'paint-correction',
    name: 'Paint Correction',
    shortDescription:
      'Multi-stage machine polishing removes swirl marks, oxidation, and micro-marring, restoring the paint to its original depth and clarity.',
    image:
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1600&auto=format&fit=crop',
    startingPrice: 650,
    estimatedHours: 6,
  },
  {
    id: 'ceramic-coating',
    name: 'Ceramic Coating',
    shortDescription:
      'A 9H-hardness ceramic layer bonds to the clear coat, delivering years of chemical resistance, hydrophobic beading, and a permanent gloss.',
    image:
      'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?q=80&w=1600&auto=format&fit=crop',
    startingPrice: 900,
    estimatedHours: 8,
  },
  {
    id: 'ppf',
    name: 'Paint Protection Film',
    shortDescription:
      'Self-healing urethane film protects against rock chips, road debris, and abrasion — invisible armor for the miles ahead.',
    image:
      'https://images.unsplash.com/photo-1567818735868-e71b99932e29?q=80&w=1600&auto=format&fit=crop',
    startingPrice: 2400,
    estimatedHours: 14,
  },
  {
    id: 'interior',
    name: 'Interior Detail',
    shortDescription:
      'Deep extraction cleaning, leather conditioning, and precision detailing of every stitch, vent, and surface inside the cabin.',
    image:
      'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=1600&auto=format&fit=crop',
    startingPrice: 320,
    estimatedHours: 3,
  },
  {
    id: 'exterior',
    name: 'Exterior Detail',
    shortDescription:
      'Two-bucket hand wash, clay bar decontamination, and paint-safe drying — the foundation every finish is built on.',
    image:
      'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?q=80&w=1600&auto=format&fit=crop',
    startingPrice: 220,
    estimatedHours: 2,
  },
  {
    id: 'engine-bay',
    name: 'Engine Bay Detail',
    shortDescription:
      'Steam-cleaned and dressed engine bay, presented with the same precision as the rest of the vehicle.',
    image:
      'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=80&w=1600&auto=format&fit=crop',
    startingPrice: 140,
    estimatedHours: 1.5,
  },
  {
    id: 'window-coating',
    name: 'Window Coating',
    shortDescription:
      'Hydrophobic glass coating improves visibility in rain and cuts down on wiper wear.',
    image:
      'https://images.unsplash.com/photo-1541447271487-09612b3f49f7?q=80&w=1600&auto=format&fit=crop',
    startingPrice: 180,
    estimatedHours: 1.5,
  },
  {
    id: 'headlight-restoration',
    name: 'Headlight Restoration',
    shortDescription:
      'Wet-sanded and resealed lenses restore clarity and night visibility, finished with UV-resistant coating.',
    image:
      'https://images.unsplash.com/photo-1553440569-bcc63803a83d?q=80&w=1600&auto=format&fit=crop',
    startingPrice: 120,
    estimatedHours: 1,
  },
];

export const luxuryPackage = {
  name: 'Luxury Package',
  description:
    'Paint correction, ceramic coating, full interior detail, and window coating — the complete Apex treatment for owners who want everything handled once, done right.',
  startingPrice: 1950,
};
