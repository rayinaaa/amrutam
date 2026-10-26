import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  User,
  Profile,
  Doctor,
  AvailabilitySlot,
  Consultation,
  Prescription,
  Payment,
  AuditLog,
  IdempotencyRecord,
  UserRole,
  SlotStatus,
  ConsultationStatus,
  PaymentStatus,
} from '../../domain/types';
import { SecurityService } from '../security/encryption';
import { logger } from '../observability/logger';

export class MemoryDatabase {
  public users: Map<string, User> = new Map();
  public profiles: Map<string, Profile> = new Map();
  public doctors: Map<string, Doctor> = new Map();
  public slots: Map<string, AvailabilitySlot> = new Map();
  public consultations: Map<string, Consultation> = new Map();
  public prescriptions: Map<string, Prescription> = new Map();
  public payments: Map<string, Payment> = new Map();
  public auditLogs: AuditLog[] = [];
  public idempotencyKeys: Map<string, IdempotencyRecord> = new Map();

  // Concurrency lock for slots
  private slotLocks: Set<string> = new Set();

  constructor() {
    this.seedInitialData();
  }

  public seedInitialData(): void {
    const passwordHash = bcrypt.hashSync('AmrutamSecurePass123!', 10);

    // Initial System Audit Log
    this.auditLogs.push({
      id: crypto.randomUUID(),
      user_id: '11111111-1111-4111-8111-111111111111',
      action: 'SYSTEM_INITIALIZED',
      entity_type: 'SYSTEM',
      entity_id: 'SYSTEM_ROOT',
      ip_address: '127.0.0.1',
      user_agent: 'System Seeder',
      details: { status: 'healthy', version: '1.0.0' },
      created_at: new Date().toISOString(),
    });

    // 1. Admin User
    const adminId = '11111111-1111-4111-8111-111111111111';
    this.users.set(adminId, {
      id: adminId,
      email: 'admin@amrutam.co.in',
      password_hash: passwordHash,
      role: UserRole.ADMIN,
      is_active: true,
      mfa_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    this.profiles.set(adminId, {
      id: crypto.randomUUID(),
      user_id: adminId,
      first_name: 'Amrutam',
      last_name: 'Administrator',
      phone: '+919876543210',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 2. Doctor Users
    const doctorUserId1 = '22222222-2222-4222-8222-222222222221';
    this.users.set(doctorUserId1, {
      id: doctorUserId1,
      email: 'dr.sharma@amrutam.co.in',
      password_hash: passwordHash,
      role: UserRole.DOCTOR,
      is_active: true,
      mfa_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    this.profiles.set(doctorUserId1, {
      id: crypto.randomUUID(),
      user_id: doctorUserId1,
      first_name: 'Ananya',
      last_name: 'Sharma',
      phone: '+919811223344',
      gender: 'Female',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const doctorId1 = '33333333-3333-4333-8333-333333333331';
    this.doctors.set(doctorId1, {
      id: doctorId1,
      user_id: doctorUserId1,
      specialization: 'Ayurveda & Holistic Medicine',
      license_number: 'AYU-DL-2015-8942',
      years_of_experience: 12,
      consultation_fee: 750.0,
      bio: 'Senior Ayurvedic Physician specializing in chronic metabolic, digestive disorders, and herbal rejuvenation.',
      rating: 4.95,
      total_reviews: 148,
      languages: ['English', 'Hindi', 'Sanskrit'],
      is_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const doctorUserId2 = '22222222-2222-4222-8222-222222222222';
    this.users.set(doctorUserId2, {
      id: doctorUserId2,
      email: 'dr.verma@amrutam.co.in',
      password_hash: passwordHash,
      role: UserRole.DOCTOR,
      is_active: true,
      mfa_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    this.profiles.set(doctorUserId2, {
      id: crypto.randomUUID(),
      user_id: doctorUserId2,
      first_name: 'Rajesh',
      last_name: 'Verma',
      phone: '+919822334455',
      gender: 'Male',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const doctorId2 = '33333333-3333-4333-8333-333333333332';
    this.doctors.set(doctorId2, {
      id: doctorId2,
      user_id: doctorUserId2,
      specialization: 'Dermatology & Skin Care',
      license_number: 'MCI-MH-2012-4411',
      years_of_experience: 14,
      consultation_fee: 900.0,
      bio: 'Expert Dermatologist combining modern clinical trichology and skin wellness with plant-based formulations.',
      rating: 4.88,
      total_reviews: 96,
      languages: ['English', 'Hindi', 'Marathi'],
      is_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 3. Patient User
    const patientUserId = '44444444-4444-4444-8444-444444444441';
    this.users.set(patientUserId, {
      id: patientUserId,
      email: 'patient.arjun@gmail.com',
      password_hash: passwordHash,
      role: UserRole.PATIENT,
      is_active: true,
      mfa_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    this.profiles.set(patientUserId, {
      id: crypto.randomUUID(),
      user_id: patientUserId,
      first_name: 'Arjun',
      last_name: 'Patel',
      phone: '+919988776655',
      date_of_birth: '1992-05-14',
      gender: 'Male',
      blood_group: 'B+',
      emergency_contact: '+919988776600',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 4. Availability Slots for Doctor 1 (Tomorrow)
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const slotTimes = [
      { start: '09:00:00', end: '09:30:00' },
      { start: '10:00:00', end: '10:30:00' },
      { start: '11:00:00', end: '11:30:00' },
      { start: '14:00:00', end: '14:30:00' },
      { start: '15:00:00', end: '15:30:00' },
    ];

    slotTimes.forEach((st, idx) => {
      const slotId = `55555555-5555-4555-8555-55555555555${idx + 1}`;
      this.slots.set(slotId, {
        id: slotId,
        doctor_id: doctorId1,
        slot_date: dateStr,
        start_time: st.start,
        end_time: st.end,
        status: SlotStatus.AVAILABLE,
        fee: 750.0,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    logger.info('MemoryDatabase initialized and seeded with sample admin, doctors, patient, and slots.');
  }

  // --- Users & Profiles ---
  public async createUser(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }

  public async findUserByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return { ...u };
    }
    return null;
  }

  public async findUserById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const existing = this.users.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
    this.users.set(id, updated);
    return updated;
  }

  public async createProfile(profile: Profile): Promise<Profile> {
    this.profiles.set(profile.user_id, profile);
    return profile;
  }

  public async findProfileByUserId(userId: string): Promise<Profile | null> {
    const p = this.profiles.get(userId);
    return p ? { ...p } : null;
  }

  // --- Doctors ---
  public async createDoctor(doctor: Doctor): Promise<Doctor> {
    this.doctors.set(doctor.id, doctor);
    return doctor;
  }

  public async findDoctorById(id: string): Promise<Doctor | null> {
    const d = this.doctors.get(id);
    if (!d) return null;
    const profile = this.profiles.get(d.user_id);
    return { ...d, profile: profile || undefined };
  }

  public async findDoctorByUserId(userId: string): Promise<Doctor | null> {
    for (const d of this.doctors.values()) {
      if (d.user_id === userId) {
        const profile = this.profiles.get(userId);
        return { ...d, profile: profile || undefined };
      }
    }
    return null;
  }

  public async searchDoctors(filters: {
    specialization?: string;
    minRating?: number;
    maxFee?: number;
    language?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ doctors: Doctor[]; total: number }> {
    let result = Array.from(this.doctors.values());

    if (filters.specialization) {
      const q = filters.specialization.toLowerCase();
      result = result.filter((d) => d.specialization.toLowerCase().includes(q));
    }
    if (filters.minRating !== undefined) {
      result = result.filter((d) => d.rating >= filters.minRating!);
    }
    if (filters.maxFee !== undefined) {
      result = result.filter((d) => d.consultation_fee <= filters.maxFee!);
    }
    if (filters.language) {
      const lang = filters.language.toLowerCase();
      result = result.filter((d) => d.languages.some((l) => l.toLowerCase() === lang));
    }

    const total = result.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 20;
    const paginated = result.slice(offset, offset + limit).map((d) => {
      const profile = this.profiles.get(d.user_id);
      return { ...d, profile: profile || undefined };
    });

    return { doctors: paginated, total };
  }

  // --- Availability Slots ---
  public async createSlot(slot: AvailabilitySlot): Promise<AvailabilitySlot> {
    this.slots.set(slot.id, slot);
    return slot;
  }

  public async findSlotsByDoctorAndDate(doctorId: string, date: string): Promise<AvailabilitySlot[]> {
    const list: AvailabilitySlot[] = [];
    for (const s of this.slots.values()) {
      if (s.doctor_id === doctorId && s.slot_date === date) {
        list.push({ ...s });
      }
    }
    return list.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  public async findSlotById(id: string): Promise<AvailabilitySlot | null> {
    const s = this.slots.get(id);
    return s ? { ...s } : null;
  }

  /**
   * Concurrency-controlled slot acquisition.
   * Simulates PostgreSQL `SELECT ... FOR UPDATE` with version increment.
   */
  public async lockAndBookSlot(slotId: string): Promise<AvailabilitySlot | null> {
    if (this.slotLocks.has(slotId)) {
      return null; // Concurrency conflict
    }

    this.slotLocks.add(slotId);
    try {
      const slot = this.slots.get(slotId);
      if (!slot || slot.status !== SlotStatus.AVAILABLE) {
        return null;
      }

      // Optimistic version increment
      const updatedSlot: AvailabilitySlot = {
        ...slot,
        status: SlotStatus.BOOKED,
        version: slot.version + 1,
        updated_at: new Date().toISOString(),
      };
      this.slots.set(slotId, updatedSlot);
      return updatedSlot;
    } finally {
      this.slotLocks.delete(slotId);
    }
  }

  public async releaseSlot(slotId: string): Promise<void> {
    const slot = this.slots.get(slotId);
    if (slot) {
      slot.status = SlotStatus.AVAILABLE;
      slot.version += 1;
      slot.updated_at = new Date().toISOString();
      this.slots.set(slotId, slot);
    }
  }

  // --- Consultations ---
  public async createConsultation(consultation: Consultation): Promise<Consultation> {
    this.consultations.set(consultation.id, consultation);
    return consultation;
  }

  public async findConsultationById(id: string): Promise<Consultation | null> {
    const c = this.consultations.get(id);
    if (!c) return null;
    const doctor = await this.findDoctorById(c.doctor_id);
    const slot = this.slots.get(c.slot_id);
    const patientUser = this.users.get(c.patient_id);
    const patientProfile = this.profiles.get(c.patient_id);

    return {
      ...c,
      doctor: doctor || undefined,
      slot: slot || undefined,
      patient: patientUser
        ? {
            id: patientUser.id,
            email: patientUser.email,
            profile: patientProfile || undefined,
          }
        : undefined,
    };
  }

  public async findConsultationsByPatient(patientId: string): Promise<Consultation[]> {
    const list: Consultation[] = [];
    for (const c of this.consultations.values()) {
      if (c.patient_id === patientId) {
        const full = await this.findConsultationById(c.id);
        if (full) list.push(full);
      }
    }
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public async findConsultationsByDoctor(doctorId: string): Promise<Consultation[]> {
    const list: Consultation[] = [];
    for (const c of this.consultations.values()) {
      if (c.doctor_id === doctorId) {
        const full = await this.findConsultationById(c.id);
        if (full) list.push(full);
      }
    }
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public async updateConsultation(id: string, updates: Partial<Consultation>): Promise<Consultation | null> {
    const existing = this.consultations.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
    this.consultations.set(id, updated);
    return updated;
  }

  // --- Prescriptions ---
  public async createPrescription(p: Prescription): Promise<Prescription> {
    this.prescriptions.set(p.id, p);
    return p;
  }

  public async findPrescriptionByConsultationId(consultationId: string): Promise<Prescription | null> {
    for (const p of this.prescriptions.values()) {
      if (p.consultation_id === consultationId) return { ...p };
    }
    return null;
  }

  public async findPrescriptionsByPatient(patientId: string): Promise<Prescription[]> {
    const list: Prescription[] = [];
    for (const p of this.prescriptions.values()) {
      if (p.patient_id === patientId) list.push({ ...p });
    }
    return list.sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  }

  // --- Payments ---
  public async createPayment(payment: Payment): Promise<Payment> {
    this.payments.set(payment.id, payment);
    return payment;
  }

  public async findPaymentById(id: string): Promise<Payment | null> {
    const pay = this.payments.get(id);
    return pay ? { ...pay } : null;
  }

  public async findPaymentByIdempotencyKey(key: string): Promise<Payment | null> {
    for (const p of this.payments.values()) {
      if (p.idempotency_key === key) return { ...p };
    }
    return null;
  }

  public async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | null> {
    const existing = this.payments.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
    this.payments.set(id, updated);
    return updated;
  }

  // --- Idempotency ---
  public async getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
    const record = this.idempotencyKeys.get(key);
    if (!record) return null;
    if (new Date(record.expires_at).getTime() < Date.now()) {
      this.idempotencyKeys.delete(key);
      return null;
    }
    return record;
  }

  public async saveIdempotencyRecord(record: IdempotencyRecord): Promise<void> {
    this.idempotencyKeys.set(record.key, record);
  }

  // --- Audit Logs ---
  public async createAuditLog(log: AuditLog): Promise<AuditLog> {
    this.auditLogs.push(log);
    return log;
  }

  public async getAuditLogs(filters: {
    userId?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    let result = [...this.auditLogs];
    if (filters.userId) result = result.filter((l) => l.user_id === filters.userId);
    if (filters.entityType) result = result.filter((l) => l.entity_type === filters.entityType);
    if (filters.entityId) result = result.filter((l) => l.entity_id === filters.entityId);

    const total = result.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const paginated = result.slice(offset, offset + limit).reverse();
    return { logs: paginated, total };
  }

  // --- Admin Analytics ---
  public async getAnalyticsSummary() {
    const totalConsultations = this.consultations.size;
    const statusCounts: Record<string, number> = {
      SCHEDULED: 0,
      WAITING_ROOM: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
    };

    for (const c of this.consultations.values()) {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
    }

    let totalRevenue = 0;
    let successfulPayments = 0;
    for (const p of this.payments.values()) {
      if (p.status === PaymentStatus.SUCCESS) {
        totalRevenue += Number(p.amount);
        successfulPayments++;
      }
    }

    const totalDoctors = this.doctors.size;
    const totalPatients = Array.from(this.users.values()).filter((u) => u.role === UserRole.PATIENT).length;
    const totalPrescriptions = this.prescriptions.size;

    return {
      totalConsultations,
      statusBreakdown: statusCounts,
      financials: {
        totalRevenue,
        currency: 'INR',
        successfulPayments,
      },
      userMetrics: {
        totalDoctors,
        totalPatients,
        totalPrescriptions,
      },
      systemHealth: {
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export const memoryDb = new MemoryDatabase();
