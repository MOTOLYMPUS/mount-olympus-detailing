export interface Review {
  id: string;
  name: string;
  location: string;
  vehicle: string;
  rating: number;
  quote: string;
}

export const reviews: Review[] = [
  {
    id: 'r1',
    name: 'Marcus H.',
    location: 'Scottsdale, AZ',
    vehicle: 'Porsche 911 GT3 RS',
    rating: 5,
    quote:
      'They treated my GT3 like it belonged in a vault. The correction work under direct sun shows zero holograms — first shop I have trusted with it.',
  },
  {
    id: 'r2',
    name: 'Elena R.',
    location: 'Miami, FL',
    vehicle: 'Ferrari SF90 Stradale',
    rating: 5,
    quote:
      'Booking took two minutes and the estimate was exact. Ceramic finish looks wet from ten feet away, even after three months of daily driving.',
  },
  {
    id: 'r3',
    name: 'Daniel K.',
    location: 'Austin, TX',
    vehicle: 'Lamborghini Huracán',
    rating: 5,
    quote:
      'PPF install was flawless — no visible seams anywhere on the front clip. Climate-controlled bay, genuinely careful technicians.',
  },
  {
    id: 'r4',
    name: 'Priya S.',
    location: 'Newport Beach, CA',
    vehicle: 'BMW M4 Competition',
    rating: 5,
    quote:
      'Interior smelled and looked new again. They walked me through every step of the estimate before touching the car. Exactly the experience I wanted.',
  },
];

export const googleRating = { average: 5.0, count: 214 };
