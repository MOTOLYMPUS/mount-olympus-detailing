import { Make } from '@/lib/types';

/** Motorcycle manufacturers and their current + commonly-owned models. */
export const motorcycleMakes: Make[] = [
  {
    name: 'Aprilia',
    models: ['RS 660', 'RSV4', 'Tuono 660', 'Tuono V4', 'Tuareg 660', 'SR 160'],
  },
  {
    name: 'BMW Motorrad',
    models: [
      'R 1250 GS', 'R 1300 GS', 'R 1250 RT', 'R nineT', 'R 18',
      'S 1000 RR', 'S 1000 R', 'S 1000 XR', 'F 900 R', 'F 850 GS', 'G 310 R', 'CE 04',
    ],
  },
  {
    name: 'Can-Am',
    models: ['Ryker', 'Ryker Rally', 'Spyder F3', 'Spyder RT', 'Origin', 'Pulse'],
  },
  {
    name: 'Ducati',
    // Current range plus the models still commonly on the road, grouped by
    // family. Superbikes back to the 916 era, since those are exactly the
    // bikes that get paint correction and coating.
    models: [
      // Panigale / superbikes
      'Panigale V4', 'Panigale V4 S', 'Panigale V4 R', 'Panigale V4 SP2',
      'Panigale V2', 'Panigale V2 S', '1299 Panigale', '1199 Panigale', '959 Panigale',
      '899 Panigale', '1198', '1098', '848 EVO', '848', '999', '998', '996', '916', '749', '748',
      // Streetfighter
      'Streetfighter V4', 'Streetfighter V4 S', 'Streetfighter V4 SP2', 'Streetfighter V2',
      'Streetfighter 1098', 'Streetfighter 848',
      // Monster
      'Monster', 'Monster SP', 'Monster 1200', 'Monster 1200 S', 'Monster 821', 'Monster 797',
      'Monster 796', 'Monster 696', 'Monster 1100', 'Monster S4R', 'Monster S2R', 'Monster 620',
      // Multistrada
      'Multistrada V4', 'Multistrada V4 S', 'Multistrada V4 Pikes Peak', 'Multistrada V4 Rally',
      'Multistrada V4 RS', 'Multistrada V2', 'Multistrada V2 S', 'Multistrada 1260',
      'Multistrada 1200', 'Multistrada 950', 'Multistrada 1100', 'Multistrada 1000 DS',
      // Diavel / XDiavel
      'Diavel V4', 'Diavel 1260', 'Diavel 1260 S', 'Diavel', 'XDiavel', 'XDiavel S',
      // Scrambler
      'Scrambler Icon', 'Scrambler Icon Dark', 'Scrambler Full Throttle', 'Scrambler Nightshift',
      'Scrambler Desert Sled', 'Scrambler Café Racer', 'Scrambler 1100', 'Scrambler 1100 Sport',
      'Scrambler 800', 'Scrambler Sixty2',
      // Hypermotard
      'Hypermotard 950', 'Hypermotard 950 SP', 'Hypermotard 950 RVE', 'Hypermotard 698 Mono',
      'Hypermotard 939', 'Hypermotard 821', 'Hypermotard 1100', 'Hypermotard 796', 'Hyperstrada',
      // Adventure / sport touring
      'DesertX', 'DesertX Rally', 'SuperSport 950', 'SuperSport 950 S', 'SuperSport 939',
      'ST4', 'ST3', 'ST2',
      // Classics
      'Sport 1000', 'GT 1000', 'Paul Smart 1000', 'Supersport 900', 'Supersport 1000',
    ],
  },
  {
    name: 'Harley-Davidson',
    models: [
      'Street Glide', 'Road Glide', 'Road King', 'Electra Glide', 'Ultra Limited',
      'Fat Boy', 'Heritage Classic', 'Softail Standard', 'Breakout', 'Low Rider S', 'Low Rider ST',
      'Sportster S', 'Nightster', 'Iron 883', 'Forty-Eight',
      'Pan America 1250', 'LiveWire', 'CVO Road Glide', 'CVO Street Glide',
    ],
  },
  {
    name: 'Honda',
    models: [
      'CBR600RR', 'CBR1000RR-R', 'CBR500R', 'CB500F', 'CB650R', 'CB1000R',
      'Gold Wing', 'Rebel 300', 'Rebel 500', 'Rebel 1100',
      'Africa Twin', 'NC750X', 'Grom', 'Monkey', 'Shadow Phantom', 'Navi',
    ],
  },
  {
    name: 'Husqvarna',
    models: ['Svartpilen 401', 'Vitpilen 401', 'Svartpilen 801', 'Norden 901', 'FE 350', 'TE 300'],
  },
  {
    name: 'Indian',
    models: [
      'Scout', 'Scout Bobber', 'Chief', 'Chief Bobber', 'Springfield',
      'Chieftain', 'Roadmaster', 'Challenger', 'Pursuit', 'FTR',
    ],
  },
  {
    name: 'Kawasaki',
    models: [
      'Ninja 400', 'Ninja 650', 'Ninja ZX-6R', 'Ninja ZX-10R', 'Ninja H2', 'Ninja 1000SX',
      'Z400', 'Z650', 'Z900', 'Z H2',
      'Versys 650', 'Versys 1000', 'Vulcan S', 'Vulcan 900', 'W800', 'Eliminator',
    ],
  },
  {
    name: 'KTM',
    models: [
      '390 Duke', '790 Duke', '890 Duke R', '1290 Super Duke R',
      'RC 390', '390 Adventure', '890 Adventure', '1290 Super Adventure',
      '300 XC-W', '450 SX-F', '500 EXC-F',
    ],
  },
  {
    name: 'MV Agusta',
    models: ['F3 800', 'Brutale 800', 'Dragster 800', 'Turismo Veloce', 'Superveloce', 'Rush'],
  },
  {
    name: 'Royal Enfield',
    models: [
      'Classic 350', 'Meteor 350', 'Hunter 350', 'Bullet 350',
      'Himalayan', 'Scram 411', 'Interceptor 650', 'Continental GT 650', 'Super Meteor 650',
    ],
  },
  {
    name: 'Suzuki',
    models: [
      'GSX-R600', 'GSX-R750', 'GSX-R1000', 'GSX-S750', 'GSX-S1000', 'GSX-8S',
      'SV650', 'Katana', 'Hayabusa', 'V-Strom 650', 'V-Strom 1050', 'Boulevard M109R', 'DR-Z400',
    ],
  },
  {
    name: 'Triumph',
    models: [
      'Bonneville T100', 'Bonneville T120', 'Bobber', 'Speedmaster', 'Scrambler 900', 'Scrambler 1200',
      'Street Triple', 'Speed Triple 1200', 'Trident 660', 'Daytona 660',
      'Tiger 900', 'Tiger 1200', 'Rocket 3', 'Thruxton',
    ],
  },
  {
    name: 'Yamaha',
    models: [
      'YZF-R3', 'YZF-R7', 'YZF-R1', 'MT-03', 'MT-07', 'MT-09', 'MT-10',
      'Ténéré 700', 'Tracer 9 GT', 'XSR700', 'XSR900',
      'Bolt', 'V Star 250', 'Star Venture', 'Super Ténéré', 'YZ450F',
    ],
  },
  {
    name: 'Zero',
    models: ['SR/F', 'SR/S', 'S', 'DS', 'DSR/X', 'FX', 'FXE'],
  },
];
