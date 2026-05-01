export type UserRole = "admin" | "management" | "resident";

export interface BuildingReadingConfig {
  waterEnabled: boolean;
  electricityEnabled: boolean;
  heatingEnabled: boolean;
  hotWaterMetersPerResident: number;
  coldWaterMetersPerResident: number;
}

export interface Building {
  id: string;
  name: string;
  address: string;
  apartments: number;
  occupancy: string;
  status: string;
  readingConfig?: BuildingReadingConfig;
  companyId?: string;
  companyName?: string;
  managedBy?: Record<string, unknown>;
}

export interface Resident {
  id: string;
  fullName: string;
  apartment: string;
  building: string;
  role: string;
  invitationStatus: string;
}

export interface Invoice {
  id: string;
  apartment: string;
  resident: string;
  amount: string;
  dueDate: string;
  status: string;
}

export interface MeterReading {
  id: string;
  apartment: string;
  value: string;
  submittedAt: string;
  trend: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  type: string;
  target: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  channel: string;
}

export interface DashboardStat {
  label: string;
  value: string;
  hint: string;
}

export const dashboardStats: DashboardStat[] = [
  { label: "Buildings", value: "12", hint: "Across 3 management portfolios" },
  { label: "Apartments", value: "286", hint: "94% occupancy" },
  { label: "Open invoices", value: "41", hint: "€18.4k outstanding" },
  { label: "Unread alerts", value: "9", hint: "2 high-priority notifications" },
];

export const buildings: Building[] = [
  {
    id: "BLD-001",
    name: "River Park Residence",
    address: "Maskavas iela 18, Riga",
    apartments: 48,
    occupancy: "46 / 48",
    status: "Healthy",
  },
  {
    id: "BLD-002",
    name: "Amber Courtyard",
    address: "Brivibas iela 101, Riga",
    apartments: 72,
    occupancy: "69 / 72",
    status: "Needs review",
  },
  {
    id: "BLD-003",
    name: "Pine Hill Homes",
    address: "Jomas iela 23, Jurmala",
    apartments: 36,
    occupancy: "36 / 36",
    status: "Healthy",
  },
];

export const residents: Resident[] = [
  {
    id: "USR-104",
    fullName: "Anna Petrova",
    apartment: "A-12",
    building: "River Park Residence",
    role: "Resident",
    invitationStatus: "Accepted",
  },
  {
    id: "USR-148",
    fullName: "Janis Ozols",
    apartment: "B-07",
    building: "Amber Courtyard",
    role: "Resident",
    invitationStatus: "Pending",
  },
  {
    id: "USR-201",
    fullName: "Elina Berzina",
    apartment: "C-14",
    building: "Pine Hill Homes",
    role: "Accountant",
    invitationStatus: "Accepted",
  },
];

export const invoices: Invoice[] = [
  {
    id: "INV-2026-041",
    apartment: "A-12",
    resident: "Anna Petrova",
    amount: "€124.55",
    dueDate: "2026-04-25",
    status: "Pending",
  },
  {
    id: "INV-2026-042",
    apartment: "B-07",
    resident: "Janis Ozols",
    amount: "€98.10",
    dueDate: "2026-04-21",
    status: "Overdue",
  },
  {
    id: "INV-2026-043",
    apartment: "C-14",
    resident: "Elina Berzina",
    amount: "€142.00",
    dueDate: "2026-04-30",
    status: "Paid",
  },
];

export const meterReadings: MeterReading[] = [
  {
    id: "MR-551",
    apartment: "A-12",
    value: "126.4 m³",
    submittedAt: "2026-04-17",
    trend: "+2.1",
  },
  {
    id: "MR-552",
    apartment: "B-07",
    value: "88.7 m³",
    submittedAt: "2026-04-16",
    trend: "+1.3",
  },
  {
    id: "MR-553",
    apartment: "C-14",
    value: "144.1 m³",
    submittedAt: "2026-04-15",
    trend: "+2.9",
  },
];

export const documents: DocumentItem[] = [
  {
    id: "DOC-91",
    title: "April utility statement",
    type: "Invoice",
    target: "All residents",
    updatedAt: "2026-04-18",
  },
  {
    id: "DOC-92",
    title: "Elevator maintenance report",
    type: "Report",
    target: "River Park Residence",
    updatedAt: "2026-04-14",
  },
  {
    id: "DOC-93",
    title: "Management agreement",
    type: "Contract",
    target: "Company archive",
    updatedAt: "2026-04-03",
  },
];

export const notifications: NotificationItem[] = [
  {
    id: "N-1",
    title: "New invoice batch published",
    description: "April invoices are available for resident review.",
    channel: "Billing",
  },
  {
    id: "N-2",
    title: "Water meter deadline approaching",
    description: "23 residents still need to submit their readings.",
    channel: "Operations",
  },
  {
    id: "N-3",
    title: "Document upload completed",
    description: "Three new reports were added to the archive.",
    channel: "Documents",
  },
];
