import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, UserRole, Room, RoomStatus, Task, LogEntry,
  PMChecklistState, InventoryItem, Property, HousekeepingStatus, ChatMessage
} from './types';
import { PM_CHECKLIST_DATA, MOCK_INVENTORY } from './constants';
import { auth, db } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  addDoc, query, orderBy,
} from 'firebase/firestore';

// ─── Assets ──────────────────────────────────────────────────────────────────
import logoVertical from './assets/logo-vertical.png';
import logoHorizontal from './assets/Fxyinn_horizontal_no_bgr_brd.png';
import aiBotImage from './assets/ai-bot.png';

// ─── Anthropic ────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';
import { StayFykedPortal } from './components/stayfyked/StayFykedPortal';
import { ThemeToggle } from './theme';
import { uploadPropertyPdf, openPdf } from './pdf';

// ─── Types ────────────────────────────────────────────────────────────────────
type Portal = 'select' | 'admin-login' | 'staff-login' | 'general-staff-login' | 'admin' | 'staff' | 'general-staff';
type AdminView = 'dashboard' | 'roomgrid' | 'inventory' | 'schematics' | 'settings' | 'issues' | 'calendar';
type StaffView = 'dashboard' | 'myjobs' | 'checklist' | 'roomgrid' | 'inventory' | 'profile';
type GeneralStaffView = 'report' | 'roomgrid' | 'logs' | 'schedule' | 'chat' | 'assistant';
type Lang = 'EN' | 'ES' | 'HI';

// ─── Icon helper ──────────────────────────────────────────────────────────────
const Icon: React.FC<{ name: string; size?: number; filled?: boolean; className?: string }> = ({
  name, size = 20, filled = false, className = ''
}) => (
  <span
    className={`material-symbols-outlined${filled ? ' filled' : ''} ${className}`}
    style={{ fontSize: size }}
  >
    {name}
  </span>
);

// ─── Mock data ────────────────────────────────────────────────────────────────
export const MOCK_PROPERTY: Property = {
  id: 'prop-1',
  name: 'Grandview Resort & Spa',
  floors: 4,
  floorLayouts: [
    { floor: 1, start: 101, end: 112 },
    { floor: 2, start: 201, end: 210 },
    { floor: 3, start: 301, end: 308 },
    { floor: 4, start: 401, end: 406 },
  ],
};

const HOUSEKEEPING_STATUSES: HousekeepingStatus[] = [
  'Vacant', 'Occupied', 'Stay Over', 'Dirty', 'Pending Departure', 'Out of Order'
];

export function generateRooms(property: Property): Room[] {
  const rooms: Room[] = [];
  const statuses = [RoomStatus.COMPLETED, RoomStatus.IN_PROGRESS, RoomStatus.ISSUE_REPORTED, RoomStatus.WAITING_APPROVAL];
  const hkStatuses: HousekeepingStatus[] = ['Vacant', 'Occupied', 'Stay Over', 'Dirty', 'Pending Departure'];
  let i = 0;
  for (const layout of (property.floorLayouts || [])) {
    for (let n = layout.start; n <= layout.end; n++) {
      rooms.push({
        id: `room-${n}`,
        number: String(n),
        floor: layout.floor,
        status: statuses[i % statuses.length],
        housekeepingStatus: hkStatuses[i % hkStatuses.length],
        pmActive: i % 3 === 0,
        pmCompleted: i % 5 === 0,
        currentTasks: i % 3 === 1 ? [
          { id: `t-${n}-1`, description: 'Replace HVAC filter', status: 'IN_PROGRESS', reportedBy: 'E. Thorne', createdAt: new Date().toISOString(), priority: 'HIGH' },
          { id: `t-${n}-2`, description: 'Check smoke detector battery', status: 'PENDING', reportedBy: 'System', createdAt: new Date().toISOString(), priority: 'MEDIUM' },
        ] : [],
        logs: [],
        pmChecklistState: {},
        propertyId: property.id,
      });
      i++;
    }
  }
  return rooms;
}

const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Alexandra Chen', role: UserRole.ADMIN, email: 'admin@fyxinn.io', phone: '555-0100', propertyId: 'prop-1' },
  { id: 'u2', name: 'Elias Thorne', role: UserRole.MAINTENANCE, email: 'elias@fyxinn.io', phone: '555-0101', propertyId: 'prop-1' },
  { id: 'u3', name: 'Marcus Webb', role: UserRole.STAFF, email: 'marcus@fyxinn.io', phone: '555-0102', propertyId: 'prop-1' },
];

const PRESET_AMENITIES = [
  'Lobby', 'Gym', 'Pool Area', 'Restaurant', 'Conference Room',
  'Business Center', 'Spa', 'Parking', 'Laundry Room', 'Bar & Lounge', 'Rooftop Terrace',
];

// ─── Status helpers ───────────────────────────────────────────────────────────
const statusColor = (s: RoomStatus) => {
  switch (s) {
    case RoomStatus.COMPLETED: return 'dot-green';
    case RoomStatus.IN_PROGRESS: return 'dot-yellow';
    case RoomStatus.ISSUE_REPORTED: return 'dot-red';
    case RoomStatus.WAITING_APPROVAL: return 'dot-cyan';
  }
};

const statusLabel = (s: RoomStatus) => {
  switch (s) {
    case RoomStatus.COMPLETED: return 'Vacant/Ready';
    case RoomStatus.IN_PROGRESS: return 'Occupied/Fixing';
    case RoomStatus.ISSUE_REPORTED: return 'Dirty';
    case RoomStatus.WAITING_APPROVAL: return 'Stay Over';
  }
};

const hkColor = (s?: HousekeepingStatus) => {
  switch (s) {
    case 'Vacant': return 'text-primary';
    case 'Occupied': return 'text-secondary';
    case 'Stay Over': return 'text-yellow-400';
    case 'Dirty': return 'text-red-400';
    case 'Pending Departure': return 'text-orange-400';
    case 'Out of Order': return 'text-gray-500';
    default: return 'text-gray-500';
  }
};

