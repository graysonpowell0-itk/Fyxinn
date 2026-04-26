
export enum UserRole {
  ADMIN = 'Admin',
  MAINTENANCE = 'Maintenance',
  STAFF = 'Staff',
}

export enum RoomStatus {
  COMPLETED = 'COMPLETED', // Green
  IN_PROGRESS = 'IN_PROGRESS', // Yellow
  ISSUE_REPORTED = 'ISSUE_REPORTED', // Red
  WAITING_APPROVAL = 'WAITING_APPROVAL', // Blue
}

export interface Property {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  floors: number;
  schematicUrl?: string;
  photoUrl?: string;
  commonAreas?: string[];
  amenities?: string[];
  floorLayouts?: { floor: number; start: number; end: number }[];
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  phone: string;
  avatar?: string;
  password?: string;
  propertyId: string;
  propertyIds?: string[];
}

export interface LogEntry {
  id: string;
  userId: string;
  userName: string;
  timestamp: string; // ISO string
  action: string;
  details?: string;
  photoUrl?: string; // For completion photos or issue photos
  type: 'ISSUE' | 'REPAIR' | 'PM_CHECK' | 'ADMIN_ACTION';
}

export interface Task {
  id: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'AWAITING_REVIEW' | 'COMPLETED';
  reportedBy: string;
  assignedTo?: string;
  createdAt: string;
  completedAt?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  roomNumber?: string;
  issuePhotoUrl?: string;
  completionPhotoUrl?: string;
  completionNotes?: string;
}

export interface GeneralRequest {
  id: string;
  reporterName: string;
  description: string;
  createdAt: string;
  status: 'OPEN' | 'RESOLVED';
  priority: 'NORMAL' | 'HIGH';
  propertyId: string;
}

export interface PMChecklistState {
  [category: string]: {
    [item: string]: boolean;
  };
}

export type HousekeepingStatus = 'Vacant' | 'Occupied' | 'Stay Over' | 'Dirty' | 'Pending Departure' | 'Out of Order';

export interface Room {
  id: string;
  number: string;
  floor: number;
  status: RoomStatus;
  housekeepingStatus?: HousekeepingStatus;
  checkoutDate?: string;
  pmActive: boolean;
  pmCompleted: boolean; // True only if checklist done AND no active tasks
  currentTasks: Task[];
  logs: LogEntry[];
  pmChecklistState: PMChecklistState;
  propertyId: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD for multi-day events
  type: 'PM_SCHEDULE' | 'REPAIR_PROJECT' | 'VENDOR' | 'EMPLOYEE_SCHEDULE' | 'EQUIPMENT_TEST' | 'HOTEL_STANDARD';
  description?: string;
  assignedTo?: string;
  recurrence?: 'NONE' | 'WEEKLY' | 'MONTHLY';
  propertyId: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minLevel: number;
  vendor: {
    name: string;
    contact: string;
    website?: string;
  };
  lastUpdated: string;
  propertyId: string;
}
