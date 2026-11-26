export type Role = "admin" | "contabil" | "sofer";

export interface Company { id: string; name: string; cui: string | null; reg_com: string | null; address: string | null; approved_by: string | null }
export interface Driver { id: string; company_id: string; name: string; job_title: string | null; license_no: string | null }
export interface Vehicle { id: string; company_id: string; plate: string; make: string | null; fuel: string; consumption: number; km_initial: number; default_driver_id: string | null; active: boolean }
export interface Location { id: string; company_id: string; name: string; city: string | null; default_purpose: string | null; is_hq: boolean }
export interface Distance { id: string; company_id: string; loc_a: string; loc_b: string; km: number }
export interface Trip {
  id?: string; company_id?: string; vehicle_id: string; driver_id: string | null; trip_date: string;
  time_start: string | null; time_end: string | null; from_loc: string | null; to_loc: string | null;
  round_trip: boolean; route_text: string | null; purpose: string | null; km_start: number; km_end: number; generated: boolean;
}
export interface Refuel { id: string; company_id: string; vehicle_id: string; refuel_date: string; liters: number; amount: number | null; doc_no: string | null }
export interface Sheet { vehicle_id: string; month: string; company_id: string; number: string | null; driver_id: string | null; fuel_start: number | null }
export interface CreditPackage { code: string; name: string; credits: number; price_ron: number | null; active: boolean; sort: number }
export interface LedgerRow { id: number; delta: number; reason: string; vehicle_id: string | null; month: string | null; note: string | null; created_at: string }