// ─── Language labels ──────────────────────────────────────────────────────────
const LANG_LABELS: Record<Lang, Record<string, string>> = {
  EN: {
    // Auth
    login: 'Initialize Session',
    email: 'System Email',
    password: 'Access Code',
    operatorId: 'User Email',
    pin: 'System PIN',
    staffLogin: 'LOG IN',
    back: 'Back',
    adminTerminal: 'Admin Access Terminal',
    createAdminAccount: 'Create Admin Account',
    fullName: 'Full Name',
    confirmPassword: 'Confirm Password',
    confirmPin: 'Confirm PIN',
    processing: 'Processing...',
    createAccount: 'Create Account',
    noAccount: "Don't have an account? Create one",
    haveAccount: 'Already have an account? Sign in',
    secureEncrypted: 'SECURE · ENCRYPTED · FYXINN SYSTEMS',
    nameRequired: 'Name is required.',
    passwordMismatch: 'Passwords do not match.',
    passwordTooShort: 'Password must be at least 6 characters.',
    invalidCredentials: 'Invalid credentials. Try admin@fyxinn.io',
    newStaffAccount: 'New Staff Account',
    staffAccess: 'FYXINN STAFF ACCESS v1.0',
    pinRequired: 'PIN must be 4 digits.',
    pinMismatch: 'PINs do not match.',
    operatorRequired: 'User Email is required.',
    // Portal select
    hotelPlatform: 'Hotel Maintenance Platform',
    adminPortal: 'Admin Portal',
    staffPortal: 'Staff Portal',
    secureAccess: 'FYXINN v1.0 · SECURE ACCESS',
    // Nav / sidebar
    welcome: 'Good morning',
    goodAfternoon: 'Good afternoon',
    goodEvening: 'Good evening',
    myJobs: 'My Jobs',
    reportIssue: 'Report Issue',
    alertAdmin: 'Alert Admin',
    roomGrid: 'Room Grid',
    inventory: 'Inventory',
    profile: 'Profile',
    dashboard: 'Dashboard',
    schematics: 'Schematics',
    settings: 'Settings',
    activeFacility: 'Active Facility',
    online: 'ONLINE',
    logout: 'Logout',
    // Admin Dashboard
    unitStatusDashboard: 'Unit Status Dashboard',
    liveFeed: 'Live Feed',
    live: 'LIVE',
    totalUnits: 'Total Units',
    inMaintenance: 'In Maintenance',
    critical: 'Critical',
    efficiency: 'Efficiency',
    units: 'units',
    unit: 'UNIT',
    vacantReady: 'Vacant/Ready',
    occupiedFixing: 'Occupied/Fixing',
    dirty: 'Dirty',
    stayOver: 'Stay Over',
    task: 'task',
    tasks: 'tasks',
    floor: 'Floor',
    // Admin Room Grid
    selectUnit: 'Select Unit',
    room: 'Room',
    activeTickets: 'Active Tickets',
    pending: 'Pending',
    noActiveTickets: 'No active tickets',
    pmChecklist: 'PM Checklist',
    evidenceUpload: 'Evidence Upload',
    before: 'Before',
    after: 'After',
    aiSuggestion: 'AI Suggestion',
    by: 'by',
    // Admin Inventory
    inventoryMatrix: 'Inventory Matrix',
    assetTracking: 'Asset tracking & vendor nodes',
    addAsset: 'Add Asset',
    totalAssets: 'Total Assets',
    lowStockAlerts: 'Low Stock Alerts',
    pendingOrders: 'Pending Orders',
    estValuation: 'Est. Valuation',
    searchAssets: 'Search assets, SKU, vendor...',
    lowStock: 'LOW STOCK',
    normal: 'NORMAL',
    showing: 'Showing',
    of: 'of',
    assets: 'assets',
    // Admin Schematics
    propertySchematics: 'Property Schematics',
    blueprintArchive: 'Blueprint archive · PDF & DWG support',
    dropFiles: 'Drop schematic files here',
    fileSupport: 'Supports PDF, DWG up to 256 MB',
    browseFiles: 'Browse Files',
    uploadedFiles: 'Uploaded Files',
    storageMetrics: 'Storage Metrics',
    storageUsed: 'Used',
    storageTotal: 'Total',
    pdfFiles: 'PDF Files',
    dwgFiles: 'DWG Files',
    quickTips: 'Quick Tips',
    tipDWG: 'Upload DWG for interactive floor plans',
    tipPDF: 'PDF schematics support annotation',
    tipEncrypted: 'Files are encrypted at rest',
    // Admin Settings
    systemSettings: 'System Settings',
    propertyConfig: 'Property configuration & admin controls',
    adminProfile: 'Admin Profile',
    facility: 'Facility',
    floors: 'floors',
    // Staff Dashboard
    tasksAssigned: '4 tasks assigned',
    flagRoom: 'Flag a room or system',
    escalateAdmin: 'Escalate to admin',
    currentLoad: 'Current Load',
    performance: 'Performance',
    closedToday: 'closed today',
    recentActivity: 'Recent Activity',
    // Staff My Jobs
    assigned: 'assigned',
    startUpdate: 'Start / Update',
    photo: 'Photo',
    // Staff Checklist
    completePM: 'Complete PM',
    // Staff Room Grid
    ready: 'Ready',
    maint: 'Maint.',
    occupancy: 'Occupancy',
    // Staff Inventory
    partsMaterials: 'Parts & Materials',
    searchParts: 'Search parts...',
    inStock: 'in stock',
    usedQty: 'used',
    reportUsage: 'Report Usage',
    submitAllUsage: 'Submit All Usage',
    // Staff Profile
    chiefEngineer: 'Chief Engineer',
    contactProtocols: 'Contact Protocols',
    emailLabel: 'Email',
    phoneLabel: 'Phone',
    securityMatrix: 'Security Matrix',
    changePIN: 'Change PIN',
    update: 'Update',
    twoFactorAuth: 'Two-Factor Auth',
    languageInterface: 'Language Interface',
    signOut: 'Sign Out',
    // New shared keys
    issues: 'Issues',
    syncCsv: 'Sync CSV',
    pm: 'PM',
    issueQueue: 'Issue Queue',
    noIssues: 'No issues in this category',
    reportedBy: 'Reported by',
    issuePhoto: 'Issue Photo',
    repairPhoto: 'Repair Photo',
    techNotes: 'Tech Notes',
    respondToIssue: 'Respond to Issue',
    updateResponse: 'Update Response',
    attachRepairPhoto: 'Attach repair photo',
    describeRepair: 'Describe the repair performed…',
    markInProgress: 'Mark In Progress',
    markComplete: 'Mark Complete',
    openIssues: 'Open Issues',
    reported: 'reported',
    resolved: 'Resolved',
    completedLabel: 'completed',
    submitted: 'submitted',
    editProfile: 'Edit Profile',
    myReports: 'My Reports',
    noIssuesReported: 'No issues reported yet',
    markAsCompleted: 'Mark as Completed',
    completeRepair: 'Complete Repair',
    notes: 'Notes',
    describeRepaired: 'Describe what was repaired…',
    cancel: 'Cancel',
    submitCompletion: 'Submit Completion',
    camera: 'Camera',
    gallery: 'Gallery',
    remove: 'Remove',
    saveChanges: 'Save Changes',
    saved: 'Saved!',
    syncCsvTitle: 'Sync Room Status via CSV',
    dropCsvHere: 'Drop your CSV here or tap to browse',
    csvFilesOnly: '.csv files only',
    expectedFormat: 'Expected Format',
    totalRows: 'Total Rows',
    willUpdate: 'Will Update',
    noMatch: 'No Match',
    matchLabel: 'MATCH',
    skipLabel: 'SKIP',
    reUpload: 'Re-upload',
    applySync: 'Apply Sync',
    roomLocation: 'Room / Location',
    descriptionLabel: 'Description *',
    priorityLabel: 'Priority',
    photoOptional: 'Photo (optional)',
    retake: 'Retake',
    submitIssue: 'Submit Issue',
    colComponent: 'Component Name',
    colCategory: 'Category',
    colStock: 'Stock Level',
    colThreshold: 'Threshold',
    colVendor: 'Vendor Node',
    colStatus: 'Status',
    housekeepingLabel: 'Housekeeping',
    checkoutLabel: 'Checkout',
    newStatus: 'New Status',
    // Calendar
    calendar: 'Calendar',
    calendarSchedule: 'Maintenance Calendar',
    calendarSubtitle: 'Schedule · Projects · Staff · Equipment',
    addEvent: 'Add Event',
    uploadSchedule: 'Upload Schedule',
    today: 'Today',
    eventType: 'Event Type',
    pmSchedule: 'PM Schedule',
    repairProject: 'Repair Project',
    vendorVisit: 'Vendor Visit',
    employeeSchedule: 'Employee Schedule',
    equipmentTest: 'Equipment Test',
    hotelStandard: 'Hotel Standard',
    allTypes: 'All Types',
    eventTitle: 'Event Title',
    eventDate: 'Start Date',
    eventEndDate: 'End Date (optional)',
    eventDescription: 'Description',
    eventAssignedTo: 'Assigned To',
    eventRecurrence: 'Recurrence',
    recurrenceNone: 'None',
    recurrenceWeekly: 'Weekly',
    recurrenceMonthly: 'Monthly',
    addToCalendar: 'Add to Calendar',
    editEvent: 'Edit Event',
    deleteEvent: 'Delete Event',
    uploadScheduleTitle: 'Upload Schedule Document',
    uploadScheduleSubtitle: 'Import events from CSV',
    csvScheduleFormat: 'CSV Format: date, title, type, description, assignedTo',
    parseSchedule: 'Import Events',
    eventsImported: 'events found',
    // Property Management
    addProperty: 'Add New Property',
    editProperty: 'Edit Property',
    propertyName: 'Property Name',
    propertyAddress: 'Property Address',
    propertyPhone: 'Property Phone',
    floorCount: 'Number of Floors',
    roomNumbering: 'Room Numbering',
    floorLabel: 'Floor',
    commonAreasAmenities: 'Common Areas & Amenities',
    uploadSchematics: 'Upload Schematics',
    companyLogo: 'Company Logo',
    properties: 'Properties',
    noProperties: 'No properties added yet',
    saveProperty: 'Save Property',
    propertyCreated: 'Property Created!',
    propertyNameRequired: 'Property name is required.',
    propertyRequired: 'Please select at least one property.',
    selectPropertyLabel: 'Working Property',
    selectPropertyHint: 'Select the property or properties you work at',
    customAmenity: 'Add custom area...',
    addAmenity: 'Add',
    roomsLabel: 'rooms',
    switchProperty: 'Switch Property',
    removeProperty: 'Remove Property',
    confirmRemove: 'Remove this property? This cannot be undone.',
    cannotRemoveLast: 'Cannot remove the only property',
    // General Staff Portal
    generalStaffPortal: 'General Staff Portal',
    generalStaffAccess: 'FYXINN GENERAL STAFF ACCESS v1.0',
    reportAnIssue: 'Report an Issue',
    reportSubtitle: 'Tap to report a room or area issue',
    issueSubmitted: 'Issue submitted successfully!',
    onDutyTech: 'On-Duty Technician',
    noTechOnDuty: 'No technician scheduled for this shift',
    currentShift: 'Current Shift',
    allTechs: 'All Technicians',
    roomLogs: 'Room Logs',
    filterByRoom: 'Filter by room...',
    noLogs: 'No logs found',
    aiAssistant: 'Repair Assistant',
    assistantWelcome: 'Hi! I can help with simple repair tips. What issue are you facing?',
    typeYourQuestion: 'Describe the issue...',
    thinking: 'Thinking...',
    chatWithTech: 'Chat with Tech',
    selectTaskToChat: 'Select an issue to open chat',
    noTasksToChat: 'No active issues to chat about',
    myLang: 'My Language',
    translateMessages: 'Auto-translate messages',
    sendMessage: 'Send',
    typeMessage: 'Type a message...',
    translating: 'Translating...',
    you: 'You',
    tech: 'Tech',
    issueReported: 'Issue Reported',
    scheduleView: 'Schedule',
    contactLabel: 'Contact',
  },
  ES: {
    // Auth
    login: 'Iniciar Sesión',
    email: 'Correo del Sistema',
    password: 'Código de Acceso',
    operatorId: 'Correo del Usuario',
    pin: 'PIN del Sistema',
    staffLogin: 'ENTRAR',
    back: 'Volver',
    adminTerminal: 'Terminal de Acceso Admin',
    createAdminAccount: 'Crear Cuenta Admin',
    fullName: 'Nombre Completo',
    confirmPassword: 'Confirmar Contraseña',
    confirmPin: 'Confirmar PIN',
    processing: 'Procesando...',
    createAccount: 'Crear Cuenta',
    noAccount: '¿Sin cuenta? Crear una',
    haveAccount: '¿Ya tienes cuenta? Iniciar sesión',
    secureEncrypted: 'SEGURO · CIFRADO · FYXINN SISTEMAS',
    nameRequired: 'El nombre es obligatorio.',
    passwordMismatch: 'Las contraseñas no coinciden.',
    passwordTooShort: 'La contraseña debe tener al menos 6 caracteres.',
    invalidCredentials: 'Credenciales inválidas. Prueba admin@fyxinn.io',
    newStaffAccount: 'Nueva Cuenta de Personal',
    staffAccess: 'ACCESO PERSONAL FYXINN v1.0',
    pinRequired: 'El PIN debe tener 4 dígitos.',
    pinMismatch: 'Los PIN no coinciden.',
    operatorRequired: 'El correo del usuario es obligatorio.',
    // Portal select
    hotelPlatform: 'Plataforma de Mantenimiento Hotelero',
    adminPortal: 'Portal Admin',
    staffPortal: 'Portal de Personal',
    secureAccess: 'FYXINN v1.0 · ACCESO SEGURO',
    // Nav / sidebar
    welcome: 'Buenos días',
    goodAfternoon: 'Buenas tardes',
    goodEvening: 'Buenas noches',
    myJobs: 'Mis Tareas',
    reportIssue: 'Reportar Problema',
    alertAdmin: 'Alertar Admin',
    roomGrid: 'Cuadrícula',
    inventory: 'Inventario',
    profile: 'Perfil',
    dashboard: 'Tablero',
    schematics: 'Esquemas',
    settings: 'Ajustes',
    activeFacility: 'Instalación Activa',
    online: 'EN LÍNEA',
    logout: 'Cerrar Sesión',
    // Admin Dashboard
    unitStatusDashboard: 'Panel de Estado de Unidades',
    liveFeed: 'Transmisión en Vivo',
    live: 'EN VIVO',
    totalUnits: 'Total de Unidades',
    inMaintenance: 'En Mantenimiento',
    critical: 'Crítico',
    efficiency: 'Eficiencia',
    units: 'unidades',
    unit: 'UNIDAD',
    vacantReady: 'Vacante/Listo',
    occupiedFixing: 'Ocupado/Reparando',
    dirty: 'Sucio',
    stayOver: 'Estadía Extendida',
    task: 'tarea',
    tasks: 'tareas',
    floor: 'Piso',
    // Admin Room Grid
    selectUnit: 'Seleccionar Unidad',
    room: 'Habitación',
    activeTickets: 'Tickets Activos',
    pending: 'Pendiente',
    noActiveTickets: 'Sin tickets activos',
    pmChecklist: 'Lista de Verificación PM',
    evidenceUpload: 'Subida de Evidencia',
    before: 'Antes',
    after: 'Después',
    aiSuggestion: 'Sugerencia IA',
    by: 'por',
    // Admin Inventory
    inventoryMatrix: 'Matriz de Inventario',
    assetTracking: 'Seguimiento de activos y proveedores',
    addAsset: 'Agregar Activo',
    totalAssets: 'Total de Activos',
    lowStockAlerts: 'Alertas de Bajo Stock',
    pendingOrders: 'Pedidos Pendientes',
    estValuation: 'Val. Estimada',
    searchAssets: 'Buscar activos, SKU, proveedor...',
    lowStock: 'STOCK BAJO',
    normal: 'NORMAL',
    showing: 'Mostrando',
    of: 'de',
    assets: 'activos',
    // Admin Schematics
    propertySchematics: 'Esquemas de Propiedad',
    blueprintArchive: 'Archivo de planos · Soporte PDF & DWG',
    dropFiles: 'Soltar archivos de planos aquí',
    fileSupport: 'Admite PDF, DWG hasta 256 MB',
    browseFiles: 'Examinar Archivos',
    uploadedFiles: 'Archivos Subidos',
    storageMetrics: 'Métricas de Almacenamiento',
    storageUsed: 'Usado',
    storageTotal: 'Total',
    pdfFiles: 'Archivos PDF',
    dwgFiles: 'Archivos DWG',
    quickTips: 'Consejos Rápidos',
    tipDWG: 'Sube DWG para planos interactivos',
    tipPDF: 'Los esquemas PDF admiten anotaciones',
    tipEncrypted: 'Los archivos están cifrados en reposo',
    // Admin Settings
    systemSettings: 'Configuración del Sistema',
    propertyConfig: 'Configuración de propiedad y controles admin',
    adminProfile: 'Perfil Admin',
    facility: 'Instalación',
    floors: 'pisos',
    // Staff Dashboard
    tasksAssigned: '4 tareas asignadas',
    flagRoom: 'Marcar una habitación o sistema',
    escalateAdmin: 'Escalar al admin',
    currentLoad: 'Carga Actual',
    performance: 'Rendimiento',
    closedToday: 'cerrado hoy',
    recentActivity: 'Actividad Reciente',
    // Staff My Jobs
    assigned: 'asignadas',
    startUpdate: 'Iniciar / Actualizar',
    photo: 'Foto',
    // Staff Checklist
    completePM: 'Completar PM',
    // Staff Room Grid
    ready: 'Listo',
    maint: 'Mant.',
    occupancy: 'Ocupación',
    // Staff Inventory
    partsMaterials: 'Partes y Materiales',
    searchParts: 'Buscar partes...',
    inStock: 'en stock',
    usedQty: 'usado',
    reportUsage: 'Reportar Uso',
    submitAllUsage: 'Enviar Todo el Uso',
    // Staff Profile
    chiefEngineer: 'Ingeniero Jefe',
    contactProtocols: 'Protocolos de Contacto',
    emailLabel: 'Correo',
    phoneLabel: 'Teléfono',
    securityMatrix: 'Matriz de Seguridad',
    changePIN: 'Cambiar PIN',
    update: 'Actualizar',
    twoFactorAuth: 'Autenticación de Dos Factores',
    languageInterface: 'Interfaz de Idioma',
    signOut: 'Cerrar Sesión',
    // New shared keys
    issues: 'Problemas',
    syncCsv: 'Sincronizar CSV',
    pm: 'PM',
    issueQueue: 'Cola de Problemas',
    noIssues: 'No hay problemas en esta categoría',
    reportedBy: 'Reportado por',
    issuePhoto: 'Foto del Problema',
    repairPhoto: 'Foto de Reparación',
    techNotes: 'Notas Técnicas',
    respondToIssue: 'Responder al Problema',
    updateResponse: 'Actualizar Respuesta',
    attachRepairPhoto: 'Adjuntar foto de reparación',
    describeRepair: 'Describe la reparación realizada…',
    markInProgress: 'Marcar En Progreso',
    markComplete: 'Marcar Completo',
    openIssues: 'Problemas Abiertos',
    reported: 'reportados',
    resolved: 'Resueltos',
    completedLabel: 'completados',
    submitted: 'enviados',
    editProfile: 'Editar Perfil',
    myReports: 'Mis Reportes',
    noIssuesReported: 'Sin problemas reportados aún',
    markAsCompleted: 'Marcar como Completado',
    completeRepair: 'Completar Reparación',
    notes: 'Notas',
    describeRepaired: 'Describe lo que fue reparado…',
    cancel: 'Cancelar',
    submitCompletion: 'Enviar Completado',
    camera: 'Cámara',
    gallery: 'Galería',
    remove: 'Eliminar',
    saveChanges: 'Guardar Cambios',
    saved: '¡Guardado!',
    syncCsvTitle: 'Sincronizar Estado de Habitaciones via CSV',
    dropCsvHere: 'Suelta tu CSV aquí o toca para navegar',
    csvFilesOnly: 'Solo archivos .csv',
    expectedFormat: 'Formato Esperado',
    totalRows: 'Total de Filas',
    willUpdate: 'Se Actualizará',
    noMatch: 'Sin Coincidencia',
    matchLabel: 'COINCIDE',
    skipLabel: 'OMITIR',
    reUpload: 'Volver a subir',
    applySync: 'Aplicar Sync',
    roomLocation: 'Habitación / Ubicación',
    descriptionLabel: 'Descripción *',
    priorityLabel: 'Prioridad',
    photoOptional: 'Foto (opcional)',
    retake: 'Retomar',
    submitIssue: 'Enviar Problema',
    colComponent: 'Nombre del Componente',
    colCategory: 'Categoría',
    colStock: 'Nivel de Stock',
    colThreshold: 'Umbral',
    colVendor: 'Proveedor',
    colStatus: 'Estado',
    housekeepingLabel: 'Limpieza',
    checkoutLabel: 'Salida',
    newStatus: 'Nuevo Estado',
    // Calendar
    calendar: 'Calendario',
    calendarSchedule: 'Calendario de Mantenimiento',
    calendarSubtitle: 'Horario · Proyectos · Personal · Equipos',
    addEvent: 'Agregar Evento',
    uploadSchedule: 'Subir Horario',
    today: 'Hoy',
    eventType: 'Tipo de Evento',
    pmSchedule: 'Horario PM',
    repairProject: 'Proyecto de Reparación',
    vendorVisit: 'Visita de Proveedor',
    employeeSchedule: 'Horario de Personal',
    equipmentTest: 'Prueba de Equipo',
    hotelStandard: 'Estándar Hotelero',
    allTypes: 'Todos los Tipos',
    eventTitle: 'Título del Evento',
    eventDate: 'Fecha de Inicio',
    eventEndDate: 'Fecha de Fin (opcional)',
    eventDescription: 'Descripción',
    eventAssignedTo: 'Asignado a',
    eventRecurrence: 'Recurrencia',
    recurrenceNone: 'Ninguna',
    recurrenceWeekly: 'Semanal',
    recurrenceMonthly: 'Mensual',
    addToCalendar: 'Agregar al Calendario',
    editEvent: 'Editar Evento',
    deleteEvent: 'Eliminar Evento',
    uploadScheduleTitle: 'Subir Documento de Horario',
    uploadScheduleSubtitle: 'Importar eventos desde CSV',
    csvScheduleFormat: 'Formato CSV: fecha, título, tipo, descripción, asignado',
    parseSchedule: 'Importar Eventos',
    eventsImported: 'eventos encontrados',
    // Property Management
    addProperty: 'Agregar Nueva Propiedad',
    editProperty: 'Editar Propiedad',
    propertyName: 'Nombre de la Propiedad',
    propertyAddress: 'Dirección de la Propiedad',
    propertyPhone: 'Teléfono de la Propiedad',
    floorCount: 'Número de Pisos',
    roomNumbering: 'Numeración de Habitaciones',
    floorLabel: 'Piso',
    commonAreasAmenities: 'Áreas Comunes y Comodidades',
    uploadSchematics: 'Subir Esquemas',
    companyLogo: 'Logo de la Empresa',
    properties: 'Propiedades',
    noProperties: 'Aún no se han agregado propiedades',
    saveProperty: 'Guardar Propiedad',
    propertyCreated: '¡Propiedad Creada!',
    propertyNameRequired: 'El nombre de la propiedad es obligatorio.',
    propertyRequired: 'Por favor selecciona al menos una propiedad.',
    selectPropertyLabel: 'Propiedad de Trabajo',
    selectPropertyHint: 'Selecciona la propiedad o propiedades donde trabajas',
    customAmenity: 'Agregar área personalizada...',
    addAmenity: 'Agregar',
    roomsLabel: 'habitaciones',
    switchProperty: 'Cambiar Propiedad',
    removeProperty: 'Eliminar Propiedad',
    confirmRemove: '¿Eliminar esta propiedad? Esto no se puede deshacer.',
    cannotRemoveLast: 'No se puede eliminar la única propiedad',
    // General Staff Portal
    generalStaffPortal: 'Portal de Personal General',
    generalStaffAccess: 'ACCESO PERSONAL GENERAL FYXINN v1.0',
    reportAnIssue: 'Reportar un Problema',
    reportSubtitle: 'Toca para reportar un problema en habitación o área',
    issueSubmitted: '¡Problema enviado con éxito!',
    onDutyTech: 'Técnico de Guardia',
    noTechOnDuty: 'No hay técnico programado para este turno',
    currentShift: 'Turno Actual',
    allTechs: 'Todos los Técnicos',
    roomLogs: 'Registros de Habitación',
    filterByRoom: 'Filtrar por habitación...',
    noLogs: 'No se encontraron registros',
    aiAssistant: 'Asistente de Reparación',
    assistantWelcome: '¡Hola! Puedo ayudar con consejos de reparación simple. ¿Cuál es el problema?',
    typeYourQuestion: 'Describe el problema...',
    thinking: 'Pensando...',
    chatWithTech: 'Chat con Técnico',
    selectTaskToChat: 'Selecciona un problema para abrir el chat',
    noTasksToChat: 'No hay problemas activos para chatear',
    myLang: 'Mi Idioma',
    translateMessages: 'Auto-traducir mensajes',
    sendMessage: 'Enviar',
    typeMessage: 'Escribe un mensaje...',
    translating: 'Traduciendo...',
    you: 'Tú',
    tech: 'Técnico',
    issueReported: 'Problema Reportado',
    scheduleView: 'Horario',
    contactLabel: 'Contacto',
  },
  HI: {
    // Auth
    login: 'सत्र प्रारंभ करें',
    email: 'सिस्टम ईमेल',
    password: 'एक्सेस कोड',
    operatorId: 'उपयोगकर्ता ईमेल',
    pin: 'सिस्टम PIN',
    staffLogin: 'लॉग इन',
    back: 'वापस',
    adminTerminal: 'एडमिन एक्सेस टर्मिनल',
    createAdminAccount: 'एडमिन खाता बनाएं',
    fullName: 'पूरा नाम',
    confirmPassword: 'पासवर्ड की पुष्टि करें',
    confirmPin: 'PIN की पुष्टि करें',
    processing: 'प्रक्रिया में...',
    createAccount: 'खाता बनाएं',
    noAccount: 'खाता नहीं है? एक बनाएं',
    haveAccount: 'खाता है? साइन इन करें',
    secureEncrypted: 'सुरक्षित · एन्क्रिप्टेड · FYXINN सिस्टम',
    nameRequired: 'नाम आवश्यक है।',
    passwordMismatch: 'पासवर्ड मेल नहीं खाते।',
    passwordTooShort: 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।',
    invalidCredentials: 'अमान्य क्रेडेंशियल। admin@fyxinn.io आज़माएं',
    newStaffAccount: 'नया स्टाफ खाता',
    staffAccess: 'FYXINN स्टाफ एक्सेस v1.0',
    pinRequired: 'PIN 4 अंकों का होना चाहिए।',
    pinMismatch: 'PIN मेल नहीं खाते।',
    operatorRequired: 'उपयोगकर्ता ईमेल आवश्यक है।',
    // Portal select
    hotelPlatform: 'होटल रखरखाव प्लेटफॉर्म',
    adminPortal: 'एडमिन पोर्टल',
    staffPortal: 'स्टाफ पोर्टल',
    secureAccess: 'FYXINN v1.0 · सुरक्षित पहुंच',
    // Nav / sidebar
    welcome: 'सुप्रभात',
    goodAfternoon: 'नमस्कार',
    goodEvening: 'शुभ संध्या',
    myJobs: 'मेरे काम',
    reportIssue: 'समस्या रिपोर्ट',
    alertAdmin: 'एडमिन अलर्ट',
    roomGrid: 'रूम ग्रिड',
    inventory: 'इन्वेंटरी',
    profile: 'प्रोफ़ाइल',
    dashboard: 'डैशबोर्ड',
    schematics: 'स्कीमेटिक्स',
    settings: 'सेटिंग्स',
    activeFacility: 'सक्रिय सुविधा',
    online: 'ऑनलाइन',
    logout: 'लॉगआउट',
    // Admin Dashboard
    unitStatusDashboard: 'यूनिट स्थिति डैशबोर्ड',
    liveFeed: 'लाइव फ़ीड',
    live: 'लाइव',
    totalUnits: 'कुल इकाइयां',
    inMaintenance: 'रखरखाव में',
    critical: 'महत्वपूर्ण',
    efficiency: 'दक्षता',
    units: 'इकाइयां',
    unit: 'यूनिट',
    vacantReady: 'खाली/तैयार',
    occupiedFixing: 'व्यस्त/मरम्मत',
    dirty: 'गंदा',
    stayOver: 'ठहरना',
    task: 'काम',
    tasks: 'काम',
    floor: 'मंजिल',
    // Admin Room Grid
    selectUnit: 'यूनिट चुनें',
    room: 'कमरा',
    activeTickets: 'सक्रिय टिकट',
    pending: 'लंबित',
    noActiveTickets: 'कोई सक्रिय टिकट नहीं',
    pmChecklist: 'PM चेकलिस्ट',
    evidenceUpload: 'साक्ष्य अपलोड',
    before: 'पहले',
    after: 'बाद',
    aiSuggestion: 'AI सुझाव',
    by: 'द्वारा',
    // Admin Inventory
    inventoryMatrix: 'इन्वेंटरी मैट्रिक्स',
    assetTracking: 'संपत्ति ट्रैकिंग और विक्रेता नोड्स',
    addAsset: 'संपत्ति जोड़ें',
    totalAssets: 'कुल संपत्ति',
    lowStockAlerts: 'कम स्टॉक अलर्ट',
    pendingOrders: 'लंबित ऑर्डर',
    estValuation: 'अनुमानित मूल्य',
    searchAssets: 'संपत्ति, SKU, विक्रेता खोजें...',
    lowStock: 'कम स्टॉक',
    normal: 'सामान्य',
    showing: 'दिखा रहा है',
    of: 'में से',
    assets: 'संपत्ति',
    // Admin Schematics
    propertySchematics: 'संपत्ति स्कीमेटिक्स',
    blueprintArchive: 'ब्लूप्रिंट संग्रह · PDF & DWG समर्थन',
    dropFiles: 'यहाँ स्कीमेटिक फ़ाइलें डालें',
    fileSupport: 'PDF, DWG 256 MB तक समर्थित',
    browseFiles: 'फ़ाइलें ब्राउज़ करें',
    uploadedFiles: 'अपलोड की गई फ़ाइलें',
    storageMetrics: 'स्टोरेज मेट्रिक्स',
    storageUsed: 'उपयोग किया',
    storageTotal: 'कुल',
    pdfFiles: 'PDF फ़ाइलें',
    dwgFiles: 'DWG फ़ाइलें',
    quickTips: 'त्वरित सुझाव',
    tipDWG: 'इंटरएक्टिव फ्लोर प्लान के लिए DWG अपलोड करें',
    tipPDF: 'PDF स्कीमेटिक्स एनोटेशन का समर्थन करते हैं',
    tipEncrypted: 'फ़ाइलें एन्क्रिप्टेड हैं',
    // Admin Settings
    systemSettings: 'सिस्टम सेटिंग्स',
    propertyConfig: 'संपत्ति कॉन्फ़िगरेशन और एडमिन नियंत्रण',
    adminProfile: 'एडमिन प्रोफ़ाइल',
    facility: 'सुविधा',
    floors: 'मंजिलें',
    // Staff Dashboard
    tasksAssigned: '4 काम सौंपे गए',
    flagRoom: 'कमरे या सिस्टम को फ्लैग करें',
    escalateAdmin: 'एडमिन को एस्केलेट करें',
    currentLoad: 'वर्तमान भार',
    performance: 'प्रदर्शन',
    closedToday: 'आज बंद',
    recentActivity: 'हाल की गतिविधि',
    // Staff My Jobs
    assigned: 'सौंपे गए',
    startUpdate: 'शुरू / अपडेट',
    photo: 'फोटो',
    // Staff Checklist
    completePM: 'PM पूर्ण करें',
    // Staff Room Grid
    ready: 'तैयार',
    maint: 'रखरखाव',
    occupancy: 'अधिभोग',
    // Staff Inventory
    partsMaterials: 'पुर्जे और सामग्री',
    searchParts: 'पुर्जे खोजें...',
    inStock: 'स्टॉक में',
    usedQty: 'उपयोग किया',
    reportUsage: 'उपयोग रिपोर्ट',
    submitAllUsage: 'सभी उपयोग सबमिट करें',
    // Staff Profile
    chiefEngineer: 'मुख्य इंजीनियर',
    contactProtocols: 'संपर्क प्रोटोकॉल',
    emailLabel: 'ईमेल',
    phoneLabel: 'फोन',
    securityMatrix: 'सुरक्षा मैट्रिक्स',
    changePIN: 'PIN बदलें',
    update: 'अपडेट',
    twoFactorAuth: 'दो-कारक प्रमाणीकरण',
    languageInterface: 'भाषा इंटरफ़ेस',
    signOut: 'साइन आउट',
    // New shared keys
    issues: 'समस्याएं',
    syncCsv: 'CSV सिंक',
    pm: 'PM',
    issueQueue: 'समस्या क्यू',
    noIssues: 'इस श्रेणी में कोई समस्या नहीं',
    reportedBy: 'द्वारा रिपोर्ट',
    issuePhoto: 'समस्या फोटो',
    repairPhoto: 'मरम्मत फोटो',
    techNotes: 'तकनीकी नोट्स',
    respondToIssue: 'समस्या का जवाब दें',
    updateResponse: 'जवाब अपडेट करें',
    attachRepairPhoto: 'मरम्मत फोटो संलग्न करें',
    describeRepair: 'की गई मरम्मत का वर्णन करें…',
    markInProgress: 'प्रगति में चिह्नित करें',
    markComplete: 'पूर्ण चिह्नित करें',
    openIssues: 'खुली समस्याएं',
    reported: 'रिपोर्ट की गई',
    resolved: 'हल की गई',
    completedLabel: 'पूर्ण',
    submitted: 'सबमिट की गई',
    editProfile: 'प्रोफ़ाइल संपादित करें',
    myReports: 'मेरी रिपोर्ट',
    noIssuesReported: 'अभी तक कोई समस्या रिपोर्ट नहीं',
    markAsCompleted: 'पूर्ण के रूप में चिह्नित करें',
    completeRepair: 'मरम्मत पूर्ण करें',
    notes: 'नोट्स',
    describeRepaired: 'जो मरम्मत हुई उसका वर्णन करें…',
    cancel: 'रद्द करें',
    submitCompletion: 'पूर्णता सबमिट करें',
    camera: 'कैमरा',
    gallery: 'गैलरी',
    remove: 'हटाएं',
    saveChanges: 'परिवर्तन सहेजें',
    saved: 'सहेजा गया!',
    syncCsvTitle: 'CSV से रूम स्टेटस सिंक करें',
    dropCsvHere: 'यहाँ CSV डालें या ब्राउज़ करें',
    csvFilesOnly: 'केवल .csv फ़ाइलें',
    expectedFormat: 'अपेक्षित प्रारूप',
    totalRows: 'कुल पंक्तियां',
    willUpdate: 'अपडेट होगा',
    noMatch: 'कोई मिलान नहीं',
    matchLabel: 'मिलान',
    skipLabel: 'छोड़ें',
    reUpload: 'फिर से अपलोड',
    applySync: 'सिंक लागू करें',
    roomLocation: 'कमरा / स्थान',
    descriptionLabel: 'विवरण *',
    priorityLabel: 'प्राथमिकता',
    photoOptional: 'फोटो (वैकल्पिक)',
    retake: 'फिर से लें',
    submitIssue: 'समस्या सबमिट करें',
    colComponent: 'घटक का नाम',
    colCategory: 'श्रेणी',
    colStock: 'स्टॉक स्तर',
    colThreshold: 'सीमा',
    colVendor: 'विक्रेता नोड',
    colStatus: 'स्थिति',
    housekeepingLabel: 'हाउसकीपिंग',
    checkoutLabel: 'चेकआउट',
    newStatus: 'नई स्थिति',
    // Calendar
    calendar: 'कैलेंडर',
    calendarSchedule: 'रखरखाव कैलेंडर',
    calendarSubtitle: 'शेड्यूल · परियोजनाएं · कर्मचारी · उपकरण',
    addEvent: 'इवेंट जोड़ें',
    uploadSchedule: 'शेड्यूल अपलोड',
    today: 'आज',
    eventType: 'इवेंट प्रकार',
    pmSchedule: 'PM शेड्यूल',
    repairProject: 'मरम्मत परियोजना',
    vendorVisit: 'विक्रेता भ्रमण',
    employeeSchedule: 'कर्मचारी शेड्यूल',
    equipmentTest: 'उपकरण परीक्षण',
    hotelStandard: 'होटल मानक',
    allTypes: 'सभी प्रकार',
    eventTitle: 'इवेंट शीर्षक',
    eventDate: 'आरंभ तिथि',
    eventEndDate: 'समाप्ति तिथि (वैकल्पिक)',
    eventDescription: 'विवरण',
    eventAssignedTo: 'को सौंपा गया',
    eventRecurrence: 'पुनरावृत्ति',
    recurrenceNone: 'कोई नहीं',
    recurrenceWeekly: 'साप्ताहिक',
    recurrenceMonthly: 'मासिक',
    addToCalendar: 'कैलेंडर में जोड़ें',
    editEvent: 'इवेंट संपादित करें',
    deleteEvent: 'इवेंट हटाएं',
    uploadScheduleTitle: 'शेड्यूल दस्तावेज़ अपलोड करें',
    uploadScheduleSubtitle: 'CSV से इवेंट आयात करें',
    csvScheduleFormat: 'CSV प्रारूप: तिथि, शीर्षक, प्रकार, विवरण, सौंपा गया',
    parseSchedule: 'इवेंट आयात करें',
    eventsImported: 'इवेंट मिले',
    // Property Management
    addProperty: 'नई संपत्ति जोड़ें',
    editProperty: 'संपत्ति संपादित करें',
    propertyName: 'संपत्ति का नाम',
    propertyAddress: 'संपत्ति का पता',
    propertyPhone: 'संपत्ति का फोन',
    floorCount: 'मंजिलों की संख्या',
    roomNumbering: 'कमरा क्रमांकन',
    floorLabel: 'मंजिल',
    commonAreasAmenities: 'सामान्य क्षेत्र और सुविधाएं',
    uploadSchematics: 'स्कीमेटिक्स अपलोड करें',
    companyLogo: 'कंपनी लोगो',
    properties: 'संपत्तियां',
    noProperties: 'अभी तक कोई संपत्ति नहीं जोड़ी गई',
    saveProperty: 'संपत्ति सहेजें',
    propertyCreated: 'संपत्ति बनाई गई!',
    propertyNameRequired: 'संपत्ति का नाम आवश्यक है।',
    propertyRequired: 'कृपया कम से कम एक संपत्ति चुनें।',
    selectPropertyLabel: 'कार्यस्थल संपत्ति',
    selectPropertyHint: 'वह संपत्ति या संपत्तियां चुनें जहां आप काम करते हैं',
    customAmenity: 'कस्टम क्षेत्र जोड़ें...',
    addAmenity: 'जोड़ें',
    roomsLabel: 'कमरे',
    switchProperty: 'संपत्ति बदलें',
    removeProperty: 'संपत्ति हटाएं',
    confirmRemove: 'इस संपत्ति को हटाएं? यह पूर्ववत नहीं किया जा सकता।',
    cannotRemoveLast: 'एकमात्र संपत्ति को नहीं हटाया जा सकता',
    // General Staff Portal
    generalStaffPortal: 'सामान्य स्टाफ पोर्टल',
    generalStaffAccess: 'FYXINN सामान्य स्टाफ एक्सेस v1.0',
    reportAnIssue: 'समस्या रिपोर्ट करें',
    reportSubtitle: 'कमरे या क्षेत्र की समस्या रिपोर्ट करने के लिए टैप करें',
    issueSubmitted: 'समस्या सफलतापूर्वक सबमिट की गई!',
    onDutyTech: 'ड्यूटी पर तकनीशियन',
    noTechOnDuty: 'इस शिफ्ट के लिए कोई तकनीशियन निर्धारित नहीं',
    currentShift: 'वर्तमान शिफ्ट',
    allTechs: 'सभी तकनीशियन',
    roomLogs: 'कमरे के लॉग',
    filterByRoom: 'कमरे से फ़िल्टर करें...',
    noLogs: 'कोई लॉग नहीं मिला',
    aiAssistant: 'मरम्मत सहायक',
    assistantWelcome: 'नमस्ते! मैं सरल मरम्मत युक्तियों में मदद कर सकता हूं। क्या समस्या है?',
    typeYourQuestion: 'समस्या बताएं...',
    thinking: 'सोच रहा हूं...',
    chatWithTech: 'तकनीशियन से चैट',
    selectTaskToChat: 'चैट खोलने के लिए कोई समस्या चुनें',
    noTasksToChat: 'चैट के लिए कोई सक्रिय समस्या नहीं',
    myLang: 'मेरी भाषा',
    translateMessages: 'संदेशों का स्वतः अनुवाद',
    sendMessage: 'भेजें',
    typeMessage: 'संदेश लिखें...',
    translating: 'अनुवाद हो रहा है...',
    you: 'आप',
    tech: 'तकनीशियन',
    issueReported: 'समस्या रिपोर्ट की गई',
    scheduleView: 'शेड्यूल',
    contactLabel: 'संपर्क',
  },
};

// ─── Shared UI ────────────────────────────────────────────────────────────────
const LangSwitcher: React.FC<{ lang: Lang; onChange: (l: Lang) => void }> = ({ lang, onChange }) => (
  <div className="flex items-center gap-1 bg-surface-3 border border-border rounded-sm p-0.5">
    {(['EN', 'ES', 'HI'] as Lang[]).map(l => (
      <button
        key={l}
        onClick={() => onChange(l)}
        className={`px-2 py-0.5 text-[10px] font-grotesk font-600 tracking-widest rounded-sm transition-all ${
          lang === l
            ? 'bg-primary text-black'
            : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        {l}
      </button>
    ))}
  </div>
);

const StatBadge: React.FC<{ label: string; value: string | number; accent?: string }> = ({ label, value, accent = 'text-primary' }) => (
  <div className="bg-surface-2 border border-border rounded-sm p-3 flex flex-col gap-1">
    <span className={`font-grotesk font-700 text-2xl ${accent}`}>{value}</span>
    <span className="text-[10px] text-gray-500 font-grotesk uppercase tracking-widest">{label}</span>
  </div>
);

// ─── Property Selector ────────────────────────────────────────────────────────
const PropertySelector: React.FC<{
  properties: Property[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  lang: Lang;
}> = ({ properties, selectedIds, onChange, lang }) => {
  const t = LANG_LABELS[lang];
  if (properties.length === 0) return null;
  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  return (
    <div>
      <label className="block text-[10px] font-grotesk font-600 text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <Icon name="apartment" size={12} />
        {t.selectPropertyLabel}
      </label>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {properties.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            className={`w-full flex items-center gap-3 p-2.5 rounded-sm border transition-all text-left ${
              selectedIds.includes(p.id)
                ? 'border-primary/60 bg-primary/8'
                : 'border-border bg-surface-3 hover:border-primary/30'
            }`}
          >
            <div className="w-8 h-8 rounded-sm bg-surface-2 border border-border flex items-center justify-center overflow-hidden shrink-0">
              {p.photoUrl
                ? <img src={p.photoUrl} alt={p.name} className="w-full h-full object-contain" />
                : <Icon name="apartment" size={16} className="text-gray-600" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-grotesk font-600 text-gray-200 truncate">{p.name}</p>
              {p.address && <p className="text-[9px] text-gray-500 font-grotesk truncate">{p.address}</p>}
            </div>
            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-all ${
              selectedIds.includes(p.id) ? 'border-primary bg-primary' : 'border-border'
            }`}>
              {selectedIds.includes(p.id) && <Icon name="check" size={10} className="text-black" />}
            </div>
          </button>
        ))}
      </div>
      <p className="text-[9px] text-gray-600 font-grotesk mt-1.5">{t.selectPropertyHint}</p>
    </div>
  );
};

// ─── Portal Select ────────────────────────────────────────────────────────────
const PortalSelect: React.FC<{ onSelect: (p: 'admin-login' | 'staff-login' | 'general-staff-login') => void; lang: Lang; setLang: (l: Lang) => void }> = ({
  onSelect, lang, setLang
}) => {
  const t = LANG_LABELS[lang];
  return (
    <div className="min-h-screen blueprint-bg flex flex-col items-center justify-center p-6">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
        <LangSwitcher lang={lang} onChange={setLang} />
      </div>
      <div className="flex flex-col items-center gap-8 max-w-xs w-full">
        <img src={logoVertical} alt="Fyxinn" className="w-36 drop-shadow-2xl" style={{ filter: 'drop-shadow(0 0 24px rgba(88,226,31,0.4))' }} />
        <div className="text-center">
          <p className="text-xs font-grotesk text-gray-500 uppercase tracking-[0.3em] mt-2">{t.hotelPlatform}</p>
        </div>
        <div className="w-full space-y-3">
          <button
            onClick={() => onSelect('admin-login')}
            className="w-full py-3 px-4 border border-primary/40 bg-surface-2 hover:bg-surface-3 hover:border-primary text-primary font-grotesk text-xs font-600 uppercase tracking-widest rounded-sm transition-all flex items-center justify-between group card-hover"
          >
            <span className="flex items-center gap-3">
              <Icon name="admin_panel_settings" size={18} />
              {t.adminPortal}
            </span>
            <Icon name="chevron_right" size={16} className="text-gray-600 group-hover:text-primary transition-colors" />
          </button>
          <button
            onClick={() => onSelect('staff-login')}
            className="w-full py-3 px-4 border border-secondary/40 bg-surface-2 hover:bg-surface-3 hover:border-secondary text-secondary font-grotesk text-xs font-600 uppercase tracking-widest rounded-sm transition-all flex items-center justify-between group card-hover"
          >
            <span className="flex items-center gap-3">
              <Icon name="badge" size={18} />
              {t.staffPortal}
            </span>
            <Icon name="chevron_right" size={16} className="text-gray-600 group-hover:text-secondary transition-colors" />
          </button>
          <button
            onClick={() => onSelect('general-staff-login')}
            className="w-full py-3 px-4 border border-orange-400/40 bg-surface-2 hover:bg-surface-3 hover:border-orange-400 text-orange-400 font-grotesk text-xs font-600 uppercase tracking-widest rounded-sm transition-all flex items-center justify-between group card-hover"
          >
            <span className="flex items-center gap-3">
              <Icon name="groups" size={18} />
              {t.generalStaffPortal}
            </span>
            <Icon name="chevron_right" size={16} className="text-gray-600 group-hover:text-orange-400 transition-colors" />
          </button>
        </div>
        <p className="text-[10px] text-gray-700 font-grotesk tracking-widest">{t.secureAccess}</p>
      </div>
    </div>
  );
};

