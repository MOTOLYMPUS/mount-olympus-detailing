import { Make } from '@/lib/types';

/**
 * Automotive manufacturers and their current + commonly-owned recent models.
 *
 * Scope note: this covers current production and recent used-market models —
 * the vehicles that actually turn up for detailing. It is not an exhaustive
 * historical catalog. The model field in the form falls back to free text, so
 * an owner of something not listed can always type it in.
 */
export const automotiveMakes: Make[] = [
  {
    name: 'Acura',
    models: ['ILX', 'Integra', 'TLX', 'RLX', 'RDX', 'MDX', 'ZDX', 'NSX'],
  },
  {
    name: 'Alfa Romeo',
    models: ['Giulia', 'Stelvio', 'Tonale', '4C', 'Giulietta'],
  },
  {
    name: 'Aston Martin',
    models: ['Vantage', 'DB11', 'DB12', 'DBS', 'DBX', 'Rapide', 'Valkyrie', 'Vanquish'],
  },
  {
    name: 'Audi',
    models: [
      'A3', 'A4', 'A5', 'A6', 'A7', 'A8',
      'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'Q8 e-tron',
      'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'SQ5', 'SQ7', 'SQ8',
      'RS 3', 'RS 5', 'RS 6 Avant', 'RS 7', 'RS Q8',
      'e-tron GT', 'TT', 'R8',
    ],
  },
  {
    name: 'Bentley',
    models: ['Continental GT', 'Continental GTC', 'Flying Spur', 'Bentayga', 'Mulsanne', 'Batur'],
  },
  {
    name: 'BMW',
    models: [
      '2 Series', '3 Series', '4 Series', '5 Series', '7 Series', '8 Series',
      'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'XM',
      'Z4', 'i4', 'i5', 'i7', 'iX', 'i3',
      'M2', 'M3', 'M4', 'M5', 'M8', 'X3 M', 'X5 M', 'X6 M',
    ],
  },
  {
    name: 'Buick',
    models: ['Encore', 'Encore GX', 'Envision', 'Enclave', 'Envista', 'Regal', 'LaCrosse'],
  },
  {
    name: 'Cadillac',
    models: [
      'CT4', 'CT5', 'CT6', 'ATS', 'CTS', 'XTS',
      'XT4', 'XT5', 'XT6', 'Escalade', 'Escalade ESV',
      'Lyriq', 'Celestiq', 'Vistiq', 'Optiq',
      'CT4-V Blackwing', 'CT5-V Blackwing',
    ],
  },
  {
    name: 'Chevrolet',
    models: [
      'Spark', 'Sonic', 'Malibu', 'Impala', 'Cruze', 'Camaro', 'Corvette',
      'Trax', 'Trailblazer', 'Equinox', 'Blazer', 'Traverse', 'Tahoe', 'Suburban',
      'Colorado', 'Silverado 1500', 'Silverado 2500HD', 'Silverado 3500HD',
      'Bolt EV', 'Bolt EUV', 'Blazer EV', 'Equinox EV', 'Silverado EV',
    ],
  },
  {
    name: 'Chrysler',
    models: ['300', 'Pacifica', 'Voyager', 'Town & Country'],
  },
  {
    name: 'Dodge',
    models: [
      'Charger', 'Challenger', 'Durango', 'Journey', 'Hornet', 'Dart', 'Viper',
    ],
  },
  {
    name: 'Ferrari',
    models: [
      '488 GTB', '488 Spider', '488 Pista', 'F8 Tributo', 'F8 Spider',
      '296 GTB', '296 GTS', 'SF90 Stradale', 'SF90 Spider',
      'Roma', 'Portofino', 'Portofino M', '812 Superfast', '812 GTS',
      'Purosangue', 'GTC4Lusso', 'California T', '458 Italia', 'LaFerrari',
    ],
  },
  {
    name: 'Fiat',
    models: ['500', '500e', '500X', '500L', '124 Spider'],
  },
  {
    name: 'Ford',
    models: [
      'Fiesta', 'Focus', 'Fusion', 'Mustang', 'Mustang Mach-E', 'GT',
      'EcoSport', 'Escape', 'Bronco', 'Bronco Sport', 'Edge', 'Explorer', 'Expedition',
      'Maverick', 'Ranger', 'F-150', 'F-150 Lightning', 'F-250 Super Duty', 'F-350 Super Duty',
      'Transit', 'Transit Connect',
    ],
  },
  {
    name: 'Genesis',
    models: ['G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80'],
  },
  {
    name: 'GMC',
    models: [
      'Terrain', 'Acadia', 'Yukon', 'Yukon XL',
      'Canyon', 'Sierra 1500', 'Sierra 2500HD', 'Sierra 3500HD',
      'Hummer EV Pickup', 'Hummer EV SUV', 'Savana',
    ],
  },
  {
    name: 'Honda',
    models: [
      'Civic', 'Accord', 'Insight', 'Fit', 'CR-V', 'HR-V', 'Pilot', 'Passport',
      'Odyssey', 'Ridgeline', 'Prologue', 'Element', 'S2000',
    ],
  },
  {
    name: 'Hyundai',
    models: [
      'Accent', 'Elantra', 'Sonata', 'Veloster', 'Ioniq 5', 'Ioniq 6',
      'Venue', 'Kona', 'Tucson', 'Santa Fe', 'Santa Cruz', 'Palisade', 'Nexo',
    ],
  },
  {
    name: 'Infiniti',
    models: ['Q50', 'Q60', 'Q70', 'QX50', 'QX55', 'QX60', 'QX80', 'G37'],
  },
  {
    name: 'Jaguar',
    models: ['XE', 'XF', 'XJ', 'F-Type', 'E-Pace', 'F-Pace', 'I-Pace'],
  },
  {
    name: 'Jeep',
    models: [
      'Renegade', 'Compass', 'Cherokee', 'Grand Cherokee', 'Grand Cherokee L',
      'Wrangler', 'Wrangler 4xe', 'Gladiator', 'Wagoneer', 'Grand Wagoneer',
    ],
  },
  {
    name: 'Kia',
    models: [
      'Rio', 'Forte', 'K5', 'Stinger', 'Soul', 'Seltos', 'Sportage',
      'Sorento', 'Telluride', 'Carnival', 'Niro', 'EV6', 'EV9',
    ],
  },
  {
    name: 'Lamborghini',
    models: ['Huracán', 'Huracán Sterrato', 'Aventador', 'Revuelto', 'Urus', 'Gallardo', 'Temerario'],
  },
  {
    name: 'Land Rover',
    models: [
      'Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque',
      'Discovery', 'Discovery Sport', 'Defender 90', 'Defender 110', 'Defender 130',
    ],
  },
  {
    name: 'Lexus',
    models: [
      'IS', 'ES', 'GS', 'LS', 'RC', 'LC',
      'UX', 'NX', 'RX', 'GX', 'LX', 'TX', 'RZ', 'LFA',
    ],
  },
  {
    name: 'Lincoln',
    models: ['MKZ', 'Continental', 'Corsair', 'Nautilus', 'Aviator', 'Navigator', 'Navigator L'],
  },
  {
    name: 'Maserati',
    models: ['Ghibli', 'Quattroporte', 'Levante', 'Grecale', 'MC20', 'GranTurismo', 'GranCabrio'],
  },
  {
    name: 'Mazda',
    models: ['Mazda3', 'Mazda6', 'MX-5 Miata', 'CX-30', 'CX-5', 'CX-50', 'CX-70', 'CX-90', 'CX-9'],
  },
  {
    name: 'McLaren',
    models: ['570S', '600LT', '620R', '650S', '720S', '750S', '765LT', 'GT', 'Artura', 'P1', 'Senna'],
  },
  {
    name: 'Mercedes-Benz',
    models: [
      'A-Class', 'C-Class', 'E-Class', 'S-Class', 'CLA', 'CLS',
      'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'G-Class',
      'EQB', 'EQE', 'EQS', 'EQE SUV', 'EQS SUV',
      'SL', 'AMG GT', 'C 63 AMG', 'E 63 AMG', 'G 63 AMG', 'GLE 63 AMG', 'Sprinter',
    ],
  },
  {
    name: 'MINI',
    models: ['Cooper Hardtop', 'Cooper Convertible', 'Clubman', 'Countryman', 'Cooper SE'],
  },
  {
    name: 'Mitsubishi',
    models: ['Mirage', 'Lancer', 'Outlander', 'Outlander Sport', 'Outlander PHEV', 'Eclipse Cross'],
  },
  {
    name: 'Nissan',
    models: [
      'Versa', 'Sentra', 'Altima', 'Maxima', '370Z', 'Z', 'GT-R',
      'Kicks', 'Rogue', 'Murano', 'Pathfinder', 'Armada',
      'Frontier', 'Titan', 'Leaf', 'Ariya',
    ],
  },
  {
    name: 'Porsche',
    models: [
      '911 Carrera', '911 Turbo', '911 Turbo S', '911 GT3', '911 GT3 RS', '911 Targa',
      '718 Cayman', '718 Cayman GT4 RS', '718 Boxster', '718 Spyder',
      'Panamera', 'Taycan', 'Macan', 'Macan EV', 'Cayenne', 'Cayenne Coupe',
    ],
  },
  {
    name: 'RAM',
    models: ['1500', '1500 REV', '2500', '3500', 'ProMaster', 'ProMaster City'],
  },
  {
    name: 'Rivian',
    models: ['R1T', 'R1S', 'R2', 'R3', 'EDV'],
  },
  {
    name: 'Rolls-Royce',
    models: ['Ghost', 'Phantom', 'Wraith', 'Dawn', 'Cullinan', 'Spectre'],
  },
  {
    name: 'Subaru',
    models: [
      'Impreza', 'Legacy', 'WRX', 'WRX STI', 'BRZ',
      'Crosstrek', 'Forester', 'Outback', 'Ascent', 'Solterra',
    ],
  },
  {
    name: 'Tesla',
    models: ['Model 3', 'Model S', 'Model X', 'Model Y', 'Cybertruck', 'Roadster'],
  },
  {
    name: 'Toyota',
    models: [
      'Corolla', 'Camry', 'Prius', 'Crown', 'Mirai', 'GR86', 'GR Supra', 'GR Corolla',
      'C-HR', 'Corolla Cross', 'RAV4', 'Venza', 'Highlander', 'Grand Highlander',
      '4Runner', 'Sequoia', 'Land Cruiser', 'bZ4X',
      'Tacoma', 'Tundra', 'Sienna',
    ],
  },
  {
    name: 'Volkswagen',
    models: [
      'Jetta', 'Passat', 'Golf', 'Golf GTI', 'Golf R', 'Arteon', 'Beetle',
      'Taos', 'Tiguan', 'Atlas', 'Atlas Cross Sport', 'ID.4', 'ID. Buzz',
    ],
  },
  {
    name: 'Volvo',
    models: ['S60', 'S90', 'V60', 'V90', 'XC40', 'XC60', 'XC90', 'EX30', 'EX90', 'C40 Recharge'],
  },
];
