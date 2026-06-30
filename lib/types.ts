// Supabase テーブルに対応する型定義

export type EmploymentType = 'staff' | 'contract';
export type CustomerType = 'existing' | 'new';
export type BookingStatus = 'visited' | 'confirmed' | 'tentative';

export interface Staff {
  id: string;
  name: string;
  initials: string;
  color: string;
  bg_color: string;
  fg_color: string;
  employment_type: EmploymentType;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  initials: string;
  phone: string | null;
  birth_year: number | null;
  customer_type: CustomerType;
  hair_type: string | null;
  allergy_tag: string | null;
  allergy_note: string | null;
  avatar_bg: string;
  avatar_fg: string;
  assigned_staff_id: string | null;
  visit_count: number;
  lifetime_value: number;
  avg_cycle_days: number | null;
  last_visit_on: string | null;
  next_suggestion: string | null;
  next_target: string | null;
  next_price: string | null;
  next_duration: string | null;
  created_at: string;
}

export interface Booking {
  id: string;
  customer_id: string | null;
  customer_name: string;
  staff_id: string;
  booking_date: string;
  start_time: string; // 'HH:MM:SS'
  end_time: string; // 'HH:MM:SS'
  menu: string;
  status: BookingStatus;
  customer_type: CustomerType;
  amount: number;
  shop_amount: number;
  note: string | null;
  created_at: string;
}

export interface TreatmentRecord {
  id: string;
  customer_id: string;
  staff_id: string | null;
  performed_on: string;
  menu: string;
  amount: number;
  tags: string[];
  note: string | null;
  icon: string;
  dot_bg: string;
  dot_fg: string;
  created_at: string;
}

export interface ChemicalRecord {
  id: string;
  customer_id: string;
  record_on: string;
  type_label: string;
  dot_color: string;
  brand: string | null;
  color_code: string | null;
  oxy: string | null;
  processing_time: string | null;
  finish_note: string | null;
  patch_test: boolean | null;
  created_at: string;
}

export interface CommissionSettings {
  id: number;
  existing_rate: number;
  new_rate: number;
  updated_at: string;
}

// 画面表示用に結合したデータ
export interface BookingWithStaff extends Booking {
  staff?: Pick<Staff, 'name' | 'color' | 'employment_type'> | null;
}

export interface CustomerWithStaff extends Customer {
  staff?: Pick<Staff, 'name'> | null;
}