// ─── Admin Login ──────────────────────────────────────────────────────────────
const AdminLogin: React.FC<{
  onLogin: (u: User) => void;
  onBack: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  properties: Property[];
}> = ({ onLogin, onBack, lang, setLang, properties }) => {
  const t = LANG_LABELS[lang];
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetFields = () => {
    setEmail(''); setPassword(''); setName(''); setConfirmPassword('');
    setSelectedPropertyIds([]); setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (mode === 'register') {
      if (!name.trim()) { setError(t.nameRequired); setLoading(false); return; }
      if (password !== confirmPassword) { setError(t.passwordMismatch); setLoading(false); return; }
      if (password.length < 6) { setError(t.passwordTooShort); setLoading(false); return; }
      if (properties.length > 0 && selectedPropertyIds.length === 0) {
        setError(t.propertyRequired); setLoading(false); return;
      }
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const primaryId = selectedPropertyIds[0] || (properties[0]?.id ?? 'prop-1');
        const newUser: User = {
          id: cred.user.uid, name: name.trim(), role: UserRole.ADMIN,
          email, phone: '', propertyId: primaryId, propertyIds: selectedPropertyIds,
        };
        await setDoc(doc(db, 'users', cred.user.uid), newUser);
        onLogin(newUser);
      } catch (err: any) {
        setError(err.message ?? 'Registration failed.');
        setLoading(false);
      }
    } else {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const snap = await getDoc(doc(db, 'users', cred.user.uid));
        if (snap.exists() && (snap.data() as User).role === UserRole.ADMIN) {
          onLogin(snap.data() as User);
        } else {
          const mockUser = MOCK_USERS.find(u => u.email === email && u.role === UserRole.ADMIN);
          onLogin(mockUser ?? MOCK_USERS[0]);
        }
      } catch {
        const user = MOCK_USERS.find(u => u.email === email && u.role === UserRole.ADMIN);
        if (user || email === 'admin@fyxinn.io') {
          onLogin(user ?? MOCK_USERS[0]);
        } else {
          setError(t.invalidCredentials);
          setLoading(false);
        }
      }
    }
  };

  return (
    <div className="min-h-screen blueprint-bg flex flex-col">
      {/* Top nav */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <button onClick={onBack} className="flex items-center gap-2 text-xs text-gray-500 hover:text-primary font-grotesk uppercase tracking-widest transition-colors">
          <Icon name="arrow_back" size={16} />
          {t.back}
        </button>
        <div className="hidden sm:flex items-center gap-6">
          {(['dashboard', 'roomgrid', 'inventory', 'schematics', 'settings'] as AdminView[]).map(v => (
            <span key={v} className="text-[10px] text-gray-600 font-grotesk uppercase tracking-widest">{t[v] || v}</span>
          ))}
        </div>
        <LangSwitcher lang={lang} onChange={setLang} />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <img src={logoVertical} alt="Fyxinn" className="w-28 mb-4" style={{ filter: 'drop-shadow(0 0 20px rgba(88,226,31,0.4))' }} />
            <h2 className="font-grotesk text-xs text-gray-500 uppercase tracking-[0.3em]">
              {mode === 'login' ? t.adminTerminal : t.createAdminAccount}
            </h2>
          </div>

          <div className="bg-surface-2 border border-border rounded-sm p-6 space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-[10px] font-grotesk font-600 text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Icon name="badge" size={12} />
                    {t.fullName}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="input-box pr-8"
                      placeholder="Jane Smith"
                      value={name}
                      onChange={e => { setName(e.target.value); setError(''); }}
                    />
                    <Icon name="person" size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-grotesk font-600 text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Icon name="mail" size={12} />
                  {t.email}
                </label>
                <div className="relative">
                  <input
                    type="email"
                    className="input-box pr-8"
                    placeholder="operator@fyxinn.io"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                  />
                  <Icon name="alternate_email" size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-grotesk font-600 text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Icon name="lock" size={12} />
                  {t.password}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    className="input-box pr-8"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                  />
                  <Icon name="vpn_key" size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600" />
                </div>
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-[10px] font-grotesk font-600 text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Icon name="lock_reset" size={12} />
                    {t.confirmPassword}
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      className="input-box pr-8"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                    />
                    <Icon name="vpn_key" size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600" />
                  </div>
                </div>
              )}

              {mode === 'register' && properties.length > 0 && (
                <PropertySelector
                  properties={properties}
                  selectedIds={selectedPropertyIds}
                  onChange={ids => { setSelectedPropertyIds(ids); setError(''); }}
                  lang={lang}
                />
              )}

              {error && (
                <p className="text-[11px] text-red-400 flex items-center gap-1.5">
                  <Icon name="error" size={14} />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 font-grotesk text-xs font-700 uppercase tracking-[0.2em] text-black rounded-sm transition-all sig-gradient hover:opacity-90 active:scale-[0.98] animate-glow flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading
                  ? <><Icon name="autorenew" size={16} className="animate-spin" /> {t.processing}</>
                  : mode === 'login'
                    ? <><Icon name="login" size={16} /> {t.login}</>
                    : <><Icon name="person_add" size={16} /> {t.createAccount}</>
                }
              </button>
            </form>

            <div className="border-t border-border pt-4 flex flex-col items-center gap-2">
              <button
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); resetFields(); }}
                className="text-[10px] font-grotesk text-gray-500 hover:text-primary tracking-widest transition-colors"
              >
                {mode === 'login' ? t.noAccount : t.haveAccount}
              </button>
              <span className="text-[10px] text-gray-600 font-grotesk tracking-widest">{t.secureEncrypted}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Staff Login ──────────────────────────────────────────────────────────────
const StaffLogin: React.FC<{
  onLogin: (u: User) => void;
  onBack: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  properties: Property[];
}> = ({ onLogin, onBack, lang, setLang, properties }) => {
  const t = LANG_LABELS[lang];
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [operatorId, setOperatorId] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetFields = () => {
    setOperatorId(''); setPin(''); setName(''); setConfirmPin('');
    setSelectedPropertyIds([]); setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (mode === 'register') {
      if (!name.trim()) { setError(t.nameRequired); setLoading(false); return; }
      if (!operatorId.trim()) { setError(t.operatorRequired); setLoading(false); return; }
      if (pin.length < 4) { setError(t.pinRequired); setLoading(false); return; }
      if (pin !== confirmPin) { setError(t.pinMismatch); setLoading(false); return; }
      if (properties.length > 0 && selectedPropertyIds.length === 0) {
        setError(t.propertyRequired); setLoading(false); return;
      }
      try {
        const staffEmail = operatorId.trim().toLowerCase();
        // PIN padded to 6 chars to meet Firebase Auth minimum
        const staffPassword = pin.padEnd(6, '0');
        const cred = await createUserWithEmailAndPassword(auth, staffEmail, staffPassword);
        const primaryId = selectedPropertyIds[0] || (properties[0]?.id ?? 'prop-1');
        const newUser: User = {
          id: cred.user.uid, name: name.trim(), role: UserRole.STAFF,
          email: staffEmail, phone: '', propertyId: primaryId, propertyIds: selectedPropertyIds,
        };
        await setDoc(doc(db, 'users', cred.user.uid), newUser);
        onLogin(newUser);
      } catch (err: any) {
        setError(err.message ?? 'Registration failed.');
        setLoading(false);
      }
    } else {
      try {
        const staffEmail = operatorId.trim().toLowerCase();
        const staffPassword = pin.padEnd(6, '0');
        const cred = await signInWithEmailAndPassword(auth, staffEmail, staffPassword);
        const snap = await getDoc(doc(db, 'users', cred.user.uid));
        onLogin(snap.exists() ? (snap.data() as User) : MOCK_USERS[1]);
      } catch {
        onLogin(MOCK_USERS[1]);
      }
    }
  };

  return (
    <div className="min-h-screen blueprint-bg flex flex-col items-center justify-center p-6">
      <div className="absolute top-4 left-4">
        <button onClick={onBack} className="flex items-center gap-2 text-xs text-gray-500 hover:text-primary font-grotesk uppercase tracking-widest transition-colors">
          <Icon name="arrow_back" size={16} />
        </button>
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
        <LangSwitcher lang={lang} onChange={setLang} />
      </div>

      <div className="w-full max-w-[280px] flex flex-col items-center gap-6">
        {/* Logo with border */}
        <div className="border border-primary/30 rounded-sm p-4 glow-green">
          <img src={logoVertical} alt="Fyxinn" className="w-32" style={{ filter: 'drop-shadow(0 0 16px rgba(88,226,31,0.5))' }} />
        </div>

        {mode === 'register' && (
          <p className="text-[10px] font-grotesk text-primary uppercase tracking-[0.2em]">{t.newStaffAccount}</p>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-5">
          {mode === 'register' && (
            <div>
              <label className="block text-[10px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">
                {t.fullName}
              </label>
              <input
                type="text"
                className="input-underline"
                placeholder="Jane Smith"
                value={name}
                onChange={e => { setName(e.target.value); setError(''); }}
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">
              {t.operatorId}
            </label>
            <input
              type="email"
              className="input-underline"
              placeholder="you@example.com"
              value={operatorId}
              onChange={e => { setOperatorId(e.target.value); setError(''); }}
            />
          </div>

          <div>
            <label className="block text-[10px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">
              {t.pin}
            </label>
            <input
              type="password"
              className="input-underline"
              placeholder="••••"
              value={pin}
              onChange={e => { setPin(e.target.value); setError(''); }}
              maxLength={4}
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-[10px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">
                {t.confirmPin}
              </label>
              <input
                type="password"
                className="input-underline"
                placeholder="••••"
                value={confirmPin}
                onChange={e => { setConfirmPin(e.target.value); setError(''); }}
                maxLength={4}
              />
            </div>
          )}

          {mode === 'register' && properties.length > 0 && (
            <PropertySelector
              properties={properties}
              selectedIds={selectedPropertyIds}
              onChange={ids => { setSelectedPropertyIds(ids); setError(''); }}
              lang={lang}
            />
          )}

          {error && (
            <p className="text-[11px] text-red-400 flex items-center gap-1.5">
              <Icon name="error" size={14} />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 font-grotesk text-sm font-700 tracking-[0.3em] text-black rounded-sm sig-gradient hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {loading
              ? <Icon name="autorenew" size={18} className="animate-spin" />
              : mode === 'login' ? t.staffLogin : t.createAccount.toUpperCase()
            }
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); resetFields(); }}
          className="text-[10px] font-grotesk text-gray-500 hover:text-primary tracking-widest transition-colors"
        >
          {mode === 'login' ? t.noAccount : t.haveAccount}
        </button>

        <p className="text-[10px] text-gray-700 font-grotesk tracking-widest text-center">
          {t.staffAccess}
        </p>
      </div>
    </div>
  );
};

// ─── General Staff Login ──────────────────────────────────────────────────────
const GeneralStaffLogin: React.FC<{
  onLogin: (u: User) => void;
  onBack: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  properties: Property[];
}> = ({ onLogin, onBack, lang, setLang, properties }) => {
  const t = LANG_LABELS[lang];
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [operatorId, setOperatorId] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (mode === 'register') {
      if (!name.trim()) { setError(t.nameRequired); setLoading(false); return; }
      if (!operatorId.trim()) { setError(t.operatorRequired); setLoading(false); return; }
      if (pin.length < 4) { setError(t.pinRequired); setLoading(false); return; }
      if (pin !== confirmPin) { setError(t.pinMismatch); setLoading(false); return; }
      if (properties.length > 0 && selectedPropertyIds.length === 0) {
        setError(t.propertyRequired); setLoading(false); return;
      }
      try {
        const staffEmail = operatorId.trim().toLowerCase();
        const staffPassword = pin.padEnd(6, '0');
        const cred = await createUserWithEmailAndPassword(auth, staffEmail, staffPassword);
        const primaryId = selectedPropertyIds[0] || (properties[0]?.id ?? 'prop-1');
        const newUser: User = {
          id: cred.user.uid, name: name.trim(), role: UserRole.GENERAL_STAFF,
          email: staffEmail, phone: '', propertyId: primaryId, propertyIds: selectedPropertyIds,
        };
        await setDoc(doc(db, 'users', cred.user.uid), newUser);
        onLogin(newUser);
      } catch (err: any) {
        setError(err.message ?? 'Registration failed.');
        setLoading(false);
      }
    } else {
      try {
        const staffEmail = operatorId.trim().toLowerCase();
        const staffPassword = pin.padEnd(6, '0');
        const cred = await signInWithEmailAndPassword(auth, staffEmail, staffPassword);
        const snap = await getDoc(doc(db, 'users', cred.user.uid));
        onLogin(snap.exists() ? (snap.data() as User) : { id: cred.user.uid, name: 'Staff', role: UserRole.GENERAL_STAFF, email: staffEmail, phone: '', propertyId: properties[0]?.id ?? 'prop-1' });
      } catch (err: any) {
        setError(err.message ?? t.invalidCredentials);
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen blueprint-bg flex flex-col items-center justify-center p-6">
      <div className="absolute top-4 left-4">
        <button onClick={onBack} className="flex items-center gap-2 text-xs text-gray-500 hover:text-orange-400 font-grotesk uppercase tracking-widest transition-colors">
          <Icon name="arrow_back" size={16} />
        </button>
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
        <LangSwitcher lang={lang} onChange={setLang} />
      </div>

      <div className="w-full max-w-[280px] flex flex-col items-center gap-6">
        <div className="border border-orange-400/30 rounded-sm p-4" style={{ boxShadow: '0 0 24px rgba(251,146,60,0.15)' }}>
          <img src={logoVertical} alt="Fyxinn" className="w-32" style={{ filter: 'drop-shadow(0 0 16px rgba(251,146,60,0.4))' }} />
        </div>

        <div className="text-center space-y-1">
          <h1 className="font-grotesk text-sm font-700 text-gray-100 uppercase tracking-widest">{t.generalStaffPortal}</h1>
          <p className="text-[9px] text-gray-600 font-grotesk tracking-widest">{t.generalStaffAccess}</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-3">
          {mode === 'register' && (
            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.fullName}</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-orange-400" />
            </div>
          )}
          <div>
            <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.operatorId}</label>
            <input type="email" value={operatorId} onChange={e => setOperatorId(e.target.value)} className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.pin}</label>
            <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-orange-400 tracking-[0.5em]" />
          </div>
          {mode === 'register' && (
            <>
              <div>
                <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.confirmPin}</label>
                <input type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-orange-400 tracking-[0.5em]" />
              </div>
              <PropertySelector properties={properties} selectedIds={selectedPropertyIds} onChange={setSelectedPropertyIds} lang={lang} />
            </>
          )}
          {error && <p className="text-[10px] text-red-400 font-grotesk">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black font-grotesk text-xs font-700 uppercase tracking-widest rounded-sm transition-colors">
            {loading ? t.processing : t.staffLogin}
          </button>
        </form>

        <button onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }} className="text-[10px] text-gray-600 hover:text-orange-400 font-grotesk transition-colors">
          {mode === 'login' ? t.newStaffAccount : t.haveAccount}
        </button>
      </div>
    </div>
  );
};

