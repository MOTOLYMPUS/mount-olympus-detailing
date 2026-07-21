export type VehicleSize = 'sedan' | 'coupe' | 'suv' | 'truck' | 'exotic';

export type ServiceId =
  | 'ceramic-coating'
  | 'interior'
  | 'exterior'
  | 'paint-correction'
  | 'engine-bay'
  | 'ppf'
  | 'window-coating'
  | 'headlight-restoration';

export interface Service {
  id: ServiceId;
  name: string;
  shortDescription: string;
  image: string;
  startingPrice: number;
  estimatedHours: number;
}

export interface VehicleInfo {
  make: string;
  model: string;
  year: string;
  size: VehicleSize;
}

export interface EstimateResult {
  estimatedHours: number;
  estimatedPrice: number;
  depositRequired: number;
  estimatedCompletion: string;
}

export interface TimeSlot {
  time: string;
  period: 'morning' | 'afternoon' | 'evening';
  available: boolean;
}

export interface BookingState {
  vehicle: VehicleInfo;
  selectedServices: ServiceId[];
  estimate: EstimateResult | null;
  date: string | null;
  time: string | null;
  depositOnly: boolean;
}
