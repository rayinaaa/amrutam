// Domain Enums
export enum UserRole {
  PATIENT = 'PATIENT',
  DOCTOR = 'DOCTOR',
  ADMIN = 'ADMIN'
}

export enum SlotStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  BOOKED = 'BOOKED',
  BLOCKED = 'BLOCKED'
}

export enum ConsultationStatus {
  SCHEDULED = 'SCHEDULED',
  WAITING_ROOM = 'WAITING_ROOM',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW'
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED'
}

// Domain Entities
export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  mfa_enabled: boolean;
  mfa_secret?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  emergency_contact?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Doctor {
  id: string;
  user_id: string;
  specialization: string;
  license_number: string;
  years_of_experience: number;
  consultation_fee: number;
  bio?: string | null;
  rating: number;
  total_reviews: number;
  languages: string[];
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface AvailabilitySlot {
  id: string;
  doctor_id: string;
  slot_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm:ss
  end_time: string; // HH:mm:ss
  status: SlotStatus;
  fee: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Consultation {
  id: string;
  consultation_number: string;
  patient_id: string;
  doctor_id: string;
  slot_id: string;
  status: ConsultationStatus;
  chief_complaint?: string | null;
  symptoms: string[];
  clinical_notes_encrypted?: string | null; // AES-256-GCM
  start_time?: string | null;
  end_time?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
  slot?: AvailabilitySlot;
  doctor?: Doctor;
  patient?: {
    id: string;
    email: string;
    profile?: Profile;
  };
}

export interface MedicationItem {
  name: string;
  dosage: string;
  frequency: string; // e.g. "Once daily after meals"
  duration: string; // e.g. "7 days"
  instructions?: string;
}

export interface Prescription {
  id: string;
  consultation_id: string;
  doctor_id: string;
  patient_id: string;
  diagnosis: string;
  medications: MedicationItem[];
  dietary_advice?: string | null;
  follow_up_date?: string | null;
  digital_signature_hash: string; // SHA-256
  issued_at: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  consultation_id: string;
  patient_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  transaction_reference?: string | null;
  payment_gateway: string;
  idempotency_key?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  ip_address?: string | null;
  user_agent?: string | null;
  details: Record<string, any>;
  created_at: string;
}

export interface IdempotencyRecord {
  key: string;
  user_id?: string | null;
  route: string;
  request_hash: string;
  status_code: number;
  response_headers: Record<string, string>;
  response_body: any;
  created_at: string;
  expires_at: string;
}

// Auth Token Payload
export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  mfaPending?: boolean;
}