// ─── Admin Sidebar ────────────────────────────────────────────────────────────
const AdminSidebar: React.FC<{
  view: AdminView;
  setView: (v: AdminView) => void;
  onLogout: () => void;
  property: Property;
  properties: Property[];
  activePropertyId: string;
  onPropertyChange: (id: string) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  openIssueCount?: number;
}> = ({ view, setView, onLogout, property, properties, activePropertyId, onPropertyChange, lang, setLang, openIssueCount = 0 }) => {
  const t = LANG_LABELS[lang];
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const navItems: { view: AdminView; icon: string; label: string }[] = [
    { view: 'dashboard', icon: 'grid_view', label: t.dashboard },
    { view: 'issues', icon: 'report_problem', label: t.issues },
    { view: 'calendar', icon: 'calendar_month', label: t.calendar },
    { view: 'roomgrid', icon: 'meeting_room', label: t.roomGrid },
    { view: 'inventory', icon: 'inventory_2', label: t.inventory },
    { view: 'schematics', icon: 'map', label: t.schematics },
    { view: 'settings', icon: 'settings', label: t.settings },
  ];

  return (
    <aside className="w-52 bg-surface-2 border-r border-border hidden md:flex flex-col h-[100dvh] sticky top-0 shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <img src={logoHorizontal} alt="Fyxinn" className="h-8 object-contain object-left" style={{ filter: 'drop-shadow(0 0 8px rgba(88,226,31,0.3))' }} />
      </div>

      {/* Property switcher */}
      <div className="border-b border-border">
        <button
          onClick={() => properties.length > 1 && setShowPropertyPicker(p => !p)}
          className={`w-full px-4 py-3 text-left transition-colors ${properties.length > 1 ? 'hover:bg-surface-3 cursor-pointer' : 'cursor-default'}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-gray-600 font-grotesk uppercase tracking-widest">{t.activeFacility}</p>
            {properties.length > 1 && (
              <Icon name={showPropertyPicker ? 'expand_less' : 'expand_more'} size={14} className="text-gray-600" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {property.photoUrl
              ? <img src={property.photoUrl} alt="" className="w-4 h-4 rounded-sm object-contain shrink-0" />
              : <Icon name="apartment" size={14} className="text-gray-500 shrink-0" />
            }
            <p className="text-xs text-gray-300 font-grotesk font-500 truncate">{property.name}</p>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full dot-green inline-block"></span>
            <span className="text-[9px] text-primary font-grotesk">{t.online}</span>
          </div>
        </button>

        {showPropertyPicker && properties.length > 1 && (
          <div className="border-t border-border bg-surface-3 py-1">
            {properties.map(p => (
              <button
                key={p.id}
                onClick={() => { onPropertyChange(p.id); setShowPropertyPicker(false); }}
                className={`w-full flex items-center gap-2 px-4 py-2 transition-colors text-left ${p.id === activePropertyId ? 'text-primary bg-primary/5' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-2'}`}
              >
                {p.photoUrl
                  ? <img src={p.photoUrl} alt="" className="w-5 h-5 rounded-sm object-contain shrink-0" />
                  : <Icon name="apartment" size={14} className="shrink-0" />
                }
                <span className="text-[11px] font-grotesk truncate">{p.name}</span>
                {p.id === activePropertyId && <Icon name="check" size={12} className="ml-auto shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
        {navItems.map(item => (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={`sidebar-nav-item w-full ${view === item.view ? 'active' : ''}`}
          >
            <Icon name={item.icon} size={18} />
            <span className="flex-1 text-left">{item.label}</span>
            {item.view === 'issues' && openIssueCount > 0 && (
              <span className="ml-auto text-[9px] font-grotesk font-700 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                {openIssueCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-border space-y-2">
        <div className="flex items-center gap-2">
          <LangSwitcher lang={lang} onChange={setLang} />
          <ThemeToggle />
        </div>
        <button
          onClick={onLogout}
          className="sidebar-nav-item w-full hover:text-red-400 hover:border-red-400/30"
        >
          <Icon name="logout" size={18} />
          <span>{t.logout}</span>
        </button>
      </div>
    </aside>
  );
};

// ─── CSV Sync Modal ───────────────────────────────────────────────────────────
type CsvPreviewRow = {
  roomNumber: string;
  occupancy: string;
  housekeeping: string;
  checkoutDate: string;
  matched: boolean;
  newHkStatus: HousekeepingStatus | null;
  newRoomStatus: RoomStatus | null;
};

type CsvSyncUpdate = { housekeepingStatus: HousekeepingStatus; status: RoomStatus; checkoutDate?: string };

const CsvSyncModal: React.FC<{
  rooms: Room[];
  onSync: (updates: Map<string, CsvSyncUpdate>) => void;
  onClose: () => void;
  lang: Lang;
}> = ({ rooms, onSync, onClose, lang }) => {
  const t = LANG_LABELS[lang];
  const [preview, setPreview] = useState<CsvPreviewRow[] | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const deriveStatuses = (occupancy: string, hk: string): { newHkStatus: HousekeepingStatus | null; newRoomStatus: RoomStatus | null } => {
    const occ = occupancy.toLowerCase().trim();
    const isDirty = hk.toLowerCase().includes('dirty');

    if (isDirty) return { newHkStatus: 'Dirty', newRoomStatus: RoomStatus.ISSUE_REPORTED };
    if (occ.includes('vacant')) return { newHkStatus: 'Vacant', newRoomStatus: RoomStatus.COMPLETED };
    if (occ.includes('pending')) return { newHkStatus: 'Pending Departure', newRoomStatus: RoomStatus.WAITING_APPROVAL };
    if (occ.includes('occ')) return { newHkStatus: 'Occupied', newRoomStatus: RoomStatus.IN_PROGRESS };
    return { newHkStatus: null, newRoomStatus: null };
  };

  const parseCSV = (text: string) => {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { setError('CSV must have a header row and at least one data row.'); return; }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s_-]+/g, '_'));
    const roomCol = headers.findIndex(h => h.includes('room'));
    const occCol = headers.findIndex(h => h.includes('occup'));
    const hkCol = headers.findIndex(h => h.includes('house') || h.includes('hk') || h.includes('clean') || h.includes('dirty'));
    const coCol = headers.findIndex(h => h.includes('checkout') || h.includes('check_out'));

    if (roomCol === -1 || occCol === -1 || hkCol === -1) {
      setError('Could not detect required columns. Expected headers containing: room, occupancy, housekeeping.');
      return;
    }

    const roomSet = new Set(rooms.map(r => r.number));
    const rows: CsvPreviewRow[] = lines.slice(1)
      .map(line => {
        const cols = line.split(',').map(c => c.trim());
        const roomNumber = cols[roomCol] || '';
        const occupancy = cols[occCol] || '';
        const housekeeping = cols[hkCol] || '';
        const checkoutDate = coCol !== -1 ? (cols[coCol] || '') : '';
        const matched = roomSet.has(roomNumber);
        const { newHkStatus, newRoomStatus } = deriveStatuses(occupancy, housekeeping);
        return { roomNumber, occupancy, housekeeping, checkoutDate, matched, newHkStatus, newRoomStatus };
      })
      .filter(r => r.roomNumber);

    setPreview(rows);
    setError('');
  };

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Please upload a .csv file.'); return; }
    const reader = new FileReader();
    reader.onload = e => parseCSV(e.target?.result as string);
    reader.readAsText(file);
  };

  const applySync = () => {
    if (!preview) return;
    const updates = new Map<string, CsvSyncUpdate>();
    preview.forEach(row => {
      if (row.matched && row.newHkStatus && row.newRoomStatus) {
        updates.set(row.roomNumber, {
          housekeepingStatus: row.newHkStatus,
          status: row.newRoomStatus,
          checkoutDate: row.checkoutDate || undefined,
        });
      }
    });
    onSync(updates);
    onClose();
  };

  const matched = preview?.filter(r => r.matched && r.newHkStatus).length ?? 0;
  const unmatched = preview?.filter(r => !r.matched).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70">
      <div className="bg-surface-2 border border-border rounded-t-lg sm:rounded-sm w-full max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-grotesk text-sm font-700 text-gray-100 flex items-center gap-2">
              <Icon name="sync" size={18} className="text-primary" />
              {t.syncCsvTitle}
            </h2>
            <p className="text-[10px] text-gray-500 font-grotesk mt-0.5">
              room_number · occupancy_status · housekeeping_status · checkout_date
            </p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors ml-4 shrink-0">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!preview ? (
            <>
              <div
                className={`border-2 border-dashed rounded-sm p-8 sm:p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                <Icon name="upload_file" size={36} className={dragging ? 'text-primary' : 'text-gray-600'} />
                <div className="text-center">
                  <p className="text-sm font-grotesk text-gray-300">{t.dropCsvHere}</p>
                  <p className="text-[10px] text-gray-600 mt-1">{t.csvFilesOnly}</p>
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

              <div className="bg-surface-3 border border-border rounded-sm p-3 space-y-1.5">
                <p className="text-[10px] font-grotesk font-600 text-gray-500 uppercase tracking-widest mb-2">{t.expectedFormat}</p>
                <code className="text-[10px] text-primary/80 font-mono block overflow-x-auto whitespace-nowrap">room_number,occupancy_status,housekeeping_status,checkout_date</code>
                <code className="text-[10px] text-gray-500 font-mono block">101,Occupied,Dirty,2026-04-20</code>
                <code className="text-[10px] text-gray-500 font-mono block">102,Vacant,Clean,</code>
                <code className="text-[10px] text-gray-500 font-mono block">103,Pending Departure,Clean,2026-04-19</code>
              </div>

              {error && (
                <p className="text-[11px] text-red-400 flex items-center gap-1.5">
                  <Icon name="error" size={14} />
                  {error}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-3 border border-border rounded-sm p-3 text-center">
                  <p className="font-grotesk text-xl font-700 text-gray-100">{preview.length}</p>
                  <p className="text-[9px] font-grotesk text-gray-600 uppercase tracking-widest mt-0.5">{t.totalRows}</p>
                </div>
                <div className="bg-surface-3 border border-primary/20 rounded-sm p-3 text-center">
                  <p className="font-grotesk text-xl font-700 text-primary">{matched}</p>
                  <p className="text-[9px] font-grotesk text-gray-600 uppercase tracking-widest mt-0.5">{t.willUpdate}</p>
                </div>
                <div className={`bg-surface-3 border rounded-sm p-3 text-center ${unmatched > 0 ? 'border-red-400/20' : 'border-border'}`}>
                  <p className={`font-grotesk text-xl font-700 ${unmatched > 0 ? 'text-red-400' : 'text-gray-500'}`}>{unmatched}</p>
                  <p className="text-[9px] font-grotesk text-gray-600 uppercase tracking-widest mt-0.5">{t.noMatch}</p>
                </div>
              </div>

              <div className="bg-surface-3 border border-border rounded-sm overflow-hidden overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border">
                      {[t.room, t.occupancy, t.housekeepingLabel, t.checkoutLabel, t.newStatus, ''].map(h => (
                        <th key={h} className="text-left p-2 text-[9px] font-grotesk font-600 text-gray-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className={`border-b border-border/50 ${!row.matched ? 'opacity-40' : ''}`}>
                        <td className="p-2 text-xs font-grotesk font-700 text-gray-200">{row.roomNumber}</td>
                        <td className="p-2 text-[10px] text-gray-400 font-grotesk">{row.occupancy}</td>
                        <td className="p-2 text-[10px] text-gray-400 font-grotesk">{row.housekeeping}</td>
                        <td className="p-2 text-[10px] text-gray-500 font-grotesk">{row.checkoutDate || '—'}</td>
                        <td className="p-2 text-[10px] font-grotesk text-gray-300">{row.newHkStatus || '—'}</td>
                        <td className="p-2">
                          {row.matched
                            ? <span className="text-[9px] font-grotesk bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm">{t.matchLabel}</span>
                            : <span className="text-[9px] font-grotesk bg-red-400/10 text-red-400 px-1.5 py-0.5 rounded-sm">{t.skipLabel}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between gap-3 shrink-0">
          {preview ? (
            <>
              <button
                onClick={() => { setPreview(null); setError(''); }}
                className="flex items-center gap-1.5 text-xs font-grotesk text-gray-500 hover:text-gray-300 transition-colors"
              >
                <Icon name="arrow_back" size={14} />
                {t.reUpload}
              </button>
              <button
                onClick={applySync}
                disabled={matched === 0}
                className="flex items-center gap-2 text-xs font-grotesk text-black px-4 py-2.5 rounded-sm sig-gradient hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40"
              >
                <Icon name="sync" size={16} />
                {t.applySync} ({matched} {matched !== 1 ? t.units : t.unit.toLowerCase()})
              </button>
            </>
          ) : (
            <button onClick={onClose} className="text-xs font-grotesk text-gray-500 hover:text-gray-300 transition-colors ml-auto">
              {t.cancel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
const AdminDashboard: React.FC<{ rooms: Room[]; property: Property; lang: Lang; onRoomsUpdate: (rooms: Room[]) => void }> = ({ rooms, property, lang, onRoomsUpdate }) => {
  const t = LANG_LABELS[lang];
  const [showCsvSync, setShowCsvSync] = useState(false);
  const byFloor = (property.floorLayouts || []).map(layout => ({
    floor: layout.floor,
    rooms: rooms.filter(r => r.floor === layout.floor),
  }));

  const totalMaintenance = rooms.filter(r => r.status === RoomStatus.IN_PROGRESS).length;
  const critical = rooms.filter(r => r.status === RoomStatus.ISSUE_REPORTED).length;
  const efficiency = Math.round(((rooms.length - totalMaintenance) / rooms.length) * 100);

  const floorNames = ['', 'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];

  return (
    <>
    {showCsvSync && (
      <CsvSyncModal
        rooms={rooms}
        onSync={updates => {
          onRoomsUpdate(rooms.map(r => {
            const u = updates.get(r.number);
            return u ? { ...r, housekeepingStatus: u.housekeepingStatus, status: u.status, checkoutDate: u.checkoutDate } : r;
          }));
        }}
        onClose={() => setShowCsvSync(false)}
        lang={lang}
      />
    )}
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-grotesk text-base md:text-lg font-700 text-gray-100">{t.unitStatusDashboard}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{property.name} · {t.liveFeed}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowCsvSync(true)}
            className="flex items-center gap-1.5 text-[10px] font-grotesk font-600 text-gray-400 border border-border px-2.5 py-1.5 rounded-sm hover:border-primary hover:text-primary transition-all"
          >
            <Icon name="upload_file" size={14} />
            <span className="hidden sm:inline">{t.syncCsv}</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full dot-green animate-pulse"></span>
            <span className="text-[10px] text-primary font-grotesk tracking-widest">{t.live}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBadge label={t.totalUnits} value={rooms.length} />
        <StatBadge label={t.inMaintenance} value={String(totalMaintenance).padStart(2, '0')} accent="text-yellow-400" />
        <StatBadge label={t.critical} value={String(critical).padStart(2, '0')} accent="text-red-400" />
        <StatBadge label={t.efficiency} value={`${efficiency}%`} accent="text-secondary" />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-grotesk text-gray-500">
        {[
          { dot: 'dot-green', label: t.vacantReady },
          { dot: 'dot-yellow', label: t.occupiedFixing },
          { dot: 'dot-red', label: t.dirty },
          { dot: 'dot-cyan', label: t.stayOver },
        ].map(item => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${item.dot} inline-block`}></span>
            {item.label}
          </span>
        ))}
      </div>

      {/* Floor grids */}
      {byFloor.map(({ floor, rooms: floorRooms }) => (
        <div key={floor} className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-grotesk font-600 text-gray-600 uppercase tracking-widest">
              {t.floor} {String(floor).padStart(2, '0')} {floorNames[floor] ? `· ${floorNames[floor].toUpperCase()}` : ''}
            </span>
            <div className="flex-1 h-px bg-border"></div>
            <span className="text-[10px] text-gray-600">{floorRooms.length} {t.units}</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {floorRooms.map(room => (
              <div
                key={room.id}
                className="bg-surface-2 border border-border rounded-sm p-2 cursor-pointer card-hover group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-grotesk font-700 text-gray-300">{t.unit} {room.number}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusColor(room.status)}`}></span>
                </div>
                <span className={`text-[9px] font-grotesk ${hkColor(room.housekeepingStatus)}`}>
                  {room.housekeepingStatus || statusLabel(room.status)}
                </span>
                {room.currentTasks.length > 0 && (
                  <div className="mt-1 text-[8px] text-yellow-400 font-grotesk">
                    {room.currentTasks.length} {room.currentTasks.length > 1 ? t.tasks : t.task}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    </>
  );
};

// ─── Admin Room Grid ──────────────────────────────────────────────────────────
const AdminRoomGrid: React.FC<{ rooms: Room[]; property: Property; lang: Lang }> = ({ rooms, property, lang }) => {
  const t = LANG_LABELS[lang];
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [pmOpen, setPmOpen] = useState<string | null>(null);
  const [checklistState, setChecklistState] = useState<PMChecklistState>({});

  const room = selectedRoom || rooms.find(r => r.number === '402') || rooms[0];

  const totalItems = Object.values(PM_CHECKLIST_DATA).reduce((acc, items) => acc + items.length, 0);
  const checkedItems = Object.values(checklistState).reduce((acc, cat) =>
    acc + Object.values(cat).filter(Boolean).length, 0
  );
  const progress = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  const toggleCheck = (cat: string, item: string) => {
    setChecklistState(prev => ({
      ...prev,
      [cat]: { ...(prev[cat] || {}), [item]: !(prev[cat]?.[item]) }
    }));
  };

  return (
    <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
      {/* Room list — horizontal scroll on mobile, vertical sidebar on desktop */}
      <div className="md:w-52 shrink-0 border-b md:border-b-0 md:border-r border-border bg-surface-2 flex flex-col">
        <div className="p-3 border-b border-border hidden md:block">
          <p className="text-[10px] font-grotesk text-gray-500 uppercase tracking-widest">{t.selectUnit}</p>
        </div>
        {/* Mobile horizontal picker */}
        <div className="flex md:hidden overflow-x-auto gap-1.5 p-2">
          {rooms.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRoom(r)}
              className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border text-xs font-grotesk transition-colors ${
                (selectedRoom?.id || room.id) === r.id ? 'border-primary text-primary bg-primary/10' : 'border-border text-gray-400 hover:border-primary/40'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusColor(r.status)}`}></span>
              {r.number}
            </button>
          ))}
        </div>
        {/* Desktop vertical list */}
        <div className="hidden md:flex flex-col overflow-y-auto flex-1">
          {rooms.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRoom(r)}
              className={`w-full px-3 py-2 flex items-center justify-between text-left border-b border-border/50 hover:bg-surface-3 transition-colors ${
                (selectedRoom?.id || room.id) === r.id ? 'bg-surface-3 border-l-2 border-l-primary' : ''
              }`}
            >
              <span className="text-xs font-grotesk text-gray-300">{t.room} {r.number}</span>
              <span className={`w-2 h-2 rounded-full ${statusColor(r.status)}`}></span>
            </button>
          ))}
        </div>
      </div>

      {/* Room detail */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-grotesk text-lg font-700 text-gray-100 flex items-center gap-2">
              <Icon name="meeting_room" size={20} className="text-primary" />
              {t.room} {room.number}
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs font-grotesk ${hkColor(room.housekeepingStatus)}`}>
                {room.housekeepingStatus || statusLabel(room.status)}
              </span>
              <span className="text-gray-600">·</span>
              <span className="text-xs text-gray-500 font-grotesk">{t.floor} {room.floor}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusColor(room.status)}`}></div>
            <span className="text-xs font-grotesk text-gray-400">{statusLabel(room.status)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Active Tickets */}
          <div className="bg-surface-2 border border-border rounded-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-grotesk text-xs font-600 text-gray-300 uppercase tracking-widest flex items-center gap-2">
                <Icon name="confirmation_number" size={16} className="text-yellow-400" />
                {t.activeTickets}
              </h3>
              <span className="text-[10px] bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-sm font-grotesk">
                {room.currentTasks.length} {t.pending}
              </span>
            </div>
            {room.currentTasks.length === 0 ? (
              <p className="text-xs text-gray-600 font-grotesk">{t.noActiveTickets}</p>
            ) : (
              <div className="space-y-2">
                {room.currentTasks.map(task => (
                  <div key={task.id} className="p-2 bg-surface-3 border border-border rounded-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[9px] font-grotesk uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${
                        task.priority === 'HIGH' ? 'bg-red-400/10 text-red-400' :
                        task.priority === 'MEDIUM' ? 'bg-yellow-400/10 text-yellow-400' :
                        'bg-gray-400/10 text-gray-400'
                      }`}>{task.priority}</span>
                      <span className="text-[9px] text-gray-600 font-grotesk">{task.status}</span>
                    </div>
                    <p className="text-xs text-gray-300">{task.description}</p>
                    <p className="text-[9px] text-gray-600 mt-1 font-grotesk">{t.by} {task.reportedBy}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PM Checklist */}
          <div className="bg-surface-2 border border-border rounded-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-grotesk text-xs font-600 text-gray-300 uppercase tracking-widest flex items-center gap-2">
                <Icon name="checklist" size={16} className="text-primary" />
                {t.pmChecklist}
              </h3>
              <span className="text-[10px] text-primary font-grotesk">{progress}%</span>
            </div>
            {/* Progress bar */}
            <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full sig-gradient transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {Object.entries(PM_CHECKLIST_DATA).slice(0, 3).map(([cat, items]) => (
                <div key={cat} className="border border-border rounded-sm overflow-hidden">
                  <button
                    onClick={() => setPmOpen(pmOpen === cat ? null : cat)}
                    className="w-full flex items-center justify-between p-2 hover:bg-surface-3 transition-colors"
                  >
                    <span className="text-[11px] font-grotesk font-500 text-gray-300">{cat}</span>
                    <Icon name={pmOpen === cat ? 'expand_less' : 'expand_more'} size={14} className="text-gray-600" />
                  </button>
                  <div className={`accordion-content ${pmOpen === cat ? 'open' : ''}`}>
                    <div className="p-2 space-y-1.5 border-t border-border">
                      {items.slice(0, 4).map(item => (
                        <div key={item} className="flex items-start gap-2" onClick={() => toggleCheck(cat, item)}>
                          <div className={`pm-checkbox mt-0.5 ${checklistState[cat]?.[item] ? 'checked' : ''}`}>
                            {checklistState[cat]?.[item] && <Icon name="check" size={10} className="text-black" />}
                          </div>
                          <span className="text-[10px] text-gray-400 leading-tight cursor-pointer">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upload Zones */}
          <div className="bg-surface-2 border border-border rounded-sm p-4 space-y-3">
            <h3 className="font-grotesk text-xs font-600 text-gray-300 uppercase tracking-widest flex items-center gap-2">
              <Icon name="photo_camera" size={16} className="text-secondary" />
              {t.evidenceUpload}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[t.before, t.after].map(label => (
                <div key={label} className="border border-dashed border-border rounded-sm p-3 flex flex-col items-center gap-2 hover:border-primary/40 cursor-pointer transition-colors group">
                  <Icon name="upload" size={20} className="text-gray-600 group-hover:text-primary transition-colors" />
                  <span className="text-[10px] font-grotesk text-gray-600 uppercase tracking-widest">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Suggestion */}
          <div className="bg-surface-2 border border-primary/20 rounded-sm p-4 space-y-3">
            <h3 className="font-grotesk text-xs font-600 text-primary uppercase tracking-widest flex items-center gap-2">
              <Icon name="auto_awesome" size={16} />
              {t.aiSuggestion}
            </h3>
            <div className="text-[11px] text-gray-400 leading-relaxed">
              Based on Room {room.number}'s maintenance history, recommend checking HVAC filter and smoke detector battery. Last PM completed 47 days ago.
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border"></div>
              <span className="text-[9px] text-primary/50 font-grotesk">FYXINN AI</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Admin Inventory ──────────────────────────────────────────────────────────
const AdminInventory: React.FC<{ inventory: InventoryItem[]; lang: Lang }> = ({ inventory, lang }) => {
  const t = LANG_LABELS[lang];
  const [search, setSearch] = useState('');
  const filtered = inventory.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.category.toLowerCase().includes(search.toLowerCase())
  );

  const lowStock = inventory.filter(i => i.quantity < i.minLevel).length;
  const totalValue = inventory.reduce((acc, i) => acc + i.quantity * 12, 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-base md:text-lg font-700 text-gray-100">{t.inventoryMatrix}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t.assetTracking}</p>
        </div>
        <button className="flex items-center gap-2 text-xs font-grotesk text-black px-3 py-2 rounded-sm sig-gradient hover:opacity-90 transition-all">
          <Icon name="add" size={16} />
          <span className="hidden sm:inline">{t.addAsset}</span>
          <span className="sm:hidden">{t.addAsset}</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBadge label={t.totalAssets} value={inventory.length.toLocaleString()} />
        <StatBadge label={t.lowStockAlerts} value={lowStock} accent="text-red-400" />
        <StatBadge label={t.pendingOrders} value="8" accent="text-yellow-400" />
        <StatBadge label={t.estValuation} value={`$${(totalValue / 1000).toFixed(1)}K`} accent="text-secondary" />
      </div>

      {/* Search */}
      <div className="relative">
        <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
        <input
          className="input-box pl-9"
          placeholder={t.searchAssets}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-surface-2 border border-border rounded-sm overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-border">
              {[t.colComponent, t.colCategory, t.colStock, t.colThreshold, t.colVendor, t.colStatus].map(h => (
                <th key={h} className="text-left p-3 text-[9px] font-grotesk font-600 text-gray-500 uppercase tracking-widest">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => {
              const isLow = item.quantity < item.minLevel;
              return (
                <tr key={item.id} className={`border-b border-border/50 hover:bg-surface-3 transition-colors ${i % 2 === 0 ? '' : 'bg-surface-3/30'}`}>
                  <td className="p-3 text-xs text-gray-200 font-grotesk font-500">{item.name}</td>
                  <td className="p-3 text-[10px] text-gray-500 font-grotesk uppercase tracking-widest">{item.category}</td>
                  <td className="p-3">
                    <span className={`text-xs font-grotesk font-700 ${isLow ? 'text-red-400' : 'text-primary'}`}>
                      {item.quantity} {item.unit}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-gray-500 font-grotesk">{item.minLevel} {item.unit}</td>
                  <td className="p-3 text-xs text-gray-400 font-grotesk">{item.vendor.name}</td>
                  <td className="p-3">
                    <span className={`text-[9px] font-grotesk px-2 py-0.5 rounded-sm ${
                      isLow ? 'bg-red-400/10 text-red-400' : 'bg-primary/10 text-primary'
                    }`}>
                      {isLow ? t.lowStock : t.normal}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-3 border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-gray-600 font-grotesk">{t.showing} {filtered.length} {t.of} {inventory.length} {t.assets}</span>
          <div className="flex items-center gap-1">
            {[1,2,3].map(p => (
              <button key={p} className={`w-6 h-6 text-[10px] font-grotesk rounded-sm ${p === 1 ? 'bg-primary text-black' : 'text-gray-600 hover:text-gray-300'}`}>{p}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Admin Schematics ─────────────────────────────────────────────────────────
const AdminSchematics: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = LANG_LABELS[lang];
  const mockFiles = [
    { name: 'Floor_01_Alpha_Layout.pdf', type: 'PDF', size: '2.4 MB', date: '2025-04-10' },
    { name: 'HVAC_System_Schematic.dwg', type: 'DWG', size: '8.1 MB', date: '2025-03-22' },
    { name: 'Electrical_Panel_Map.pdf', type: 'PDF', size: '1.2 MB', date: '2025-02-14' },
    { name: 'Plumbing_Main_Lines.dwg', type: 'DWG', size: '5.7 MB', date: '2025-01-30' },
    { name: 'Fire_Safety_Zones.pdf', type: 'PDF', size: '980 KB', date: '2024-12-18' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-grotesk text-base md:text-lg font-700 text-gray-100">{t.propertySchematics}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t.blueprintArchive}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Upload */}
        <div className="md:col-span-2 space-y-4">
          <div className="border-2 border-dashed border-border rounded-sm p-12 flex flex-col items-center gap-4 hover:border-primary/40 cursor-pointer transition-colors group blueprint-bg">
            <div className="w-14 h-14 rounded-full bg-surface-3 border border-border flex items-center justify-center group-hover:border-primary/40 transition-colors">
              <Icon name="upload_file" size={28} className="text-gray-600 group-hover:text-primary transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-sm font-grotesk font-500 text-gray-300">{t.dropFiles}</p>
              <p className="text-xs text-gray-600 mt-1">{t.fileSupport}</p>
            </div>
            <button className="text-xs font-grotesk text-black px-4 py-2 sig-gradient rounded-sm hover:opacity-90 transition-all">
              {t.browseFiles}
            </button>
          </div>

          {/* File gallery */}
          <div className="space-y-2">
            <h3 className="font-grotesk text-xs font-600 text-gray-500 uppercase tracking-widest">{t.uploadedFiles}</h3>
            {mockFiles.map(file => (
              <div key={file.name} className="bg-surface-2 border border-border rounded-sm p-3 flex items-center justify-between hover:border-primary/30 transition-colors card-hover">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-sm flex items-center justify-center text-[9px] font-grotesk font-700 ${
                    file.type === 'PDF' ? 'bg-red-400/10 text-red-400' : 'bg-secondary/10 text-secondary'
                  }`}>
                    {file.type}
                  </div>
                  <div>
                    <p className="text-xs font-grotesk text-gray-200">{file.name}</p>
                    <p className="text-[10px] text-gray-600">{file.size} · {file.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-gray-600 hover:text-primary transition-colors">
                    <Icon name="download" size={16} />
                  </button>
                  <button className="text-gray-600 hover:text-red-400 transition-colors">
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Storage metrics */}
        <div className="space-y-4">
          <div className="bg-surface-2 border border-border rounded-sm p-4 space-y-4">
            <h3 className="font-grotesk text-xs font-600 text-gray-300 uppercase tracking-widest">{t.storageMetrics}</h3>
            <div className="space-y-3">
              {[
                { label: t.storageUsed, value: '18.4 MB', pct: 7, color: 'bg-primary' },
                { label: t.storageTotal, value: '256 MB', pct: 100, color: 'bg-border' },
              ].map(({ label, value, pct, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-[10px] font-grotesk text-gray-500 mb-1">
                    <span>{label}</span>
                    <span className="text-gray-300">{value}</span>
                  </div>
                  <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              {[
                { label: t.pdfFiles, count: 3 },
                { label: t.dwgFiles, count: 2 },
                { label: t.storageTotal, count: 5 },
              ].map(({ label, count }) => (
                <div key={label} className="flex justify-between text-[10px] font-grotesk">
                  <span className="text-gray-500">{label}</span>
                  <span className="text-gray-300">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-2 border border-primary/20 rounded-sm p-4 space-y-3">
            <h3 className="font-grotesk text-xs font-600 text-primary uppercase tracking-widest">{t.quickTips}</h3>
            <ul className="space-y-2 text-[10px] text-gray-500 leading-relaxed">
              <li className="flex items-start gap-2"><Icon name="info" size={12} className="text-primary mt-0.5 shrink-0" />{t.tipDWG}</li>
              <li className="flex items-start gap-2"><Icon name="info" size={12} className="text-primary mt-0.5 shrink-0" />{t.tipPDF}</li>
              <li className="flex items-start gap-2"><Icon name="info" size={12} className="text-primary mt-0.5 shrink-0" />{t.tipEncrypted}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Profile Editor ───────────────────────────────────────────────────────────
export const ProfileEditor: React.FC<{
  user: User;
  onSave: (updates: Partial<User>) => void;
  lang?: Lang;
}> = ({ user, onSave, lang = 'EN' }) => {
  const t = LANG_LABELS[lang];
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [avatar, setAvatar] = useState<string | null>(user.avatar ?? null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handlePhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setAvatar(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave({ name: name.trim() || user.name, email: email.trim(), phone: phone.trim(), avatar: avatar ?? undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-surface-3 border-2 border-primary/40 overflow-hidden flex items-center justify-center glow-green">
            {avatar
              ? <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
              : <Icon name="person" size={36} className="text-gray-500" />
            }
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center text-gray-400 hover:text-primary transition-colors"
          >
            <Icon name="edit" size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-1.5 text-[10px] font-grotesk text-gray-500 border border-border px-2.5 py-1.5 rounded-sm hover:border-secondary hover:text-secondary transition-colors"
          >
            <Icon name="photo_camera" size={13} />
            {t.camera}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-[10px] font-grotesk text-gray-500 border border-border px-2.5 py-1.5 rounded-sm hover:border-primary hover:text-primary transition-colors"
          >
            <Icon name="photo_library" size={13} />
            {t.gallery}
          </button>
          {avatar && (
            <button
              onClick={() => setAvatar(null)}
              className="flex items-center gap-1.5 text-[10px] font-grotesk text-gray-500 border border-border px-2.5 py-1.5 rounded-sm hover:border-red-400 hover:text-red-400 transition-colors"
            >
              <Icon name="delete" size={13} />
              {t.remove}
            </button>
          )}
        </div>

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
      </div>

      {/* Fields */}
      <div className="space-y-3">
        <div>
          <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.fullName}</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-box" />
        </div>
        <div>
          <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.emailLabel}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-box" />
        </div>
        <div>
          <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.phoneLabel}</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input-box" />
        </div>
      </div>

      <button
        onClick={handleSave}
        className={`w-full py-2.5 font-grotesk text-xs font-700 tracking-widest rounded-sm transition-all flex items-center justify-center gap-2 ${
          saved ? 'bg-primary/10 text-primary border border-primary/30' : 'sig-gradient text-black hover:opacity-90 active:scale-[0.98]'
        }`}
      >
        <Icon name={saved ? 'check_circle' : 'save'} size={16} />
        {saved ? t.saved : t.saveChanges}
      </button>
    </div>
  );
};

// ─── Add Property Modal ───────────────────────────────────────────────────────
export const AddPropertyModal: React.FC<{
  onSave: (p: Property) => void;
  onClose: () => void;
  lang?: Lang;
  initial?: Property; // when set, the modal edits this property instead of creating one
}> = ({ onSave, onClose, lang = 'EN', initial }) => {
  const t = LANG_LABELS[lang];
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [floorCount, setFloorCount] = useState(initial?.floors ?? 1);
  const [floorLayouts, setFloorLayouts] = useState<{ floor: number; start: number; end: number }[]>(
    initial?.floorLayouts && initial.floorLayouts.length > 0
      ? initial.floorLayouts
      : [{ floor: 1, start: 101, end: 120 }],
  );
  const [amenities, setAmenities] = useState<string[]>(initial?.amenities ?? []);
  const [customAmenity, setCustomAmenity] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(initial?.photoUrl ?? null);
  const [schematicName, setSchematicName] = useState(initial?.schematicUrl ?? '');
  const [error, setError] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);
  const schematicRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFloorLayouts(prev => {
      const next: { floor: number; start: number; end: number }[] = [];
      for (let i = 1; i <= floorCount; i++) {
        const existing = prev.find(f => f.floor === i);
        next.push(existing || { floor: i, start: i * 100 + 1, end: i * 100 + 20 });
      }
      return next;
    });
  }, [floorCount]);

  const updateLayout = (floor: number, field: 'start' | 'end', value: number) =>
    setFloorLayouts(prev => prev.map(f => f.floor === floor ? { ...f, [field]: value } : f));

  const toggleAmenity = (a: string) =>
    setAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const addCustomAmenity = () => {
    const trimmed = customAmenity.trim();
    if (trimmed && !amenities.includes(trimmed)) {
      setAmenities(prev => [...prev, trimmed]);
      setCustomAmenity('');
    }
  };

  const handleLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setLogoUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!name.trim()) { setError(t.propertyNameRequired); return; }
    onSave({
      ...(initial ?? {}),
      id: initial?.id ?? `prop-${Date.now()}`,
      name: name.trim(),
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
      floors: floorCount,
      floorLayouts,
      amenities,
      commonAreas: amenities,
      photoUrl: logoUrl ?? undefined,
      schematicUrl: schematicName || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-2 border border-border rounded-sm w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div>
            <h2 className="font-grotesk text-sm font-700 text-gray-100 flex items-center gap-2">
              <Icon name="apartment" size={16} className="text-primary" />
              {initial ? `Edit ${initial.name}` : t.addProperty}
            </h2>
            <p className="text-[10px] text-gray-500 font-grotesk mt-0.5">{t.propertyConfig}</p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors">
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 pb-4 border-b border-border">
            <div
              onClick={() => logoRef.current?.click()}
              className="w-20 h-20 rounded-sm bg-surface-3 border-2 border-dashed border-border hover:border-primary cursor-pointer flex items-center justify-center overflow-hidden transition-colors"
            >
              {logoUrl
                ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                : <Icon name="apartment" size={32} className="text-gray-600" />
              }
            </div>
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              className="flex items-center gap-1.5 text-[10px] font-grotesk text-gray-500 border border-border px-3 py-1.5 rounded-sm hover:border-primary hover:text-primary transition-colors"
            >
              <Icon name="photo_library" size={13} />
              {t.companyLogo}
            </button>
            <input ref={logoRef} type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files?.[0] && handleLogo(e.target.files[0])} />
          </div>

          {/* Basic Info */}
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">
                {t.propertyName} *
              </label>
              <input type="text" value={name}
                onChange={e => { setName(e.target.value); setError(''); }}
                className="input-box" placeholder="Grand View Resort & Spa" />
            </div>
            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">
                {t.propertyAddress}
              </label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                className="input-box" placeholder="123 Main St, Miami, FL 33101" />
            </div>
            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">
                {t.propertyPhone}
              </label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="input-box" placeholder="(305) 555-0100" />
            </div>
          </div>

          {/* Floor Count & Room Numbering */}
          <div className="border-t border-border pt-4 space-y-4">
            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-2">
                {t.floorCount}
              </label>
              <div className="flex items-center gap-3">
                <button type="button"
                  onClick={() => setFloorCount(f => Math.max(1, f - 1))}
                  className="w-8 h-8 rounded-sm bg-surface-3 border border-border flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary transition-colors"
                >
                  <Icon name="remove" size={16} />
                </button>
                <span className="font-grotesk font-700 text-2xl text-primary w-8 text-center">{floorCount}</span>
                <button type="button"
                  onClick={() => setFloorCount(f => Math.min(50, f + 1))}
                  className="w-8 h-8 rounded-sm bg-surface-3 border border-border flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary transition-colors"
                >
                  <Icon name="add" size={16} />
                </button>
                <span className="text-[10px] text-gray-500 font-grotesk">{t.floors}</span>
              </div>
            </div>

            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-2">
                {t.roomNumbering}
              </label>
              <div className="space-y-2">
                {floorLayouts.map(layout => (
                  <div key={layout.floor} className="flex items-center gap-2">
                    <span className="text-[9px] font-grotesk text-gray-600 w-14 shrink-0">
                      {t.floorLabel} {layout.floor}
                    </span>
                    <input type="number" value={layout.start}
                      onChange={e => updateLayout(layout.floor, 'start', parseInt(e.target.value) || layout.start)}
                      className="input-box w-20 text-center text-xs" placeholder="101" />
                    <span className="text-gray-600 text-xs">—</span>
                    <input type="number" value={layout.end}
                      onChange={e => updateLayout(layout.floor, 'end', parseInt(e.target.value) || layout.end)}
                      className="input-box w-20 text-center text-xs" placeholder="120" />
                    <span className="text-[9px] text-gray-600 font-grotesk shrink-0">
                      ({Math.max(0, layout.end - layout.start + 1)} {t.roomsLabel})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Amenities */}
          <div className="border-t border-border pt-4 space-y-3">
            <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block">
              {t.commonAreasAmenities}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_AMENITIES.map(a => (
                <button key={a} type="button" onClick={() => toggleAmenity(a)}
                  className={`px-2.5 py-1 text-[10px] font-grotesk rounded-sm border transition-all ${
                    amenities.includes(a)
                      ? 'bg-primary/15 border-primary text-primary'
                      : 'bg-surface-3 border-border text-gray-500 hover:border-primary/40 hover:text-gray-300'
                  }`}
                >
                  {amenities.includes(a) && '✓ '}{a}
                </button>
              ))}
            </div>
            {/* Custom amenity input */}
            <div className="flex items-center gap-2">
              <input type="text" value={customAmenity}
                onChange={e => setCustomAmenity(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomAmenity())}
                className="input-box flex-1" placeholder={t.customAmenity} />
              <button type="button" onClick={addCustomAmenity}
                className="px-3 py-2 text-[10px] font-grotesk font-700 bg-surface-3 border border-border rounded-sm text-gray-400 hover:text-primary hover:border-primary transition-colors shrink-0"
              >
                {t.addAmenity}
              </button>
            </div>
            {/* Custom amenities tags */}
            {amenities.filter(a => !PRESET_AMENITIES.includes(a)).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {amenities.filter(a => !PRESET_AMENITIES.includes(a)).map(a => (
                  <span key={a} className="px-2.5 py-1 text-[10px] font-grotesk rounded-sm bg-secondary/10 border border-secondary/30 text-secondary flex items-center gap-1">
                    {a}
                    <button type="button" onClick={() => setAmenities(prev => prev.filter(x => x !== a))}
                      className="hover:text-red-400 transition-colors ml-0.5">
                      <Icon name="close" size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Schematic Upload */}
          <div className="border-t border-border pt-4 space-y-2">
            <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block">
              {t.uploadSchematics}
            </label>
            <div
              onClick={() => schematicRef.current?.click()}
              className="border border-dashed border-border rounded-sm p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
            >
              {schematicName ? (
                <>
                  <Icon name="description" size={24} className="text-primary" />
                  <span className="text-[10px] font-grotesk text-primary">{schematicName}</span>
                </>
              ) : (
                <>
                  <Icon name="upload_file" size={24} className="text-gray-600" />
                  <span className="text-[10px] font-grotesk text-gray-500">{t.fileSupport}</span>
                </>
              )}
            </div>
            <input ref={schematicRef} type="file" accept=".pdf,.dwg" className="hidden"
              onChange={e => e.target.files?.[0] && setSchematicName(e.target.files[0].name)} />
          </div>

          {error && (
            <p className="text-[11px] text-red-400 flex items-center gap-1.5">
              <Icon name="error" size={14} />
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[10px] font-grotesk font-600 text-gray-500 border border-border rounded-sm hover:text-gray-300 hover:border-gray-500 transition-colors"
          >
            {t.cancel}
          </button>
          <button type="button" onClick={handleSave}
            className="px-4 py-2 text-[10px] font-grotesk font-700 tracking-widest text-black sig-gradient rounded-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <Icon name="apartment" size={14} />
            {t.saveProperty}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Admin Settings ───────────────────────────────────────────────────────────
const AdminSettings: React.FC<{
  user: User;
  property: Property;
  properties: Property[];
  onAddProperty: (p: Property) => void;
  onUpdateProperty: (p: Property) => void;
  onDeleteProperty: (id: string) => void;
  lang: Lang;
  onUpdateUser: (u: Partial<User>) => void;
}> = ({ user, property, properties, onAddProperty, onUpdateProperty, onDeleteProperty, lang, onUpdateUser }) => {
  const t = LANG_LABELS[lang];
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pmUploadingId, setPmUploadingId] = useState<string | null>(null);
  const [pmError, setPmError] = useState('');

  const handlePropertyLogoChange = (p: Property, file: File) => {
    const reader = new FileReader();
    reader.onload = e => onUpdateProperty({ ...p, photoUrl: e.target?.result as string });
    reader.readAsDataURL(file);
  };

  const handlePmPdfChange = async (p: Property, file: File) => {
    setPmError('');
    setPmUploadingId(p.id);
    try {
      const { url, name: pdfName } = await uploadPropertyPdf(p.id, file);
      onUpdateProperty({ ...p, pmPdfUrl: url, pmPdfName: pdfName });
    } catch (err) {
      setPmError(err instanceof Error ? err.message : 'PDF upload failed.');
    } finally {
      setPmUploadingId(null);
    }
  };

  return (
  <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-5">
    <div>
      <h1 className="font-grotesk text-base md:text-lg font-700 text-gray-100">{t.systemSettings}</h1>
      <p className="text-xs text-gray-500 mt-0.5">{t.propertyConfig}</p>
    </div>

    {/* Admin Profile */}
    <div className="bg-surface-2 border border-border rounded-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-grotesk text-xs font-600 text-gray-300 uppercase tracking-widest flex items-center gap-2">
          <Icon name="person" size={16} className="text-primary" />
          {t.adminProfile}
        </h3>
        <span className="text-[9px] font-grotesk text-primary uppercase tracking-widest">{user.role}</span>
      </div>
      <ProfileEditor user={user} onSave={onUpdateUser} lang={lang} />
    </div>

    {/* Properties */}
    <div className="bg-surface-2 border border-border rounded-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-grotesk text-xs font-600 text-gray-300 uppercase tracking-widest flex items-center gap-2">
          <Icon name="apartment" size={16} className="text-secondary" />
          {t.properties}
        </h3>
        <button
          onClick={() => setShowAddProperty(true)}
          className="flex items-center gap-1.5 text-[10px] font-grotesk font-600 text-primary border border-primary/30 bg-primary/5 hover:bg-primary/15 px-3 py-1.5 rounded-sm transition-all"
        >
          <Icon name="add" size={14} />
          {t.addProperty}
        </button>
      </div>

      {properties.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-gray-600 gap-2">
          <Icon name="apartment" size={32} />
          <p className="text-xs font-grotesk">{t.noProperties}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map(p => {
            const logoInputId = `logo-input-${p.id}`;
            return (
              <div key={p.id} className="bg-surface-3 border border-border rounded-sm p-4">
                <div className="flex items-start gap-3">
                  {/* Logo — click to change */}
                  <label htmlFor={logoInputId} className="cursor-pointer shrink-0" title={t.companyLogo}>
                    <div className="w-14 h-14 rounded-sm bg-surface-2 border border-border flex items-center justify-center overflow-hidden hover:border-primary transition-colors">
                      {p.photoUrl
                        ? <img src={p.photoUrl} alt={p.name} className="w-full h-full object-contain" />
                        : <Icon name="apartment" size={22} className="text-gray-600" />
                      }
                    </div>
                    <input
                      id={logoInputId}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => e.target.files?.[0] && handlePropertyLogoChange(p, e.target.files[0])}
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-grotesk font-600 text-gray-200">{p.name}</p>
                    {p.address && (
                      <p className="text-[10px] text-gray-500 font-grotesk mt-0.5 flex items-center gap-1">
                        <Icon name="location_on" size={10} />{p.address}
                      </p>
                    )}
                    {p.phone && (
                      <p className="text-[10px] text-gray-500 font-grotesk flex items-center gap-1">
                        <Icon name="phone" size={10} />{p.phone}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-600 font-grotesk mt-1">
                      {p.floors} {t.floors} · {p.floorLayouts?.reduce((acc, fl) => acc + (fl.end - fl.start + 1), 0) || 0} {t.roomsLabel}
                    </p>
                    {p.amenities && p.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.amenities.map(a => (
                          <span key={a} className="px-1.5 py-0.5 text-[8px] font-grotesk bg-secondary/10 border border-secondary/20 text-secondary rounded-sm">
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* PM requirements PDF */}
                    <div className="mt-2 pt-2 border-t border-border flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest flex items-center gap-1">
                        <Icon name="picture_as_pdf" size={12} className={p.pmPdfUrl ? 'text-primary' : 'text-gray-600'} />
                        PM Requirements
                      </span>
                      {p.pmPdfUrl ? (
                        <button
                          onClick={() => openPdf(p.pmPdfUrl!)}
                          className="text-[9px] font-grotesk text-primary border border-primary/30 bg-primary/5 hover:bg-primary/15 px-2 py-0.5 rounded-sm transition-colors max-w-[140px] truncate"
                          title={p.pmPdfName}
                        >
                          View {p.pmPdfName || 'PDF'}
                        </button>
                      ) : (
                        <span className="text-[9px] font-grotesk text-gray-600">No PDF uploaded</span>
                      )}
                      <label className="text-[9px] font-grotesk text-gray-500 border border-border px-2 py-0.5 rounded-sm hover:border-secondary hover:text-secondary transition-colors cursor-pointer">
                        {pmUploadingId === p.id ? 'Uploading…' : p.pmPdfUrl ? 'Replace' : 'Upload PDF'}
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          disabled={pmUploadingId === p.id}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handlePmPdfChange(p, f); e.target.value = ''; }}
                        />
                      </label>
                    </div>
                  </div>
                  {/* Edit / Delete */}
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <button
                      onClick={() => setEditProperty(p)}
                      title="Edit property (floors, room numbering, details)"
                      className="text-gray-600 hover:text-primary transition-colors"
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    {confirmDeleteId === p.id ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <p className="text-[9px] text-red-400 font-grotesk text-right max-w-[120px]">{t.confirmRemove}</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[9px] font-grotesk text-gray-500 border border-border px-2 py-1 rounded-sm hover:text-gray-300 transition-colors"
                          >
                            {t.cancel}
                          </button>
                          <button
                            onClick={() => { onDeleteProperty(p.id); setConfirmDeleteId(null); }}
                            className="text-[9px] font-grotesk text-red-400 border border-red-400/30 bg-red-400/10 px-2 py-1 rounded-sm hover:bg-red-400/20 transition-colors"
                          >
                            {t.removeProperty}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => properties.length > 1 ? setConfirmDeleteId(p.id) : undefined}
                        title={properties.length === 1 ? t.cannotRemoveLast : t.removeProperty}
                        className={`transition-colors ${properties.length === 1 ? 'text-gray-700 cursor-not-allowed' : 'text-gray-600 hover:text-red-400'}`}
                      >
                        <Icon name="delete" size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {pmError && (
      <p className="text-[11px] text-red-400 flex items-center gap-1.5">
        <Icon name="error" size={14} />
        {pmError}
      </p>
    )}

    {showAddProperty && (
      <AddPropertyModal
        onSave={p => { onAddProperty(p); setShowAddProperty(false); }}
        onClose={() => setShowAddProperty(false)}
        lang={lang}
      />
    )}
    {editProperty && (
      <AddPropertyModal
        initial={editProperty}
        onSave={p => { onUpdateProperty(p); setEditProperty(null); }}
        onClose={() => setEditProperty(null)}
        lang={lang}
      />
    )}
  </div>
  );
};

// ─── Admin Issues ─────────────────────────────────────────────────────────────
const AdminIssues: React.FC<{ tasks: Task[]; onUpdateTask: (task: Task) => void; lang: Lang }> = ({ tasks, onUpdateTask, lang }) => {
  const t = LANG_LABELS[lang];
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [respondingTo, setRespondingTo] = useState<Task | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionPhoto, setCompletionPhoto] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const filtered = tasks.filter(t =>
    filter === 'ALL' ? true :
    filter === 'COMPLETED' ? t.status === 'COMPLETED' || t.status === 'AWAITING_REVIEW' :
    t.status === filter
  );

  const priorityColor = (p: string) =>
    p === 'HIGH' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
    p === 'MEDIUM' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
    'text-gray-400 bg-gray-400/10 border-gray-400/20';

  const statusColor = (s: string) =>
    s === 'COMPLETED' ? 'bg-primary/10 text-primary' :
    s === 'AWAITING_REVIEW' ? 'bg-yellow-400/10 text-yellow-400' :
    s === 'IN_PROGRESS' ? 'bg-secondary/10 text-secondary' :
    'bg-gray-500/10 text-gray-500';

  const handlePhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setCompletionPhoto(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const submitResponse = (newStatus: 'IN_PROGRESS' | 'COMPLETED') => {
    if (!respondingTo) return;
    onUpdateTask({
      ...respondingTo,
      status: newStatus,
      completionPhotoUrl: completionPhoto ?? respondingTo.completionPhotoUrl,
      completionNotes: completionNotes.trim() || respondingTo.completionNotes,
      completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : respondingTo.completedAt,
    });
    setRespondingTo(null);
    setCompletionNotes('');
    setCompletionPhoto(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-grotesk text-base font-700 text-gray-100">{t.issueQueue}</h2>
        <span className="text-[10px] font-grotesk text-red-400">{tasks.filter(task => task.status === 'PENDING').length} {t.pending}</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 text-[9px] font-grotesk font-700 rounded-sm transition-colors ${
              filter === f ? 'sig-gradient text-black' : 'bg-surface-2 border border-border text-gray-500 hover:text-gray-300'
            }`}
          >{f.replace('_', ' ')}</button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-600 space-y-2">
          <Icon name="check_circle" size={36} />
          <p className="text-xs font-grotesk">{t.noIssues}</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(task => (
          <div key={task.id} className="bg-surface-2 border border-border rounded-sm overflow-hidden">
            <button
              onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
              className="w-full p-4 text-left space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {task.roomNumber && (
                    <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest mb-0.5">Room {task.roomNumber}</p>
                  )}
                  <p className="text-sm text-gray-200 leading-tight">{task.description}</p>
                  <p className="text-[10px] text-gray-500 font-grotesk mt-1">{t.reportedBy} {task.reportedBy} · {new Date(task.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-[9px] font-grotesk font-700 px-1.5 py-0.5 rounded-sm border ${priorityColor(task.priority)}`}>{task.priority}</span>
                  <span className={`text-[9px] font-grotesk px-1.5 py-0.5 rounded-sm ${statusColor(task.status)}`}>{task.status.replace(/_/g, ' ')}</span>
                </div>
              </div>
            </button>

            {expandedId === task.id && (
              <div className="border-t border-border p-4 space-y-3">
                {task.issuePhotoUrl && (
                  <div>
                    <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">{t.issuePhoto}</p>
                    <img src={task.issuePhotoUrl} alt="Issue" className="w-full max-h-48 object-cover rounded-sm border border-red-400/20" />
                  </div>
                )}
                {task.completionPhotoUrl && (
                  <div>
                    <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">{t.repairPhoto}</p>
                    <img src={task.completionPhotoUrl} alt="Repair" className="w-full max-h-48 object-cover rounded-sm border border-primary/30" />
                  </div>
                )}
                {task.completionNotes && (
                  <div>
                    <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">{t.techNotes}</p>
                    <p className="text-xs text-gray-300 font-grotesk">{task.completionNotes}</p>
                  </div>
                )}
                {task.status !== 'COMPLETED' && (
                  <button
                    onClick={() => { setRespondingTo(task); setCompletionNotes(task.completionNotes ?? ''); setCompletionPhoto(task.completionPhotoUrl ?? null); }}
                    className="w-full py-1.5 text-[10px] font-grotesk font-700 sig-gradient text-black rounded-sm"
                  >
                    {task.status === 'PENDING' ? t.respondToIssue : t.updateResponse}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Response modal */}
      {respondingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-surface-2 border border-border rounded-sm shadow-2xl space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-grotesk text-sm font-700 text-gray-100 flex items-center gap-2">
                <Icon name="build" size={18} className="text-secondary" />
                {t.respondToIssue}
              </h2>
              <button onClick={() => { setRespondingTo(null); setCompletionPhoto(null); setCompletionNotes(''); }} className="text-gray-600 hover:text-gray-300">
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="bg-surface border border-border rounded-sm p-3 space-y-1">
              {respondingTo.roomNumber && <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest">{t.room} {respondingTo.roomNumber}</p>}
              <p className="text-xs text-gray-300 font-grotesk">{respondingTo.description}</p>
              <p className="text-[9px] text-gray-600 font-grotesk">{t.reportedBy} {respondingTo.reportedBy}</p>
            </div>

            {respondingTo.issuePhotoUrl && (
              <div>
                <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">{t.issuePhoto}</p>
                <img src={respondingTo.issuePhotoUrl} alt="Issue" className="w-full max-h-36 object-cover rounded-sm border border-red-400/20" />
              </div>
            )}

            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.repairPhoto}</label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
              {completionPhoto ? (
                <div className="relative">
                  <img src={completionPhoto} alt="Repair" className="w-full h-36 object-cover rounded-sm border border-border" />
                  <button onClick={() => setCompletionPhoto(null)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-gray-300">
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className="w-full h-24 border border-dashed border-border rounded-sm flex flex-col items-center justify-center gap-1 text-gray-600 hover:border-primary hover:text-primary transition-colors">
                  <Icon name="add_a_photo" size={22} />
                  <span className="text-[10px] font-grotesk">{t.attachRepairPhoto}</span>
                </button>
              )}
            </div>

            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.techNotes}</label>
              <textarea
                value={completionNotes}
                onChange={e => setCompletionNotes(e.target.value)}
                placeholder={t.describeRepair}
                rows={3}
                className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-primary resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => submitResponse('IN_PROGRESS')} className="flex-1 py-2 text-[11px] font-grotesk font-700 text-secondary border border-secondary/40 rounded-sm hover:bg-secondary/10 transition-colors">
                {t.markInProgress}
              </button>
              <button onClick={() => submitResponse('COMPLETED')} className="flex-1 py-2 text-[11px] font-grotesk font-700 text-black sig-gradient rounded-sm">
                {t.markComplete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Admin Calendar ───────────────────────────────────────────────────────────
type CalEventType = 'PM_SCHEDULE' | 'REPAIR_PROJECT' | 'VENDOR' | 'EMPLOYEE_SCHEDULE' | 'EQUIPMENT_TEST' | 'HOTEL_STANDARD';

interface CalEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  type: CalEventType;
  description?: string;
  assignedTo?: string;
  recurrence?: 'WEEKLY' | 'MONTHLY';
}

const EVENT_TYPE_CONFIG: Record<CalEventType, { color: string; dot: string }> = {
  PM_SCHEDULE:       { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',   dot: 'bg-blue-400' },
  REPAIR_PROJECT:    { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', dot: 'bg-orange-400' },
  VENDOR:            { color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', dot: 'bg-purple-400' },
  EMPLOYEE_SCHEDULE: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
  EQUIPMENT_TEST:    { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
  HOTEL_STANDARD:    { color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',   dot: 'bg-cyan-400' },
};

const MOCK_CALENDAR_EVENTS: CalEvent[] = [
  { id: 'ce1', title: 'HVAC Filter Replacement – All Floors', date: '2026-04-28', type: 'PM_SCHEDULE', recurrence: 'MONTHLY', assignedTo: 'Elias Thorne' },
  { id: 'ce2', title: 'Fire Suppression System Test', date: '2026-04-29', type: 'EQUIPMENT_TEST', description: 'Annual test per fire code', assignedTo: 'Elias Thorne' },
  { id: 'ce3', title: 'Elevator Maintenance', date: '2026-05-02', endDate: '2026-05-03', type: 'REPAIR_PROJECT', assignedTo: 'Vendor: Otis' },
  { id: 'ce4', title: 'Plumbing Vendor Inspection', date: '2026-05-05', type: 'VENDOR', description: 'Annual plumbing system review' },
  { id: 'ce5', title: 'Marcus Webb – Week Schedule', date: '2026-04-27', endDate: '2026-05-01', type: 'EMPLOYEE_SCHEDULE', assignedTo: 'Marcus Webb' },
  { id: 'ce6', title: 'Emergency Exit Lighting Test', date: '2026-05-07', type: 'EQUIPMENT_TEST', recurrence: 'MONTHLY' },
  { id: 'ce7', title: 'Pool Chemical Standards Review', date: '2026-05-10', type: 'HOTEL_STANDARD', description: 'Health dept compliance' },
  { id: 'ce8', title: 'Roof Drainage Inspection', date: '2026-05-15', type: 'PM_SCHEDULE', recurrence: 'MONTHLY' },
  { id: 'ce9', title: 'Alexandra Chen – Schedule', date: '2026-05-04', endDate: '2026-05-08', type: 'EMPLOYEE_SCHEDULE', assignedTo: 'Alexandra Chen' },
  { id: 'ce10', title: 'Electrical Panel Inspection', date: '2026-05-20', type: 'EQUIPMENT_TEST', description: 'Quarterly safety check' },
];

const CAL_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const AddEventModal: React.FC<{
  event: CalEvent | null;
  lang: Lang;
  onSave: (ev: CalEvent) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}> = ({ event, lang, onSave, onDelete, onClose }) => {
  const t = LANG_LABELS[lang];
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(event?.endDate ?? '');
  const [type, setType] = useState<CalEventType>(event?.type ?? 'PM_SCHEDULE');
  const [description, setDescription] = useState(event?.description ?? '');
  const [assignedTo, setAssignedTo] = useState(event?.assignedTo ?? '');
  const [recurrence, setRecurrence] = useState<'NONE' | 'WEEKLY' | 'MONTHLY'>(event?.recurrence ?? 'NONE');

  const handleSave = () => {
    if (!title.trim() || !date) return;
    onSave({
      id: event?.id ?? `ev-${Date.now()}`,
      title: title.trim(),
      date,
      endDate: endDate || undefined,
      type,
      description: description || undefined,
      assignedTo: assignedTo || undefined,
      recurrence: recurrence !== 'NONE' ? recurrence : undefined,
    });
  };

  const typeOptions: { value: CalEventType; label: string }[] = [
    { value: 'PM_SCHEDULE',       label: t.pmSchedule },
    { value: 'REPAIR_PROJECT',    label: t.repairProject },
    { value: 'VENDOR',            label: t.vendorVisit },
    { value: 'EMPLOYEE_SCHEDULE', label: t.employeeSchedule },
    { value: 'EQUIPMENT_TEST',    label: t.equipmentTest },
    { value: 'HOTEL_STANDARD',    label: t.hotelStandard },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-2 border border-border rounded-sm w-full max-w-md">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-grotesk font-700 text-gray-200">{event ? t.editEvent : t.addEvent}</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300"><Icon name="close" size={18} /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto max-h-[70vh]">
          <div>
            <label className="text-[10px] text-gray-500 font-grotesk uppercase tracking-widest block mb-1">{t.eventTitle}</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-surface-3 border border-border rounded-sm px-3 py-2 text-[11px] text-gray-200 font-grotesk focus:border-primary/50 outline-none" placeholder={t.eventTitle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 font-grotesk uppercase tracking-widest block mb-1">{t.eventDate}</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-surface-3 border border-border rounded-sm px-3 py-2 text-[11px] text-gray-200 font-grotesk focus:border-primary/50 outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-grotesk uppercase tracking-widest block mb-1">{t.eventEndDate}</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-surface-3 border border-border rounded-sm px-3 py-2 text-[11px] text-gray-200 font-grotesk focus:border-primary/50 outline-none" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-grotesk uppercase tracking-widest block mb-1">{t.eventType}</label>
            <select value={type} onChange={e => setType(e.target.value as CalEventType)} className="w-full bg-surface-3 border border-border rounded-sm px-3 py-2 text-[11px] text-gray-200 font-grotesk focus:border-primary/50 outline-none">
              {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-grotesk uppercase tracking-widest block mb-1">{t.eventAssignedTo}</label>
            <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="w-full bg-surface-3 border border-border rounded-sm px-3 py-2 text-[11px] text-gray-200 font-grotesk focus:border-primary/50 outline-none" placeholder={t.eventAssignedTo} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-grotesk uppercase tracking-widest block mb-1">{t.eventRecurrence}</label>
            <select value={recurrence} onChange={e => setRecurrence(e.target.value as 'NONE' | 'WEEKLY' | 'MONTHLY')} className="w-full bg-surface-3 border border-border rounded-sm px-3 py-2 text-[11px] text-gray-200 font-grotesk focus:border-primary/50 outline-none">
              <option value="NONE">{t.recurrenceNone}</option>
              <option value="WEEKLY">{t.recurrenceWeekly}</option>
              <option value="MONTHLY">{t.recurrenceMonthly}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-grotesk uppercase tracking-widest block mb-1">{t.eventDescription}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full bg-surface-3 border border-border rounded-sm px-3 py-2 text-[11px] text-gray-200 font-grotesk focus:border-primary/50 outline-none resize-none" />
          </div>
        </div>
        <div className="p-4 border-t border-border flex items-center justify-between gap-2">
          {onDelete ? (
            <button onClick={() => onDelete(event!.id)} className="text-[10px] font-grotesk font-600 text-red-400 hover:text-red-300 flex items-center gap-1.5 transition-colors">
              <Icon name="delete" size={14} />{t.deleteEvent}
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-[10px] font-grotesk text-gray-500 hover:text-gray-300 px-3 py-1.5 border border-border rounded-sm transition-colors">{t.cancel}</button>
            <button onClick={handleSave} disabled={!title.trim()} className="text-[10px] font-grotesk font-700 text-black bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-sm disabled:opacity-40 transition-colors">{t.addToCalendar}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminCalendar: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = LANG_LABELS[lang];
  const todayObj = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(todayObj.getFullYear(), todayObj.getMonth(), 1));
  const [events, setEvents] = useState<CalEvent[]>(MOCK_CALENDAR_EVENTS);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<CalEventType | 'ALL'>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CalEvent[] | null>(null);
  const [csvError, setCsvError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const fmtDate = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const todayStr = fmtDate(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());

  const getEventsForDate = (dateStr: string) =>
    events.filter(ev => {
      if (filterType !== 'ALL' && ev.type !== filterType) return false;
      if (ev.endDate) return dateStr >= ev.date && dateStr <= ev.endDate;
      return ev.date === dateStr;
    });

  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  const typeLabel = (type: CalEventType) => ({
    PM_SCHEDULE: t.pmSchedule,
    REPAIR_PROJECT: t.repairProject,
    VENDOR: t.vendorVisit,
    EMPLOYEE_SCHEDULE: t.employeeSchedule,
    EQUIPMENT_TEST: t.equipmentTest,
    HOTEL_STANDARD: t.hotelStandard,
  })[type];

  const handleCsvUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const lines = text.trim().split('\n').filter(l => l.trim());
        const parsed: CalEvent[] = [];
        const validTypes: CalEventType[] = ['PM_SCHEDULE','REPAIR_PROJECT','VENDOR','EMPLOYEE_SCHEDULE','EQUIPMENT_TEST','HOTEL_STANDARD'];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
          const [csvDate, csvTitle, csvType, csvDesc, csvAssigned] = cols;
          if (!csvDate || !csvTitle) continue;
          const evType = validTypes.includes(csvType as CalEventType) ? csvType as CalEventType : 'PM_SCHEDULE';
          parsed.push({ id: `csv-${Date.now()}-${i}`, title: csvTitle, date: csvDate, type: evType, description: csvDesc || undefined, assignedTo: csvAssigned || undefined });
        }
        if (parsed.length === 0) { setCsvError('No valid rows found. Check format.'); return; }
        setCsvPreview(parsed);
        setCsvError('');
      } catch { setCsvError('Failed to parse CSV file.'); }
    };
    reader.readAsText(file);
  };

  const applyImport = () => {
    if (!csvPreview) return;
    setEvents(prev => [...prev, ...csvPreview]);
    setCsvPreview(null);
    setShowUploadModal(false);
  };

  const allFilterTypes = (['ALL','PM_SCHEDULE','REPAIR_PROJECT','VENDOR','EMPLOYEE_SCHEDULE','EQUIPMENT_TEST','HOTEL_STANDARD'] as const);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-surface-2/30 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-grotesk font-700 text-gray-200">{t.calendarSchedule}</h2>
          <p className="text-[10px] text-gray-600 font-grotesk mt-0.5">{t.calendarSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 text-[10px] font-grotesk font-600 text-cyan-400 border border-cyan-400/30 bg-cyan-400/5 hover:bg-cyan-400/15 hover:border-cyan-400/60 px-2.5 py-1.5 rounded-sm transition-all"
          >
            <Icon name="upload_file" size={14} /><span>{t.uploadSchedule}</span>
          </button>
          <button
            onClick={() => { setEditingEvent(null); setShowAddModal(true); }}
            className="flex items-center gap-1.5 text-[10px] font-grotesk font-600 text-primary border border-primary/30 bg-primary/5 hover:bg-primary/15 hover:border-primary/60 px-2.5 py-1.5 rounded-sm transition-all"
          >
            <Icon name="add" size={14} /><span>{t.addEvent}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Filter sidebar */}
        <div className="w-44 shrink-0 border-r border-border bg-surface-2/20 p-3 flex flex-col gap-1 overflow-y-auto">
          <p className="text-[9px] text-gray-600 font-grotesk uppercase tracking-widest mb-2">{t.eventType}</p>
          {allFilterTypes.map(ftype => (
            <button
              key={ftype}
              onClick={() => setFilterType(ftype)}
              className={`flex items-center gap-2 text-[10px] font-grotesk px-2 py-1.5 rounded-sm transition-all text-left ${
                filterType === ftype ? 'bg-surface-3 text-gray-200' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {ftype !== 'ALL' && <span className={`w-2 h-2 rounded-full shrink-0 ${EVENT_TYPE_CONFIG[ftype].dot}`} />}
              <span>{ftype === 'ALL' ? t.allTypes : typeLabel(ftype)}</span>
            </button>
          ))}

          {selectedDate && selectedEvents.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-[9px] text-gray-600 font-grotesk uppercase tracking-widest mb-2">{selectedDate}</p>
              {selectedEvents.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => { setEditingEvent(ev); setShowAddModal(true); }}
                  className="w-full text-left mb-1"
                >
                  <div className={`text-[9px] font-grotesk px-2 py-1 rounded-sm border ${EVENT_TYPE_CONFIG[ev.type].color} truncate`}>{ev.title}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
              className="p-1.5 rounded-sm text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-all"
            >
              <Icon name="chevron_left" size={18} />
            </button>
            <div className="text-center">
              <h3 className="text-sm font-grotesk font-700 text-gray-200">{CAL_MONTH_NAMES[month]} {year}</h3>
              <button
                onClick={() => { setCurrentMonth(new Date(todayObj.getFullYear(), todayObj.getMonth(), 1)); setSelectedDate(todayStr); }}
                className="text-[9px] text-gray-600 hover:text-primary font-grotesk uppercase tracking-widest transition-colors"
              >
                {t.today}
              </button>
            </div>
            <button
              onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
              className="p-1.5 rounded-sm text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-all"
            >
              <Icon name="chevron_right" size={18} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {CAL_DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[11px] text-[#e0e2e6] font-grotesk uppercase tracking-widest py-1">{d}</div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} className="min-h-[72px]" />;
              const dateStr = fmtDate(year, month, day);
              const dayEvents = getEventsForDate(dateStr);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`min-h-[72px] p-1.5 rounded-sm border text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : isToday
                      ? 'border-cyan-500/50 bg-cyan-500/5'
                      : 'border-border bg-surface-2/20 hover:bg-surface-2/50'
                  }`}
                >
                  <span className={`text-[11px] font-grotesk font-700 mb-1 block ${
                    isToday ? 'text-cyan-400' : isSelected ? 'text-primary' : 'text-[#e0e2e6]'
                  }`}>{day}</span>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map(ev => (
                      <div key={ev.id} className={`text-[8px] font-grotesk px-1 py-0.5 rounded-sm border truncate ${EVENT_TYPE_CONFIG[ev.type].color}`}>
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[8px] text-gray-600 font-grotesk px-1">+{dayEvents.length - 2}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddEventModal
          event={editingEvent}
          lang={lang}
          onSave={ev => {
            if (editingEvent) setEvents(prev => prev.map(e => e.id === ev.id ? ev : e));
            else setEvents(prev => [...prev, ev]);
            setShowAddModal(false);
            setEditingEvent(null);
          }}
          onDelete={editingEvent ? id => { setEvents(prev => prev.filter(e => e.id !== id)); setShowAddModal(false); setEditingEvent(null); } : undefined}
          onClose={() => { setShowAddModal(false); setEditingEvent(null); }}
        />
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-2 border border-border rounded-sm w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-grotesk font-700 text-gray-200">{t.uploadScheduleTitle}</h3>
                <p className="text-[10px] text-gray-500 font-grotesk mt-0.5">{t.uploadScheduleSubtitle}</p>
              </div>
              <button onClick={() => { setShowUploadModal(false); setCsvPreview(null); setCsvError(''); }} className="text-gray-600 hover:text-gray-300">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {!csvPreview ? (
                <>
                  <div
                    className="border-2 border-dashed border-border rounded-sm p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.csv')) handleCsvUpload(f); }}
                  >
                    <Icon name="upload_file" size={32} className="text-gray-600 mx-auto mb-2" />
                    <p className="text-[11px] text-gray-400 font-grotesk">{t.dropCsvHere}</p>
                    <p className="text-[10px] text-gray-600 font-grotesk mt-1">{t.csvFilesOnly}</p>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvUpload(f); e.target.value = ''; }} />
                  <div className="bg-surface-3 border border-border rounded-sm p-3">
                    <p className="text-[10px] text-gray-400 font-grotesk font-700 mb-2">{t.csvScheduleFormat}</p>
                    <code className="text-[9px] text-primary font-mono block">date,title,type,description,assignedTo</code>
                    <code className="text-[9px] text-gray-500 font-mono block mt-1">2026-05-01,HVAC Check,PM_SCHEDULE,Monthly filter,Elias Thorne</code>
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[9px] text-gray-600 font-grotesk leading-relaxed">Types: PM_SCHEDULE · REPAIR_PROJECT · VENDOR · EMPLOYEE_SCHEDULE · EQUIPMENT_TEST · HOTEL_STANDARD</p>
                    </div>
                  </div>
                  {csvError && <p className="text-[10px] text-red-400 font-grotesk">{csvError}</p>}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-gray-300 font-grotesk font-700">{csvPreview.length} {t.eventsImported}</p>
                    <button onClick={() => setCsvPreview(null)} className="text-[10px] text-gray-500 hover:text-gray-300 font-grotesk">{t.reUpload}</button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {csvPreview.map((ev, i) => (
                      <div key={i} className={`flex items-start gap-2 p-2 rounded-sm border ${EVENT_TYPE_CONFIG[ev.type].color}`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${EVENT_TYPE_CONFIG[ev.type].dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-grotesk font-700 text-gray-200 truncate">{ev.title}</p>
                          <p className="text-[9px] font-grotesk text-gray-500">{ev.date} · {ev.type.replace(/_/g, ' ')}{ev.assignedTo ? ` · ${ev.assignedTo}` : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={applyImport} className="w-full bg-primary text-black text-[11px] font-grotesk font-700 py-2 rounded-sm hover:bg-primary/90 transition-colors">
                    {t.parseSchedule}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Admin Portal ─────────────────────────────────────────────────────────────
const AdminPortal: React.FC<{
  user: User; onLogout: () => void; lang: Lang; setLang: (l: Lang) => void;
  tasks: Task[]; onAddTask: (task: Task) => void; onUpdateTask: (task: Task) => void;
  onUpdateUser: (u: Partial<User>) => void;
  properties: Property[]; onAddProperty: (p: Property) => void; onUpdateProperty: (p: Property) => void;
  onDeleteProperty: (id: string) => void;
}> = ({
  user, onLogout, lang, setLang, tasks, onAddTask, onUpdateTask, onUpdateUser,
  properties, onAddProperty, onUpdateProperty, onDeleteProperty,
}) => {
  const [view, setView] = useState<AdminView>('dashboard');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [inventory] = useState<InventoryItem[]>(MOCK_INVENTORY);
  const t = LANG_LABELS[lang];
  const openIssueCount = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;

  const initialPropertyId = user.propertyId && properties.find(p => p.id === user.propertyId)
    ? user.propertyId
    : properties[0]?.id ?? MOCK_PROPERTY.id;
  const [activePropertyId, setActivePropertyId] = useState(initialPropertyId);

  const activeProperty = properties.find(p => p.id === activePropertyId) || properties[0] || MOCK_PROPERTY;
  const [rooms, setRooms] = useState<Room[]>(() => generateRooms(activeProperty));

  useEffect(() => {
    setRooms(generateRooms(activeProperty));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePropertyId]);

  const navItems: { view: AdminView; icon: string; label: string }[] = [
    { view: 'dashboard', icon: 'grid_view', label: t.dashboard },
    { view: 'issues', icon: 'report_problem', label: t.issues },
    { view: 'calendar', icon: 'calendar_month', label: t.calendar },
    { view: 'roomgrid', icon: 'meeting_room', label: t.roomGrid },
    { view: 'inventory', icon: 'inventory_2', label: t.inventory },
    { view: 'schematics', icon: 'map', label: t.schematics },
    { view: 'settings', icon: 'settings', label: t.settings },
  ];

  const mobileNavItems = navItems.slice(0, 4); // Dashboard, Issues, Calendar, Room Grid

  return (
    <div className="flex h-[100dvh] bg-surface overflow-hidden">
      <AdminSidebar view={view} setView={setView} onLogout={onLogout} property={activeProperty} properties={properties} activePropertyId={activePropertyId} onPropertyChange={id => { setActivePropertyId(id); setView('dashboard'); }} lang={lang} setLang={setLang} openIssueCount={openIssueCount} />
      <main className="flex-1 overflow-hidden flex flex-col bg-surface blueprint-bg min-w-0">
        {/* Top bar */}
        <div className="h-12 border-b border-border bg-surface-2/50 flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center gap-2">
            <img src={logoHorizontal} alt="Fyxinn" className="h-6 object-contain md:hidden" style={{ filter: 'drop-shadow(0 0 6px rgba(88,226,31,0.3))' }} />
            <div className="hidden md:flex items-center gap-2">
              <span className="text-[10px] text-[#03d5e7] font-grotesk uppercase tracking-widest">FYXINN</span>
              <Icon name="chevron_right" size={14} className="text-gray-700" />
              <span className="text-[10px] text-gray-400 font-grotesk uppercase tracking-widest">{LANG_LABELS[lang][view] || view}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-1.5 text-[10px] font-grotesk font-600 text-red-400 border border-red-400/30 bg-red-400/5 hover:bg-red-400/15 hover:border-red-400/60 px-2.5 py-1.5 rounded-sm transition-all"
            >
              <Icon name="report_problem" size={14} />
              <span className="hidden sm:inline">{t.reportIssue}</span>
            </button>
            <div className="hidden md:block">
              <LangSwitcher lang={lang} onChange={setLang} />
            </div>
            <button className="relative text-gray-600 hover:text-gray-300 transition-colors hidden md:block">
              <Icon name="notifications" size={18} />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500"></span>
            </button>
            <div className="hidden md:flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-surface-3 border border-border overflow-hidden flex items-center justify-center">
                {user.avatar
                  ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  : <Icon name="person" size={14} className="text-gray-500" />
                }
              </div>
              <span className="text-[11px] font-grotesk text-gray-400">{user.name.split(' ')[0]}</span>
            </div>
            {/* Mobile hamburger */}
            <button
              onClick={() => setShowMobileMenu(true)}
              className="md:hidden text-gray-400 hover:text-gray-200 transition-colors p-1"
            >
              <Icon name="menu" size={22} />
            </button>
          </div>
        </div>

        {/* View */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {view === 'dashboard' && <AdminDashboard rooms={rooms} property={activeProperty} lang={lang} onRoomsUpdate={setRooms} />}
          {view === 'issues' && <AdminIssues tasks={tasks} onUpdateTask={onUpdateTask} lang={lang} />}
          {view === 'calendar' && <AdminCalendar lang={lang} />}
          {view === 'roomgrid' && <AdminRoomGrid rooms={rooms} property={activeProperty} lang={lang} />}
          {view === 'inventory' && <AdminInventory inventory={inventory} lang={lang} />}
          {view === 'schematics' && <AdminSchematics lang={lang} />}
          {view === 'settings' && (
            <AdminSettings
              user={user}
              property={activeProperty}
              properties={properties}
              onAddProperty={onAddProperty}
              onUpdateProperty={onUpdateProperty}
              onDeleteProperty={id => {
                onDeleteProperty(id);
                if (id === activePropertyId) {
                  const next = properties.find(p => p.id !== id);
                  if (next) setActivePropertyId(next.id);
                }
              }}
              lang={lang}
              onUpdateUser={onUpdateUser}
            />
          )}
        </div>

        {showReportModal && (
          <ReportIssueModal user={user} onSubmit={task => { onAddTask(task); setShowReportModal(false); }} onClose={() => setShowReportModal(false)} lang={lang} />
        )}

        {/* Mobile bottom nav — 4 primary views only */}
        <nav className="md:hidden h-14 border-t border-border bg-surface-2/90 flex items-center justify-around shrink-0">
          {mobileNavItems.map(item => (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-sm transition-all ${
                view === item.view ? 'text-primary' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              <Icon name={item.icon} size={22} filled={view === item.view} />
              <span className="text-[8px] font-grotesk uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
          {/* More button opens drawer */}
          <button
            onClick={() => setShowMobileMenu(true)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-sm transition-all ${
              ['inventory','schematics','settings'].includes(view) ? 'text-primary' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            <Icon name="more_horiz" size={22} />
            <span className="text-[8px] font-grotesk uppercase tracking-widest">More</span>
          </button>
        </nav>

        {/* Mobile slide-up drawer */}
        {showMobileMenu && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)} />
            {/* Drawer */}
            <div className="relative bg-surface-2 border-t border-border rounded-t-lg pb-safe">
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-700 rounded-full" />
              </div>

              {/* User info */}
              <div className="px-5 py-3 border-b border-border flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-surface-3 border border-border overflow-hidden flex items-center justify-center shrink-0">
                  {user.avatar
                    ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                    : <Icon name="admin_panel_settings" size={18} className="text-primary" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-grotesk text-sm font-700 text-gray-100 truncate">{user.name}</p>
                  <p className="text-[9px] font-grotesk text-primary uppercase tracking-widest">{user.role}</p>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className="text-gray-600 hover:text-gray-300 transition-colors">
                  <Icon name="close" size={20} />
                </button>
              </div>

              {/* All nav items */}
              <div className="px-3 py-3 space-y-0.5">
                {navItems.map(item => (
                  <button
                    key={item.view}
                    onClick={() => { setView(item.view); setShowMobileMenu(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-sm transition-all text-left ${
                      view === item.view
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-surface-3'
                    }`}
                  >
                    <Icon name={item.icon} size={20} filled={view === item.view} />
                    <span className="font-grotesk text-sm font-600">{item.label}</span>
                    {item.view === 'issues' && openIssueCount > 0 && (
                      <span className="ml-auto text-[9px] font-grotesk font-700 bg-red-500 text-white px-1.5 py-0.5 rounded-sm">{openIssueCount}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Language + Theme + Logout */}
              <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <LangSwitcher lang={lang} onChange={setLang} />
                  <ThemeToggle />
                </div>
                <button
                  onClick={() => { setShowMobileMenu(false); onLogout(); }}
                  className="flex items-center gap-2 text-red-400 hover:text-red-300 font-grotesk text-xs font-600 uppercase tracking-widest transition-colors"
                >
                  <Icon name="logout" size={16} />
                  {t.logout}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ─── Staff Dashboard ──────────────────────────────────────────────────────────
const StaffDashboard: React.FC<{ user: User; onNav: (v: StaffView) => void; lang: Lang; onReportIssue: () => void; tasks: Task[] }> = ({ user, onNav, lang, onReportIssue, tasks }) => {
  const t = LANG_LABELS[lang];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t.welcome : hour < 17 ? t.goodAfternoon : t.goodEvening;
  const myTasks = tasks.filter(t => t.reportedBy === user.name);

  const recentActivity = [
    { icon: 'check_circle', text: 'PM Checklist completed — Room 315', time: '09:14 AM', color: 'text-primary' },
    { icon: 'report_problem', text: 'Issue reported — Room 208 AC', time: '08:47 AM', color: 'text-red-400' },
    { icon: 'inventory_2', text: 'Used 2x Air Filter (MERV 8)', time: '08:30 AM', color: 'text-secondary' },
    { icon: 'notifications', text: 'Admin alert: Floor 3 priority sweep', time: '07:55 AM', color: 'text-yellow-400' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5 blueprint-bg">
      {/* Welcome */}
      <div className="pt-2">
        <p className="text-xs text-gray-500 font-grotesk uppercase tracking-widest">{greeting},</p>
        <h2 className="font-grotesk text-xl font-700 text-gray-100 mt-0.5">{user.name}</h2>
        <p className="text-[11px] text-gray-600 font-grotesk mt-0.5">{MOCK_PROPERTY.name}</p>
      </div>

      {/* Action cards */}
      <div className="space-y-3">
        <button
          onClick={() => onNav('myjobs')}
          className="w-full p-4 rounded-sm bg-primary/10 border border-primary/30 hover:border-primary hover:bg-primary/15 transition-all flex items-center justify-between card-hover"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-primary/20 flex items-center justify-center">
              <Icon name="work" size={22} className="text-primary" />
            </div>
            <div className="text-left">
              <p className="font-grotesk text-sm font-700 text-primary">{t.myJobs}</p>
              <p className="text-[10px] text-primary/60 font-grotesk">{myTasks.length} {t.submitted}</p>
            </div>
          </div>
          <Icon name="chevron_right" size={20} className="text-primary/40" />
        </button>

        <button
          onClick={onReportIssue}
          className="w-full p-4 rounded-sm bg-red-500/10 border border-red-500/30 hover:border-red-400 hover:bg-red-500/15 transition-all flex items-center justify-between card-hover"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-red-500/20 flex items-center justify-center">
              <Icon name="report_problem" size={22} className="text-red-400" />
            </div>
            <div className="text-left">
              <p className="font-grotesk text-sm font-700 text-red-400">{t.reportIssue}</p>
              <p className="text-[10px] text-red-400/60 font-grotesk">{t.flagRoom}</p>
            </div>
          </div>
          <Icon name="chevron_right" size={20} className="text-red-400/40" />
        </button>

        <button
          className="w-full p-4 rounded-sm bg-secondary/10 border border-secondary/30 hover:border-secondary hover:bg-secondary/15 transition-all flex items-center justify-between card-hover"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-secondary/20 flex items-center justify-center">
              <Icon name="notification_important" size={22} className="text-secondary" />
            </div>
            <div className="text-left">
              <p className="font-grotesk text-sm font-700 text-secondary">{t.alertAdmin}</p>
              <p className="text-[10px] text-secondary/60 font-grotesk">{t.escalateAdmin}</p>
            </div>
          </div>
          <Icon name="chevron_right" size={20} className="text-secondary/40" />
        </button>
      </div>

      {/* Status bento */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-2 border border-border rounded-sm p-3">
          <p className="text-[9px] font-grotesk text-gray-600 uppercase tracking-widest">{t.openIssues}</p>
          <p className="font-grotesk text-2xl font-700 text-primary mt-1">{myTasks.filter(task => task.status !== 'COMPLETED').length}</p>
          <p className="text-[10px] text-gray-500 font-grotesk">{t.reported}</p>
        </div>
        <div className="bg-surface-2 border border-border rounded-sm p-3">
          <p className="text-[9px] font-grotesk text-gray-600 uppercase tracking-widest">{t.resolved}</p>
          <p className="font-grotesk text-2xl font-700 text-secondary mt-1">{myTasks.filter(task => task.status === 'COMPLETED').length}</p>
          <p className="text-[10px] text-gray-500 font-grotesk">{t.completedLabel}</p>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-surface-2 border border-border rounded-sm p-4 space-y-3">
        <h3 className="font-grotesk text-xs font-600 text-gray-400 uppercase tracking-widest">{t.recentActivity}</h3>
        <div className="space-y-2">
          {recentActivity.map((item, i) => (
            <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border/50 last:border-0">
              <Icon name={item.icon} size={16} className={item.color} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-300 leading-tight">{item.text}</p>
                <p className="text-[9px] text-gray-600 font-grotesk mt-0.5">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Report Issue Modal ───────────────────────────────────────────────────────
const ReportIssueModal: React.FC<{
  user: User;
  onSubmit: (task: Task) => void;
  onClose: () => void;
  lang: Lang;
}> = ({ user, onSubmit, onClose, lang }) => {
  const t = LANG_LABELS[lang];
  const [description, setDescription] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);

  const handlePhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setPhotoUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!description.trim()) return;
    onSubmit({
      id: `task-${Date.now()}`,
      description: description.trim(),
      roomNumber: roomNumber.trim() || undefined,
      status: 'PENDING',
      reportedBy: user.name,
      createdAt: new Date().toISOString(),
      priority,
      issuePhotoUrl: photoUrl ?? undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-surface-2 border border-border rounded-sm shadow-2xl space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-grotesk text-sm font-700 text-gray-100 flex items-center gap-2">
            <Icon name="report_problem" size={18} className="text-red-400" />
            {t.reportIssue}
          </h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.roomLocation}</label>
            <input
              type="text"
              value={roomNumber}
              onChange={e => setRoomNumber(e.target.value)}
              placeholder="e.g. 402, Lobby, Gym"
              className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.descriptionLabel}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the issue in detail…"
              rows={3}
              className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.priorityLabel}</label>
            <div className="flex gap-2">
              {(['LOW', 'MEDIUM', 'HIGH'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-1.5 text-[10px] font-grotesk font-700 rounded-sm border transition-colors ${
                    priority === p
                      ? p === 'HIGH' ? 'bg-red-500/20 border-red-500 text-red-400'
                        : p === 'MEDIUM' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                        : 'bg-gray-500/20 border-gray-500 text-gray-300'
                      : 'border-border text-gray-600 hover:border-gray-500'
                  }`}
                >{p}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.photoOptional}</label>
            {/* Camera input — opens rear camera directly */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
            {/* Gallery / file input */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
            {photoUrl ? (
              <div className="relative">
                <img src={photoUrl} alt="Issue" className="w-full h-36 object-cover rounded-sm border border-border" />
                <button
                  onClick={() => setPhotoUrl(null)}
                  className="absolute top-1.5 right-1.5 bg-black/70 rounded-full p-1 text-gray-300 hover:text-white transition-colors"
                >
                  <Icon name="close" size={14} />
                </button>
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="absolute bottom-1.5 right-1.5 bg-black/70 rounded-sm px-2 py-1 flex items-center gap-1 text-[9px] font-grotesk text-gray-300 hover:text-white transition-colors"
                >
                  <Icon name="photo_camera" size={12} />
                  {t.retake}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="h-20 border border-dashed border-border rounded-sm flex flex-col items-center justify-center gap-1.5 text-gray-500 hover:border-secondary hover:text-secondary transition-colors"
                >
                  <Icon name="photo_camera" size={22} />
                  <span className="text-[10px] font-grotesk">{t.camera}</span>
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="h-20 border border-dashed border-border rounded-sm flex flex-col items-center justify-center gap-1.5 text-gray-500 hover:border-primary hover:text-primary transition-colors"
                >
                  <Icon name="photo_library" size={22} />
                  <span className="text-[10px] font-grotesk">{t.gallery}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 text-[11px] font-grotesk text-gray-500 border border-border rounded-sm hover:border-gray-500 transition-colors">
            {t.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!description.trim()}
            className="flex-1 py-2 text-[11px] font-grotesk font-700 text-black sig-gradient rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t.submitIssue}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Staff My Jobs ────────────────────────────────────────────────────────────
const StaffMyJobs: React.FC<{
  user: User;
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  lang: Lang;
}> = ({ user, tasks, onUpdateTask, lang }) => {
  const t = LANG_LABELS[lang];
  const [respondingTo, setRespondingTo] = useState<Task | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionPhoto, setCompletionPhoto] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const myTasks = tasks.filter(t => t.reportedBy === user.name);

  const priorityColor = (p: string) =>
    p === 'HIGH' ? 'text-red-400 bg-red-400/10' :
    p === 'MEDIUM' ? 'text-yellow-400 bg-yellow-400/10' :
    'text-gray-400 bg-gray-400/10';

  const handlePhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setCompletionPhoto(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const submitCompletion = () => {
    if (!respondingTo) return;
    onUpdateTask({
      ...respondingTo,
      status: 'AWAITING_REVIEW',
      completionPhotoUrl: completionPhoto ?? undefined,
      completionNotes: completionNotes.trim() || undefined,
      completedAt: new Date().toISOString(),
    });
    setRespondingTo(null);
    setCompletionNotes('');
    setCompletionPhoto(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-grotesk text-base font-700 text-gray-100">{t.myReports}</h2>
        <span className="text-[10px] font-grotesk text-primary">{myTasks.length} {t.submitted}</span>
      </div>

      {myTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-600 space-y-2">
          <Icon name="work_off" size={36} />
          <p className="text-xs font-grotesk">{t.noIssuesReported}</p>
        </div>
      )}

      <div className="space-y-2">
        {myTasks.map(task => (
          <div key={task.id} className="bg-surface-2 border border-border rounded-sm overflow-hidden">
            <button
              onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
              className="w-full p-3 space-y-2 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {task.roomNumber && (
                    <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest mb-0.5">{t.room} {task.roomNumber}</p>
                  )}
                  <p className="text-sm text-gray-200 leading-tight">{task.description}</p>
                </div>
                <span className={`text-[9px] font-grotesk font-700 px-1.5 py-0.5 rounded-sm shrink-0 ${priorityColor(task.priority)}`}>
                  {task.priority}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-grotesk px-1.5 py-0.5 rounded-sm ${
                  task.status === 'COMPLETED' ? 'bg-primary/10 text-primary' :
                  task.status === 'IN_PROGRESS' ? 'bg-secondary/10 text-secondary' :
                  task.status === 'AWAITING_REVIEW' ? 'bg-yellow-400/10 text-yellow-400' :
                  'bg-gray-500/10 text-gray-500'
                }`}>{task.status.replace(/_/g, ' ')}</span>
                <span className="text-[9px] text-gray-600 font-grotesk">{new Date(task.createdAt).toLocaleDateString()}</span>
              </div>
            </button>

            {expandedId === task.id && (
              <div className="border-t border-border p-3 space-y-3">
                {task.issuePhotoUrl && (
                  <div>
                    <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">{t.issuePhoto}</p>
                    <img src={task.issuePhotoUrl} alt="Issue" className="w-full max-h-40 object-cover rounded-sm border border-border" />
                  </div>
                )}
                {task.completionPhotoUrl && (
                  <div>
                    <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">{t.repairPhoto}</p>
                    <img src={task.completionPhotoUrl} alt="Repair" className="w-full max-h-40 object-cover rounded-sm border border-primary/30" />
                  </div>
                )}
                {task.completionNotes && (
                  <div>
                    <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest mb-1">{t.techNotes}</p>
                    <p className="text-xs text-gray-300 font-grotesk">{task.completionNotes}</p>
                  </div>
                )}
                {task.status === 'PENDING' && (
                  <button
                    onClick={() => { setRespondingTo(task); }}
                    className="w-full py-1.5 text-[10px] font-grotesk font-700 text-black sig-gradient rounded-sm"
                  >
                    {t.markAsCompleted}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Completion modal */}
      {respondingTo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface-2 border border-border rounded-sm shadow-2xl space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-grotesk text-sm font-700 text-gray-100 flex items-center gap-2">
                <Icon name="check_circle" size={18} className="text-primary" />
                {t.completeRepair}
              </h2>
              <button onClick={() => { setRespondingTo(null); setCompletionPhoto(null); setCompletionNotes(''); }} className="text-gray-600 hover:text-gray-300">
                <Icon name="close" size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-400 font-grotesk">{respondingTo.description}</p>
            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.repairPhoto}</label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
              {completionPhoto ? (
                <div className="relative">
                  <img src={completionPhoto} alt="Repair" className="w-full h-32 object-cover rounded-sm border border-border" />
                  <button onClick={() => setCompletionPhoto(null)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-gray-300">
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className="w-full h-20 border border-dashed border-border rounded-sm flex flex-col items-center justify-center gap-1 text-gray-600 hover:border-primary hover:text-primary transition-colors">
                  <Icon name="add_a_photo" size={20} />
                  <span className="text-[10px] font-grotesk">{t.attachRepairPhoto}</span>
                </button>
              )}
            </div>
            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.notes}</label>
              <textarea
                value={completionNotes}
                onChange={e => setCompletionNotes(e.target.value)}
                placeholder={t.describeRepaired}
                rows={2}
                className="w-full bg-surface border border-border rounded-sm px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setRespondingTo(null); setCompletionPhoto(null); setCompletionNotes(''); }} className="flex-1 py-2 text-[11px] font-grotesk text-gray-500 border border-border rounded-sm hover:border-gray-500 transition-colors">{t.cancel}</button>
              <button onClick={submitCompletion} className="flex-1 py-2 text-[11px] font-grotesk font-700 text-black sig-gradient rounded-sm">
                {t.submitCompletion}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Staff PM Checklist ───────────────────────────────────────────────────────
const StaffChecklist: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = LANG_LABELS[lang];
  const [checklistState, setChecklistState] = useState<PMChecklistState>({});
  const [openCat, setOpenCat] = useState<string | null>('Entry & Threshold');

  const totalItems = Object.values(PM_CHECKLIST_DATA).reduce((acc, items) => acc + items.length, 0);
  const checkedItems = Object.values(checklistState).reduce((acc, cat) =>
    acc + Object.values(cat).filter(Boolean).length, 0
  );
  const progress = Math.round((checkedItems / totalItems) * 100);

  const toggleCheck = (cat: string, item: string) => {
    setChecklistState(prev => ({
      ...prev,
      [cat]: { ...(prev[cat] || {}), [item]: !(prev[cat]?.[item]) }
    }));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-grotesk text-base font-700 text-gray-100">{t.room} 402 · {t.pmChecklist}</h2>
          <span className="font-grotesk text-sm font-700 text-primary">{progress}%</span>
        </div>
        <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
          <div className="h-full sig-gradient transition-all duration-500" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 py-1.5 text-[10px] font-grotesk text-gray-400 border border-border rounded-sm flex items-center justify-center gap-1.5 hover:border-primary hover:text-primary transition-colors">
            <Icon name="photo_camera" size={14} />
            {t.before}
          </button>
          <button className="flex-1 py-1.5 text-[10px] font-grotesk text-gray-400 border border-border rounded-sm flex items-center justify-center gap-1.5 hover:border-secondary hover:text-secondary transition-colors">
            <Icon name="photo_camera" size={14} />
            {t.after}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-20">
        {Object.entries(PM_CHECKLIST_DATA).map(([cat, items]) => {
          const catChecked = items.filter(item => checklistState[cat]?.[item]).length;
          return (
            <div key={cat} className="border border-border rounded-sm overflow-hidden">
              <button
                onClick={() => setOpenCat(openCat === cat ? null : cat)}
                className="w-full p-3 flex items-center justify-between hover:bg-surface-3 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-grotesk font-600 text-gray-200">{cat}</span>
                  <span className="text-[9px] font-grotesk text-gray-600">{catChecked}/{items.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  {catChecked === items.length && <Icon name="check_circle" size={16} className="text-primary" filled />}
                  <Icon name={openCat === cat ? 'expand_less' : 'expand_more'} size={18} className="text-gray-600" />
                </div>
              </button>
              <div className={`accordion-content ${openCat === cat ? 'open' : ''}`}>
                <div className="p-3 space-y-2 border-t border-border">
                  {items.map(item => (
                    <div
                      key={item}
                      className="flex items-start gap-3 cursor-pointer"
                      onClick={() => toggleCheck(cat, item)}
                    >
                      <div className={`pm-checkbox mt-0.5 shrink-0 ${checklistState[cat]?.[item] ? 'checked' : ''}`}>
                        {checklistState[cat]?.[item] && <Icon name="check" size={10} className="text-black" />}
                      </div>
                      <span className={`text-xs leading-tight ${checklistState[cat]?.[item] ? 'text-gray-600 line-through' : 'text-gray-300'}`}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky complete button */}
      <div className="p-4 border-t border-border bg-surface-2">
        <button
          className="w-full py-3 font-grotesk text-sm font-700 tracking-widest text-black rounded-sm sig-gradient hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
          disabled={progress < 100}
        >
          <Icon name="check_circle" size={18} />
          {t.completePM}
        </button>
      </div>
    </div>
  );
};

// ─── Staff Room Grid ──────────────────────────────────────────────────────────
const StaffRoomGrid: React.FC<{ rooms: Room[]; lang: Lang }> = ({ rooms, lang }) => {
  const t = LANG_LABELS[lang];
  const byFloor = Array.from(new Set(rooms.map(r => r.floor))).sort().map(floor => ({
    floor,
    rooms: rooms.filter(r => r.floor === floor),
  }));

  const ready = rooms.filter(r => r.status === RoomStatus.COMPLETED).length;
  const maintenance = rooms.filter(r => r.status === RoomStatus.IN_PROGRESS).length;
  const critical = rooms.filter(r => r.status === RoomStatus.ISSUE_REPORTED).length;
  const occupancy = Math.round((rooms.filter(r => r.housekeepingStatus === 'Occupied' || r.housekeepingStatus === 'Stay Over').length / rooms.length) * 100);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <h2 className="font-grotesk text-base font-700 text-gray-100 uppercase tracking-widest">{t.roomGrid}</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-surface-2 border border-border rounded-sm p-2 text-center">
          <p className="font-grotesk text-xl font-700 text-primary">{ready}</p>
          <p className="text-[8px] font-grotesk text-gray-600 uppercase tracking-widest mt-0.5">{t.ready}</p>
        </div>
        <div className="bg-surface-2 border border-border rounded-sm p-2 text-center">
          <p className="font-grotesk text-xl font-700 text-yellow-400">{String(maintenance).padStart(2,'0')}</p>
          <p className="text-[8px] font-grotesk text-gray-600 uppercase tracking-widest mt-0.5">{t.maint}</p>
        </div>
        <div className="bg-surface-2 border border-border rounded-sm p-2 text-center">
          <p className="font-grotesk text-xl font-700 text-red-400">{String(critical).padStart(2,'0')}</p>
          <p className="text-[8px] font-grotesk text-gray-600 uppercase tracking-widest mt-0.5">{t.critical}</p>
        </div>
        <div className="bg-surface-2 border border-border rounded-sm p-2 text-center">
          <p className="font-grotesk text-xl font-700 text-secondary">{occupancy}%</p>
          <p className="text-[8px] font-grotesk text-gray-600 uppercase tracking-widest mt-0.5">{t.occupancy}</p>
        </div>
      </div>

      {byFloor.map(({ floor, rooms: floorRooms }) => (
        <div key={floor} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-grotesk text-gray-600 uppercase tracking-widest">{t.floor} {String(floor).padStart(2,'0')}</span>
            <div className="flex-1 h-px bg-border"></div>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {floorRooms.map(room => (
              <div
                key={room.id}
                className="bg-surface-2 border border-border rounded-sm p-2 flex flex-col items-center gap-1"
              >
                <span className={`w-2 h-2 rounded-full ${statusColor(room.status)}`}></span>
                <span className="text-[10px] font-grotesk font-600 text-gray-300">{room.number}</span>
                <span className={`text-[8px] font-grotesk ${hkColor(room.housekeepingStatus)} text-center leading-tight`}>
                  {room.housekeepingStatus?.split(' ')[0] || t.ready}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Staff Inventory ──────────────────────────────────────────────────────────
const StaffInventory: React.FC<{ inventory: InventoryItem[]; lang: Lang }> = ({ inventory, lang }) => {
  const t = LANG_LABELS[lang];
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [usage, setUsage] = useState<Record<string, number>>({});
  const categories = ['All', ...Array.from(new Set(inventory.map(i => i.category)))];

  const filtered = inventory.filter(i =>
    (category === 'All' || i.category === category) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const updateUsage = (id: string, delta: number) => {
    setUsage(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 space-y-3 border-b border-border">
        <h2 className="font-grotesk text-base font-700 text-gray-100">{t.partsMaterials}</h2>
        <div className="relative">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            className="input-box pl-9"
            placeholder={t.searchParts}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 px-3 py-1 text-[10px] font-grotesk font-600 rounded-sm transition-all ${
                category === cat
                  ? 'bg-primary text-black'
                  : 'bg-surface-3 text-gray-500 hover:text-gray-300'
              }`}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-20">
        {filtered.map(item => (
          <div key={item.id} className="bg-surface-2 border border-border rounded-sm p-3 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-grotesk font-500 text-gray-200">{item.name}</p>
                <p className="text-[10px] text-gray-600 font-grotesk">{item.category} · {item.vendor.name}</p>
              </div>
              <div className="text-right">
                <p className={`font-grotesk text-sm font-700 ${item.quantity < item.minLevel ? 'text-red-400' : 'text-primary'}`}>
                  {item.quantity}
                </p>
                <p className="text-[9px] text-gray-600 font-grotesk">{item.unit} {t.inStock}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-surface-3 rounded-sm">
                <button
                  onClick={() => updateUsage(item.id, -1)}
                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-primary transition-colors"
                >
                  <Icon name="remove" size={14} />
                </button>
                <span className="text-sm font-grotesk font-700 text-gray-200 w-6 text-center">
                  {usage[item.id] || 0}
                </span>
                <button
                  onClick={() => updateUsage(item.id, 1)}
                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-primary transition-colors"
                >
                  <Icon name="add" size={14} />
                </button>
              </div>
              <span className="text-[10px] text-gray-600 font-grotesk">{t.usedQty}</span>
              <button className="ml-auto text-[10px] font-grotesk text-secondary border border-secondary/30 px-2 py-1 rounded-sm hover:bg-secondary/10 transition-colors">
                {t.reportUsage}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border bg-surface-2">
        <button className="w-full py-3 font-grotesk text-sm font-700 tracking-widest text-black rounded-sm sig-gradient hover:opacity-90 transition-all flex items-center justify-center gap-2">
          <Icon name="send" size={18} />
          {t.submitAllUsage}
        </button>
      </div>
    </div>
  );
};

// ─── Staff Profile ────────────────────────────────────────────────────────────
const StaffProfile: React.FC<{
  user: User;
  lang: Lang;
  setLang: (l: Lang) => void;
  onLogout: () => void;
  onUpdateUser: (u: Partial<User>) => void;
}> = ({ user, lang, setLang, onLogout, onUpdateUser }) => {
  const t = LANG_LABELS[lang];
  return (
  <div className="flex-1 overflow-y-auto p-4 space-y-4">

    {/* Identity card — live-updates as user saves */}
    <div className="bg-surface-2 border border-border rounded-sm p-4 flex items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-surface-3 border-2 border-primary/40 overflow-hidden flex items-center justify-center glow-green shrink-0">
        {user.avatar
          ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          : <Icon name="person" size={28} className="text-gray-500" />
        }
      </div>
      <div className="min-w-0">
        <p className="font-grotesk text-base font-700 text-gray-100 truncate">{user.name}</p>
        <p className="text-[10px] font-grotesk text-primary uppercase tracking-widest mt-0.5">Chief Engineer</p>
        <p className="text-[11px] text-gray-500 font-grotesk mt-0.5 truncate">{MOCK_PROPERTY.name}</p>
      </div>
    </div>

    {/* Profile editor */}
    <div className="bg-surface-2 border border-border rounded-sm p-4 space-y-4">
      <h3 className="font-grotesk text-xs font-600 text-gray-400 uppercase tracking-widest flex items-center gap-2">
        <Icon name="manage_accounts" size={16} className="text-primary" />
        Edit Profile
      </h3>
      <ProfileEditor user={user} onSave={onUpdateUser} lang={lang} />
    </div>

    {/* Security */}
    <div className="bg-surface-2 border border-border rounded-sm p-4 space-y-3">
      <h3 className="font-grotesk text-xs font-600 text-gray-400 uppercase tracking-widest">Security Matrix</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-sm text-gray-300 font-grotesk">Change PIN</span>
          <button className="text-[10px] font-grotesk text-primary border border-primary/30 px-2 py-1 rounded-sm hover:bg-primary/10 transition-colors">Update</button>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-300 font-grotesk">Two-Factor Auth</span>
          <div className="w-10 h-5 bg-surface-3 border border-border rounded-full relative cursor-pointer">
            <div className="w-4 h-4 rounded-full bg-gray-600 absolute top-0.5 left-0.5 transition-all"></div>
          </div>
        </div>
      </div>
    </div>

    {/* Language */}
    <div className="bg-surface-2 border border-border rounded-sm p-4 space-y-3">
      <h3 className="font-grotesk text-xs font-600 text-gray-400 uppercase tracking-widest">Language Interface</h3>
      <div className="grid grid-cols-3 gap-2">
        {(['EN', 'ES', 'HI'] as Lang[]).map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`py-2 font-grotesk text-xs font-600 rounded-sm transition-all ${
              lang === l ? 'sig-gradient text-black' : 'bg-surface-3 border border-border text-gray-500 hover:text-gray-300'
            }`}
          >
            {l === 'EN' ? '🇺🇸 EN' : l === 'ES' ? '🇪🇸 ES' : '🇮🇳 HI'}
          </button>
        ))}
      </div>
    </div>

    <button
      onClick={onLogout}
      className="w-full py-2.5 font-grotesk text-xs font-700 tracking-widest text-red-400 border border-red-400/20 rounded-sm hover:bg-red-400/10 transition-all flex items-center justify-center gap-2"
    >
      <Icon name="logout" size={16} />
      {t.signOut}
    </button>
  </div>
  );
};

// ─── General Staff: Report View ───────────────────────────────────────────────
const GSReportView: React.FC<{
  user: User; lang: Lang; onAddTask: (t: Task) => void;
}> = ({ user, lang, onAddTask }) => {
  const t = LANG_LABELS[lang];
  const [description, setDescription] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setPhotoUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!description.trim()) return;
    onAddTask({
      id: `task-${Date.now()}`,
      description: description.trim(),
      roomNumber: roomNumber.trim() || undefined,
      status: 'PENDING',
      reportedBy: user.name,
      createdAt: new Date().toISOString(),
      priority,
      issuePhotoUrl: photoUrl ?? undefined,
    });
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setDescription(''); setRoomNumber(''); setPriority('MEDIUM'); setPhotoUrl(null);
    }, 2500);
  };

  const priorityColor = (p: string) => p === 'HIGH' ? 'border-red-400 bg-red-400/10 text-red-400' : p === 'MEDIUM' ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' : 'border-gray-500 bg-surface text-gray-400';

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      {submitted ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/40 flex items-center justify-center">
            <Icon name="check_circle" size={36} className="text-primary" />
          </div>
          <p className="font-grotesk text-sm font-700 text-primary uppercase tracking-widest">{t.issueSubmitted}</p>
        </div>
      ) : (
        <>
          {/* Hero CTA */}
          <div className="bg-surface-2 border border-red-400/30 rounded-sm p-5 flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-red-400/10 border border-red-400/30 flex items-center justify-center mb-1">
              <Icon name="report_problem" size={28} className="text-red-400" />
            </div>
            <h2 className="font-grotesk text-base font-700 text-gray-100 uppercase tracking-widest">{t.reportAnIssue}</h2>
            <p className="text-[10px] text-gray-500 font-grotesk">{t.reportSubtitle}</p>
          </div>

          {/* Form */}
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.roomLocation}</label>
              <input
                type="text"
                value={roomNumber}
                onChange={e => setRoomNumber(e.target.value)}
                placeholder="e.g. 402, Lobby, Pool"
                className="w-full bg-surface border border-border rounded-sm px-3 py-2.5 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-orange-400"
              />
            </div>

            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.descriptionLabel}</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the issue in detail…"
                rows={4}
                className="w-full bg-surface border border-border rounded-sm px-3 py-2.5 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-orange-400 resize-none"
              />
            </div>

            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.priorityLabel}</label>
              <div className="flex gap-2">
                {(['LOW', 'MEDIUM', 'HIGH'] as const).map(p => (
                  <button key={p} onClick={() => setPriority(p)}
                    className={`flex-1 py-2 text-[10px] font-grotesk font-700 rounded-sm border transition-colors ${priority === p ? priorityColor(p) : 'border-border bg-surface text-gray-600 hover:border-gray-500'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest block mb-1">{t.photoOptional}</label>
              {photoUrl ? (
                <div className="relative">
                  <img src={photoUrl} alt="issue" className="w-full h-32 object-cover rounded-sm border border-border" />
                  <button onClick={() => setPhotoUrl(null)} className="absolute top-1 right-1 bg-black/60 rounded-sm p-0.5 text-gray-300 hover:text-white">
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className="w-full h-20 border border-dashed border-border rounded-sm flex flex-col items-center justify-center gap-1 text-gray-600 hover:border-orange-400/50 hover:text-orange-400 transition-colors">
                  <Icon name="add_a_photo" size={22} />
                  <span className="text-[9px] font-grotesk uppercase tracking-widest">{t.camera}</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!description.trim()}
              className="w-full py-3 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-grotesk text-sm font-700 uppercase tracking-widest rounded-sm transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="send" size={16} />
              {t.submitIssue}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── General Staff: Room Grid View ────────────────────────────────────────────
const GSRoomGridView: React.FC<{ rooms: Room[]; lang: Lang }> = ({ rooms, lang }) => {
  const t = LANG_LABELS[lang];
  const [selected, setSelected] = useState<Room | null>(null);
  const byFloor = Array.from(new Set(rooms.map(r => r.floor))).sort().map(floor => ({
    floor, rooms: rooms.filter(r => r.floor === floor),
  }));

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <h2 className="font-grotesk text-base font-700 text-gray-100 uppercase tracking-widest">{t.roomGrid}</h2>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: t.ready, val: rooms.filter(r => r.status === RoomStatus.COMPLETED).length, color: 'text-primary' },
          { label: t.maint, val: rooms.filter(r => r.status === RoomStatus.IN_PROGRESS).length, color: 'text-yellow-400' },
          { label: t.critical, val: rooms.filter(r => r.status === RoomStatus.ISSUE_REPORTED).length, color: 'text-red-400' },
          { label: t.occupancy, val: `${Math.round((rooms.filter(r => r.housekeepingStatus === 'Occupied' || r.housekeepingStatus === 'Stay Over').length / rooms.length) * 100)}%`, color: 'text-secondary' },
        ].map(s => (
          <div key={s.label} className="bg-surface-2 border border-border rounded-sm p-2 text-center">
            <p className={`font-grotesk text-xl font-700 ${s.color}`}>{s.val}</p>
            <p className="text-[8px] font-grotesk text-gray-600 uppercase tracking-widest mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {byFloor.map(({ floor, rooms: fr }) => (
        <div key={floor} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-grotesk text-gray-600 uppercase tracking-widest">{t.floor} {String(floor).padStart(2, '0')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {fr.map(room => (
              <button key={room.id} onClick={() => setSelected(room === selected ? null : room)}
                className={`bg-surface-2 border rounded-sm p-2 flex flex-col items-center gap-1 transition-all ${selected?.id === room.id ? 'border-orange-400/60' : 'border-border hover:border-gray-600'}`}>
                <span className={`w-2 h-2 rounded-full ${statusColor(room.status)}`} />
                <span className="text-[10px] font-grotesk font-600 text-gray-300">{room.number}</span>
                <span className={`text-[8px] font-grotesk ${hkColor(room.housekeepingStatus)} text-center leading-tight`}>
                  {room.housekeepingStatus?.split(' ')[0] || t.ready}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {selected && (
        <div className="bg-surface-2 border border-orange-400/30 rounded-sm p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-grotesk text-sm font-700 text-gray-100">{t.room} {selected.number}</span>
            <button onClick={() => setSelected(null)}><Icon name="close" size={16} className="text-gray-600" /></button>
          </div>
          <div className="flex gap-3 text-[10px] font-grotesk">
            <span className={`${hkColor(selected.housekeepingStatus)}`}>{selected.housekeepingStatus}</span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-400">{selected.currentTasks.length} {t.tasks}</span>
          </div>
          {selected.currentTasks.length > 0 && (
            <div className="space-y-1 pt-1">
              {selected.currentTasks.map(task => (
                <div key={task.id} className="flex items-start gap-2 bg-surface border border-border rounded-sm p-2">
                  <Icon name="build" size={12} className="text-yellow-400 mt-0.5 shrink-0" />
                  <span className="text-[10px] font-grotesk text-gray-300">{task.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── General Staff: Logs View ─────────────────────────────────────────────────
const GSLogsView: React.FC<{ tasks: Task[]; lang: Lang }> = ({ tasks, lang }) => {
  const t = LANG_LABELS[lang];
  const [filter, setFilter] = useState('');

  const filtered = tasks.filter(tk =>
    !filter.trim() || tk.roomNumber?.toLowerCase().includes(filter.toLowerCase()) || tk.description.toLowerCase().includes(filter.toLowerCase())
  );

  const statusIcon = (s: string) => {
    if (s === 'COMPLETED') return <Icon name="check_circle" size={14} className="text-primary shrink-0" />;
    if (s === 'IN_PROGRESS') return <Icon name="autorenew" size={14} className="text-yellow-400 shrink-0" />;
    if (s === 'AWAITING_REVIEW') return <Icon name="hourglass_top" size={14} className="text-secondary shrink-0" />;
    return <Icon name="radio_button_unchecked" size={14} className="text-gray-500 shrink-0" />;
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <h2 className="font-grotesk text-base font-700 text-gray-100 uppercase tracking-widest">{t.roomLogs}</h2>
      <div className="relative">
        <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={t.filterByRoom}
          className="w-full bg-surface border border-border rounded-sm pl-8 pr-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-orange-400"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-gray-600">
          <Icon name="history" size={32} />
          <p className="text-[10px] font-grotesk uppercase tracking-widest">{t.noLogs}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => (
            <div key={task.id} className="bg-surface-2 border border-border rounded-sm p-3 space-y-1.5">
              <div className="flex items-start gap-2">
                {statusIcon(task.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-grotesk text-gray-200 leading-snug">{task.description}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {task.roomNumber && (
                      <span className="text-[9px] font-grotesk text-orange-400 bg-orange-400/10 border border-orange-400/20 px-1.5 py-0.5 rounded-sm">{t.room} {task.roomNumber}</span>
                    )}
                    <span className={`text-[9px] font-grotesk uppercase ${task.priority === 'HIGH' ? 'text-red-400' : task.priority === 'MEDIUM' ? 'text-yellow-400' : 'text-gray-500'}`}>{task.priority}</span>
                    <span className="text-[9px] font-grotesk text-gray-600">{t.by} {task.reportedBy}</span>
                  </div>
                </div>
              </div>
              <p className="text-[8px] font-grotesk text-gray-700 pl-5">{new Date(task.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── General Staff: Schedule View ─────────────────────────────────────────────
const GSScheduleView: React.FC<{ lang: Lang; propertyId: string }> = ({ lang, propertyId }) => {
  const t = LANG_LABELS[lang];
  const [techs, setTechs] = useState<User[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const all = snap.docs.map(d => d.data() as User);
      setTechs(all.filter(u => u.role === UserRole.MAINTENANCE && (u.propertyId === propertyId || u.propertyIds?.includes(propertyId))));
    });
    return () => unsub();
  }, [propertyId]);

  const hour = new Date().getHours();
  const shiftLabel = hour >= 6 && hour < 14 ? 'Morning (6AM–2PM)' : hour >= 14 && hour < 22 ? 'Afternoon (2PM–10PM)' : 'Night (10PM–6AM)';

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <h2 className="font-grotesk text-base font-700 text-gray-100 uppercase tracking-widest">{t.scheduleView}</h2>

      <div className="bg-surface-2 border border-orange-400/20 rounded-sm p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-orange-400/10 border border-orange-400/30 flex items-center justify-center shrink-0">
          <Icon name="schedule" size={16} className="text-orange-400" />
        </div>
        <div>
          <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest">{t.currentShift}</p>
          <p className="text-sm font-grotesk font-700 text-gray-100">{shiftLabel}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest">{t.onDutyTech}</p>
        {techs.length === 0 ? (
          <div className="bg-surface-2 border border-border rounded-sm p-6 flex flex-col items-center gap-2 text-gray-600">
            <Icon name="engineering" size={28} />
            <p className="text-[10px] font-grotesk uppercase tracking-widest">{t.noTechOnDuty}</p>
          </div>
        ) : (
          techs.map(tech => (
            <div key={tech.id} className="bg-surface-2 border border-border rounded-sm p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary/10 border border-secondary/30 flex items-center justify-center shrink-0">
                  {tech.avatar ? (
                    <img src={tech.avatar} alt={tech.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <Icon name="engineering" size={20} className="text-secondary" />
                  )}
                </div>
                <div>
                  <p className="font-grotesk text-sm font-700 text-gray-100">{tech.name}</p>
                  <p className="text-[9px] font-grotesk text-secondary uppercase tracking-widest">{tech.role}</p>
                </div>
                <span className="ml-auto flex items-center gap-1 text-[9px] font-grotesk text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                  {t.online}
                </span>
              </div>
              <div className="space-y-1.5 border-t border-border pt-2">
                <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest">{t.contactLabel}</p>
                {tech.phone && (
                  <a href={`tel:${tech.phone}`} className="flex items-center gap-2 text-[11px] font-grotesk text-secondary hover:text-secondary/80 transition-colors">
                    <Icon name="phone" size={13} />
                    {tech.phone}
                  </a>
                )}
                {tech.email && (
                  <a href={`mailto:${tech.email}`} className="flex items-center gap-2 text-[11px] font-grotesk text-gray-400 hover:text-gray-200 transition-colors">
                    <Icon name="mail" size={13} />
                    {tech.email}
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─── General Staff: Chat View ─────────────────────────────────────────────────
const LANG_CODES: Record<Lang, string> = { EN: 'en', ES: 'es', HI: 'hi' };

const translateText = async (text: string, fromLang: string, toLang: string): Promise<string> => {
  if (fromLang === toLang) return text;
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`);
    const data = await res.json();
    return data.responseData?.translatedText || text;
  } catch {
    return text;
  }
};

const GSChatView: React.FC<{ user: User; lang: Lang; tasks: Task[] }> = ({ user, lang, tasks }) => {
  const t = LANG_LABELS[lang];
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLang, setChatLang] = useState<Lang>(lang);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [translating, setTranslating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeTasks = tasks.filter(tk => tk.status !== 'COMPLETED');

  useEffect(() => {
    if (!selectedTaskId) return;
    const unsub = onSnapshot(collection(db, 'messages', selectedTaskId, 'thread'), snap => {
      const msgs = snap.docs.map(d => d.data() as ChatMessage).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      setMessages(msgs);
    });
    return () => unsub();
  }, [selectedTaskId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedTaskId) return;
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      taskId: selectedTaskId,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      content: input.trim(),
      originalContent: input.trim(),
      originalLang: LANG_CODES[chatLang],
      timestamp: new Date().toISOString(),
    };
    setInput('');
    try {
      await setDoc(doc(db, 'messages', selectedTaskId, 'thread', msg.id), msg);
    } catch {
      setMessages(prev => [...prev, msg]);
    }
  };

  const displayContent = useCallback(async (msg: ChatMessage): Promise<string> => {
    if (!autoTranslate || msg.originalLang === LANG_CODES[chatLang]) return msg.content;
    setTranslating(true);
    const translated = await translateText(msg.content, msg.originalLang, LANG_CODES[chatLang]);
    setTranslating(false);
    return translated;
  }, [autoTranslate, chatLang]);

  const [displayedMessages, setDisplayedMessages] = useState<{ id: string; content: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(messages.map(async m => ({ id: m.id, content: await displayContent(m) }))).then(result => {
      if (!cancelled) setDisplayedMessages(result);
    });
    return () => { cancelled = true; };
  }, [messages, displayContent]);

  if (!selectedTaskId) {
    return (
      <div className="flex-1 flex flex-col p-4 gap-3">
        <h2 className="font-grotesk text-base font-700 text-gray-100 uppercase tracking-widest">{t.chatWithTech}</h2>
        {activeTasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-600">
            <Icon name="chat_bubble_outline" size={32} />
            <p className="text-[10px] font-grotesk uppercase tracking-widest">{t.noTasksToChat}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest">{t.selectTaskToChat}</p>
            {activeTasks.map(tk => (
              <button key={tk.id} onClick={() => setSelectedTaskId(tk.id)}
                className="w-full bg-surface-2 border border-border hover:border-orange-400/40 rounded-sm p-3 text-left space-y-1 transition-colors">
                <div className="flex items-start gap-2">
                  <Icon name="report_problem" size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-grotesk text-gray-200 leading-snug">{tk.description}</p>
                </div>
                {tk.roomNumber && <p className="text-[9px] font-grotesk text-orange-400 pl-5">{t.room} {tk.roomNumber}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const task = tasks.find(tk => tk.id === selectedTaskId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Chat header */}
      <div className="shrink-0 border-b border-border bg-surface-2/80 px-4 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedTaskId(null)} className="text-gray-500 hover:text-gray-300 transition-colors">
            <Icon name="arrow_back" size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-grotesk text-gray-200 truncate">{task?.description}</p>
            {task?.roomNumber && <p className="text-[9px] font-grotesk text-orange-400">{t.room} {task.roomNumber}</p>}
          </div>
        </div>
        {/* Language controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-grotesk text-gray-500 uppercase tracking-widest">{t.myLang}</span>
            <div className="flex items-center gap-0.5 bg-surface-3 border border-border rounded-sm p-0.5">
              {(['EN', 'ES', 'HI'] as Lang[]).map(l => (
                <button key={l} onClick={() => setChatLang(l)}
                  className={`px-1.5 py-0.5 text-[9px] font-grotesk font-600 rounded-sm transition-all ${chatLang === l ? 'bg-orange-500 text-black' : 'text-gray-500 hover:text-gray-300'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setAutoTranslate(p => !p)}
            className={`flex items-center gap-1 text-[9px] font-grotesk uppercase tracking-widest transition-colors ${autoTranslate ? 'text-orange-400' : 'text-gray-600'}`}>
            <Icon name="translate" size={12} />
            {t.translateMessages}
          </button>
          {translating && <span className="text-[9px] font-grotesk text-gray-600 italic">{t.translating}</span>}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {displayedMessages.map((dm, i) => {
          const msg = messages[i];
          if (!msg) return null;
          const isMe = msg.senderId === user.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] space-y-0.5`}>
                <p className={`text-[9px] font-grotesk text-gray-600 ${isMe ? 'text-right' : ''}`}>
                  {isMe ? t.you : `${msg.senderName} · ${t.tech}`}
                </p>
                <div className={`px-3 py-2 rounded-sm text-[11px] font-grotesk leading-snug ${isMe ? 'bg-orange-500/20 border border-orange-500/30 text-gray-100 rounded-tr-none' : 'bg-surface-2 border border-border text-gray-200 rounded-tl-none'}`}>
                  {dm.content}
                </div>
                <p className={`text-[8px] font-grotesk text-gray-700 ${isMe ? 'text-right' : ''}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border bg-surface-2/80 p-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder={t.typeMessage}
          className="flex-1 bg-surface border border-border rounded-sm px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-orange-400"
        />
        <button onClick={sendMessage} disabled={!input.trim()}
          className="px-3 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-black rounded-sm transition-colors">
          <Icon name="send" size={16} />
        </button>
      </div>
    </div>
  );
};

// ─── General Staff: AI Assistant View ────────────────────────────────────────
type AssistantMsg = { role: 'user' | 'assistant'; content: string };

const ANTHROPIC_SYSTEM_PROMPT = `You are FyxBot, an expert hotel maintenance assistant for Fyxinn property management. You help hotel staff (housekeeping, front desk, kitchen) troubleshoot and handle maintenance issues quickly.

Your role:
- Give concise, actionable troubleshooting steps for common hotel maintenance issues (plumbing, HVAC, electrical, locks, appliances, etc.)
- Always prioritize guest safety — if there is any safety risk, tell staff to evacuate and contact maintenance immediately
- Keep answers brief and practical — staff are on the floor and need fast guidance
- If an issue is beyond basic troubleshooting, advise staff to use the Report Issue tab so a maintenance tech can respond
- Be friendly and professional
- If asked in Spanish or Hindi, respond in the same language

Common issues you handle: running toilets, leaky faucets, clogged drains, AC/heating problems, flickering lights, tripped circuit breakers, GFCI outlets, smoke alarms, door locks/key cards, stuck windows, broken blinds, and general appliance issues.`;

const GSAssistantView: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = LANG_LABELS[lang];
  const [messages, setMessages] = useState<AssistantMsg[]>([
    { role: 'assistant', content: t.assistantWelcome },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [apiConfigured] = useState(() => {
    const key = import.meta.env.VITE_ANTHROPIC_API_KEY;
    return key && key !== 'your_anthropic_api_key_here';
  });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || thinking || streaming) return;
    const userMsg = input.trim();
    setInput('');
    const history = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(history);
    setThinking(true);

    if (!apiConfigured) {
      await new Promise(r => setTimeout(r, 500));
      setThinking(false);
      setMessages(prev => [...prev, { role: 'assistant', content: 'AI assistant is not configured yet. Please add your Anthropic API key to the .env file (VITE_ANTHROPIC_API_KEY) and rebuild the app.' }]);
      return;
    }

    try {
      const client = new Anthropic({
        apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
        dangerouslyAllowBrowser: true,
      });

      const apiMessages = history
        .filter(m => m.content !== t.assistantWelcome)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      setThinking(false);
      setStreaming(true);
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const stream = await client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: ANTHROPIC_SYSTEM_PROMPT,
        messages: apiMessages,
      });

      let fullText = '';
      for await (const chunk of stream.textStream) {
        fullText += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: fullText };
          return updated;
        });
      }
    } catch (err) {
      setThinking(false);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble connecting. Please check your network and try again, or use the Report Issue tab.' }]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-surface-2/80 px-4 py-2 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-cyan-400/30 bg-surface">
          <img src={aiBotImage} alt="FyxBot" className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="text-[12px] font-grotesk font-bold text-gray-100">FyxBot</p>
          <p className="text-[9px] font-grotesk text-cyan-400 uppercase tracking-widest">{apiConfigured ? t.online : 'Offline — API key needed'}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-cyan-400/30 bg-surface mt-0.5">
                <img src={aiBotImage} alt="FyxBot" className="w-full h-full object-cover" />
              </div>
            )}
            <div className={`max-w-[78%] px-3 py-2 rounded-lg text-[12px] font-grotesk leading-relaxed ${
              msg.role === 'user'
                ? 'bg-orange-500/20 border border-orange-500/30 text-gray-100 rounded-tr-none'
                : 'bg-surface-2 border border-border text-gray-200 rounded-tl-none'
            }`}>
              {msg.content || (streaming && i === messages.length - 1 && (
                <span className="flex gap-1 py-0.5">
                  {[0,1,2].map(j => (
                    <span key={j} className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: `${j * 150}ms` }} />
                  ))}
                </span>
              ))}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start items-center gap-2">
            <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-cyan-400/30 bg-surface">
              <img src={aiBotImage} alt="FyxBot" className="w-full h-full object-cover" />
            </div>
            <div className="bg-surface-2 border border-border rounded-lg rounded-tl-none px-3 py-2 flex gap-1">
              {[0,1,2].map(i => (
                <span key={i} className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border bg-surface-2/80 p-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={t.typeYourQuestion}
          className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-200 font-grotesk placeholder-gray-600 focus:outline-none focus:border-cyan-400"
        />
        <button onClick={send} disabled={!input.trim() || thinking || streaming}
          className="px-3 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black rounded-lg transition-colors">
          <Icon name="send" size={16} />
        </button>
      </div>
    </div>
  );
};

// ─── General Staff Portal ─────────────────────────────────────────────────────
const GeneralStaffPortal: React.FC<{
  user: User; onLogout: () => void; lang: Lang; setLang: (l: Lang) => void;
  tasks: Task[]; onAddTask: (t: Task) => void;
}> = ({ user, onLogout, lang, setLang, tasks, onAddTask }) => {
  const [view, setView] = useState<GeneralStaffView>('report');
  const [rooms] = useState<Room[]>(() => generateRooms(MOCK_PROPERTY));
  const t = LANG_LABELS[lang];
  const hasOpenRepair = tasks.some(task => task.status === 'PENDING' || task.status === 'IN_PROGRESS');

  const navItems: { view: GeneralStaffView; icon: string; label: string }[] = [
    { view: 'report', icon: 'report_problem', label: t.reportAnIssue.split(' ')[0] },
    { view: 'roomgrid', icon: 'meeting_room', label: t.roomGrid },
    { view: 'logs', icon: 'history', label: t.roomLogs.split(' ')[0] },
    { view: 'schedule', icon: 'engineering', label: t.scheduleView },
    { view: 'chat', icon: 'chat', label: t.chatWithTech.split(' ')[0] },
    // FyxBot is only available while a repair is open
    ...(hasOpenRepair ? [{ view: 'assistant' as GeneralStaffView, icon: '', label: 'FyxBot' }] : []),
  ];

  useEffect(() => {
    if (view === 'assistant' && !hasOpenRepair) setView('report');
  }, [view, hasOpenRepair]);

  return (
    <div className="flex flex-col h-[100dvh] bg-surface overflow-hidden blueprint-bg">
      {/* Header */}
      <div className="h-12 border-b border-border bg-surface-2/80 flex items-center justify-between px-4 shrink-0">
        <img src={logoHorizontal} alt="Fyxinn" className="h-7 object-contain" style={{ filter: 'drop-shadow(0 0 6px rgba(251,146,60,0.3))' }} />
        <div className="flex items-center gap-2">
          <span className="hidden sm:block text-[9px] font-grotesk text-orange-400 border border-orange-400/30 bg-orange-400/5 px-2 py-0.5 rounded-sm uppercase tracking-widest">{user.role}</span>
          <ThemeToggle />
          <LangSwitcher lang={lang} onChange={setLang} />
          <button onClick={onLogout} className="text-gray-600 hover:text-gray-300 transition-colors ml-1">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {view === 'report' && <GSReportView user={user} lang={lang} onAddTask={onAddTask} />}
        {view === 'roomgrid' && <GSRoomGridView rooms={rooms} lang={lang} />}
        {view === 'logs' && <GSLogsView tasks={tasks} lang={lang} />}
        {view === 'schedule' && <GSScheduleView lang={lang} propertyId={user.propertyId} />}
        {view === 'chat' && <GSChatView user={user} lang={lang} tasks={tasks} />}
        {view === 'assistant' && <GSAssistantView lang={lang} />}
      </div>

      {/* Bottom nav */}
      <nav className="h-14 border-t border-border bg-surface-2/90 flex items-center justify-around shrink-0">
        {navItems.map(item => (
          <button key={item.view} onClick={() => setView(item.view)}
            className={`flex flex-col items-center gap-0.5 px-1 py-1 rounded-sm transition-all ${view === item.view ? 'text-orange-400' : 'text-gray-600 hover:text-gray-400'}`}>
            {item.view === 'assistant' ? (
              <div className={`w-6 h-6 rounded-full overflow-hidden border-2 transition-all ${view === 'assistant' ? 'border-cyan-400' : 'border-gray-600'}`}>
                <img src={aiBotImage} alt="FyxBot" className="w-full h-full object-cover" />
              </div>
            ) : (
              <Icon name={item.icon} size={20} filled={view === item.view} />
            )}
            <span className="text-[7px] font-grotesk uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

// ─── Staff Portal ─────────────────────────────────────────────────────────────
const StaffPortal: React.FC<{
  user: User; onLogout: () => void; lang: Lang; setLang: (l: Lang) => void;
  tasks: Task[]; onAddTask: (task: Task) => void; onUpdateTask: (task: Task) => void;
  onUpdateUser: (u: Partial<User>) => void;
}> = ({ user, onLogout, lang, setLang, tasks, onAddTask, onUpdateTask, onUpdateUser }) => {
  const [view, setView] = useState<StaffView>('dashboard');
  const [showReportModal, setShowReportModal] = useState(false);
  const [rooms] = useState<Room[]>(() => generateRooms(MOCK_PROPERTY));
  const [inventory] = useState<InventoryItem[]>(MOCK_INVENTORY);
  const t = LANG_LABELS[lang];

  const navItems: { view: StaffView; icon: string; label: string }[] = [
    { view: 'dashboard', icon: 'dashboard', label: t.dashboard },
    { view: 'myjobs', icon: 'work', label: t.myJobs },
    { view: 'checklist', icon: 'checklist', label: 'PM' },
    { view: 'roomgrid', icon: 'meeting_room', label: t.roomGrid },
    { view: 'inventory', icon: 'inventory_2', label: t.inventory },
    { view: 'profile', icon: 'person', label: t.profile },
  ];

  return (
    <div className="flex flex-col h-[100dvh] bg-surface overflow-hidden blueprint-bg">
      {/* Header */}
      <div className="h-12 border-b border-border bg-surface-2/80 flex items-center justify-between px-4 shrink-0">
        <img src={logoHorizontal} alt="Fyxinn" className="h-7 object-contain" style={{ filter: 'drop-shadow(0 0 6px rgba(88,226,31,0.3))' }} />
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-1.5 text-[10px] font-grotesk font-600 text-red-400 border border-red-400/30 bg-red-400/5 hover:bg-red-400/15 hover:border-red-400/60 px-2.5 py-1.5 rounded-sm transition-all"
          >
            <Icon name="report_problem" size={14} />
            <span className="hidden sm:inline">Report Issue</span>
          </button>
          <ThemeToggle />
          <LangSwitcher lang={lang} onChange={setLang} />
          <button className="relative text-gray-600 hover:text-gray-300 transition-colors">
            <Icon name="notifications" size={20} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500"></span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {view === 'dashboard' && <StaffDashboard user={user} onNav={setView} lang={lang} onReportIssue={() => setShowReportModal(true)} tasks={tasks} />}
        {view === 'myjobs' && <StaffMyJobs user={user} tasks={tasks} onUpdateTask={onUpdateTask} lang={lang} />}
        {view === 'checklist' && <StaffChecklist lang={lang} />}
        {view === 'roomgrid' && <StaffRoomGrid rooms={rooms} lang={lang} />}
        {view === 'inventory' && <StaffInventory inventory={inventory} lang={lang} />}
        {view === 'profile' && <StaffProfile user={user} lang={lang} setLang={setLang} onLogout={onLogout} onUpdateUser={onUpdateUser} />}
      </div>

      {/* Bottom nav */}
      <nav className="h-14 border-t border-border bg-surface-2/90 flex items-center justify-around shrink-0">
        {navItems.map(item => (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-sm transition-all ${
              view === item.view ? 'text-primary' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            <Icon name={item.icon} size={20} filled={view === item.view} />
            <span className="text-[8px] font-grotesk uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>

      {showReportModal && (
        <ReportIssueModal user={user} onSubmit={task => { onAddTask(task); setView('myjobs'); }} onClose={() => setShowReportModal(false)} lang={lang} />
      )}
    </div>
  );
};

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [portal, setPortal] = useState<Portal>('select');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lang, setLang] = useState<Lang>('EN');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [properties, setProperties] = useState<Property[]>([MOCK_PROPERTY]);
  const [authLoading, setAuthLoading] = useState(true);

  // Restore session on page load and listen for auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          const userData = snap.data() as User;
          setCurrentUser(userData);
          setPortal(userData.role === UserRole.ADMIN ? 'admin' : userData.role === UserRole.GENERAL_STAFF ? 'general-staff' : 'staff');
        }
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listener for properties
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'properties'), (snap) => {
      if (!snap.empty) {
        setProperties(snap.docs.map(d => ({ ...d.data(), id: d.id } as Property)));
      }
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listener for tasks
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tasks'), (snap) => {
      const loaded = snap.docs.map(d => ({ ...d.data(), id: d.id } as Task));
      setTasks(loaded.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });
    return () => unsub();
  }, []);

  const handleAdminLogin = (user: User) => { setCurrentUser(user); setPortal('admin'); };
  const handleStaffLogin = (user: User) => { setCurrentUser(user); setPortal('staff'); };
  const handleGeneralStaffLogin = (user: User) => { setCurrentUser(user); setPortal('general-staff'); };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setPortal('select');
  };

  const handleAddTask = async (task: Task) => {
    setTasks(prev => [task, ...prev]);
    try { await setDoc(doc(db, 'tasks', task.id), task); } catch { /* offline — local state already updated */ }
  };

  const handleUpdateTask = async (updated: Task) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    try { await updateDoc(doc(db, 'tasks', updated.id), { ...updated }); } catch { /* offline */ }
  };

  const handleUpdateUser = async (updates: Partial<User>) => {
    setCurrentUser(prev => prev ? { ...prev, ...updates } : prev);
    if (currentUser?.id) {
      try { await updateDoc(doc(db, 'users', currentUser.id), updates as Record<string, unknown>); } catch { /* offline */ }
    }
  };

  const reportPropertySaveError = (err: unknown) => {
    console.error('Property save failed:', err);
    alert('Hotel settings could not be saved to the server. Make sure you are online and your account role is Admin or Maintenance, then try again.');
  };

  const handleAddProperty = async (p: Property) => {
    setProperties(prev => [...prev, p]);
    try { await setDoc(doc(db, 'properties', p.id), p); } catch (err) { reportPropertySaveError(err); }
  };

  const handleUpdateProperty = async (updated: Property) => {
    setProperties(prev => prev.map(p => p.id === updated.id ? updated : p));
    // setDoc+merge (not updateDoc) so locally-seeded properties get created on first save
    try { await setDoc(doc(db, 'properties', updated.id), { ...updated }, { merge: true }); } catch (err) { reportPropertySaveError(err); }
  };

  const handleDeleteProperty = async (id: string) => {
    setProperties(prev => prev.filter(p => p.id !== id));
    try { await deleteDoc(doc(db, 'properties', id)); } catch (err) { reportPropertySaveError(err); }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen blueprint-bg flex items-center justify-center">
        <Icon name="autorenew" size={36} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {portal === 'select' && <PortalSelect onSelect={setPortal} lang={lang} setLang={setLang} />}
      {portal === 'admin-login' && (
        <AdminLogin onLogin={handleAdminLogin} onBack={() => setPortal('select')} lang={lang} setLang={setLang} properties={properties} />
      )}
      {portal === 'staff-login' && (
        <StaffLogin onLogin={handleStaffLogin} onBack={() => setPortal('select')} lang={lang} setLang={setLang} properties={properties} />
      )}
      {portal === 'general-staff-login' && (
        <GeneralStaffLogin onLogin={handleGeneralStaffLogin} onBack={() => setPortal('select')} lang={lang} setLang={setLang} properties={properties} />
      )}
      {portal === 'admin' && currentUser && (
        <AdminPortal
          user={currentUser} onLogout={handleLogout} lang={lang} setLang={setLang}
          tasks={tasks} onAddTask={handleAddTask} onUpdateTask={handleUpdateTask} onUpdateUser={handleUpdateUser}
          properties={properties} onAddProperty={handleAddProperty} onUpdateProperty={handleUpdateProperty} onDeleteProperty={handleDeleteProperty}
        />
      )}
      {portal === 'staff' && currentUser && (
        <StayFykedPortal
          user={currentUser}
          onLogout={handleLogout}
          tasks={tasks}
          properties={properties}
          rooms={[]}
          onAddTask={handleAddTask}
          onUpdateUser={handleUpdateUser}
          onAddProperty={handleAddProperty}
          onUpdateProperty={handleUpdateProperty}
          onDeleteProperty={handleDeleteProperty}
        />
      )}
      {portal === 'general-staff' && currentUser && (
        <GeneralStaffPortal user={currentUser} onLogout={handleLogout} lang={lang} setLang={setLang} tasks={tasks} onAddTask={handleAddTask} />
      )}
    </>
  );
}
