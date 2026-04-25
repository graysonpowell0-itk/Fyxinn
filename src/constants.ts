
import { Room, RoomStatus, User, UserRole, CalendarEvent, InventoryItem, Property } from './types';

export const PM_CHECKLIST_DATA = {
  "Entry & Threshold": [
    "Door and door frame condition",
    "Frame silencers, smoke seal, fire strips, sweeps, doorstop",
    "Closure operation (latches at 8\" and 30\")",
    "Deadbolt/night-latch operation",
    "Knob, strike plate and hinges",
    "Lock (operation, battery, Bluetooth/Digital Key)",
    "Room number, evacuation plaque, viewer/cover",
    "Threshold floor tile/carpet and baseboard",
    "Wall and ceiling finish",
    "Hallway light (Kelvin/LED check)"
  ],
  "Connecting Doors & Closet": [
    "Connecting door seals, locks, hinges",
    "Closet wall, ceiling, floor finish",
    "Closet door frame, tracks, silencers",
    "Closet light operation",
    "Rod, rod hook and shelf condition",
    "Iron board/steamer holder and luggage rack",
    "Safe (operation and annual battery replacement)"
  ],
  "Bathroom": [
    "Ceiling, wall paint/vinyl, floor tile and grout",
    "Exhaust fan or vent (clean grille/duct)",
    "GFCI outlet test and light switches",
    "Hot water temp test (122°F - 126°F)",
    "Bathroom door, frame, lock and hinges (lubricate)",
    "Shower/Tub surface (anti-slip) and tile/grout",
    "Caulk (shower/tub, vanity, toilet)",
    "Drain and overflow (clean and treat)",
    "Shower head, arm and escutcheon (sanitize)",
    "Soap dish and bulk amenities brackets",
    "Toilet flush, water level, and leak test",
    "Toilet seat tightness and slow-close check",
    "Vanity sink, faucet, aerator and P-trap",
    "Mirror condition and demister check",
    "Makeup mirror and bathroom lighting"
  ],
  "Bedroom Area": [
    "Ceiling, walls, baseboard and crown molding",
    "Carpet/Floor condition (stains, frays, tightness)",
    "Window treatment/drapes (pull rods, blackout check)",
    "Nightstands and drawer operation",
    "Lamps and shades (color, wattage, cord management)",
    "Telephone (room number decal and cord mgmt)",
    "Time clock/radio (time accuracy and battery)",
    "Bed, bedframe and headboard security",
    "Desk, chair and high-speed internet signal",
    "Lounge chair, sofa, ottoman and coffee table",
    "TV cabinet/dresser, mount security",
    "TV picture quality, menu and remote function",
    "Wet bar appliances (fridge, microwave, coffee maker)"
  ],
  "HVAC System": [
    "Exterior cover/access panel and grilles",
    "Interior cabinet vacuum and insulation check",
    "Electrical wires and ELCB/RCCB test",
    "Fan assembly cleaning and motor lubrication",
    "Cooling/Heating coil sanitation",
    "Replace air filter (Merv 8) and date filter",
    "Condensation drain pan cleaning and drain tabs",
    "Float switch and actuator operation",
    "Thermostat sequence (Cooling/Heating/Dehum)",
    "Supply/Return air temperature delta test"
  ],
  "Fire, Life & Safety": [
    "ADA devices presence check",
    "Smoke/Heat detector test and annual battery",
    "Speaker and strobe presence",
    "Sprinkler head (clean, no paint, cage check)",
    "Carbon Monoxide detector test",
    "Refrigerant monitor device test"
  ]
};

export const INITIAL_PROPERTIES: Property[] = [];

export const INITIAL_USERS: User[] = [];

export const MOCK_CALENDAR_EVENTS: CalendarEvent[] = [];

export const MOCK_INVENTORY: InventoryItem[] = [
  { 
    id: 'i1', 
    name: 'Air Filter (MERV 8)', 
    category: 'HVAC', 
    quantity: 12, 
    unit: 'ea', 
    minLevel: 20, 
    vendor: { name: 'Grainger', contact: '555-9988', website: 'grainger.com' },
    lastUpdated: '2025-04-10',
    propertyId: 'prop-1'
  },
  { 
    id: 'i2', 
    name: 'LED Bulb A19 (Warm White)', 
    category: 'Lighting', 
    quantity: 45, 
    unit: 'box', 
    minLevel: 10, 
    vendor: { name: 'Home Depot Pro', contact: 'Account Rep #442', website: 'homedepot.com' },
    lastUpdated: '2025-04-12',
    propertyId: 'prop-1'
  },
  { 
    id: 'i3', 
    name: 'White Lithium Grease', 
    category: 'General', 
    quantity: 5, 
    unit: 'can', 
    minLevel: 2, 
    vendor: { name: 'Local Hardware', contact: '555-1234' },
    lastUpdated: '2025-03-20',
    propertyId: 'prop-1'
  },
  { 
    id: 'i4', 
    name: 'Shower Cartridge (Moen)', 
    category: 'Plumbing', 
    quantity: 3, 
    unit: 'ea', 
    minLevel: 5, 
    vendor: { name: 'Ferguson', contact: 'support@ferguson.com', website: 'ferguson.com' },
    lastUpdated: '2025-04-01',
    propertyId: 'prop-1'
  },
];

const createRoom = (floor: number, roomNumber: string, propertyId: string = 'prop-1', status: RoomStatus = RoomStatus.COMPLETED): Room => ({
  id: `${propertyId}-room-${roomNumber.replace(/\s+/g, '-').toLowerCase()}`,
  number: roomNumber,
  floor,
  status,
  housekeepingStatus: 'Vacant',
  pmActive: false,
  pmCompleted: false,
  currentTasks: [],
  logs: [],
  pmChecklistState: {},
  propertyId
});

const generateFloorRooms = (floor: number, start: number, end: number, propertyId: string) => {
  const rooms: Room[] = [];
  for (let i = start; i <= end; i++) {
    rooms.push(createRoom(floor, i.toString(), propertyId));
  }
  return rooms;
};

export const INITIAL_ROOMS: Room[] = [
  // Floor 1: 109 - 132 + Common Areas
  ...generateFloorRooms(1, 109, 132, 'prop-1'),
  createRoom(1, "Laundry", 'prop-1'),
  createRoom(1, "Kitchen", 'prop-1'),
  createRoom(1, "Office", 'prop-1'),
  createRoom(1, "Gym", 'prop-1'),
  createRoom(1, "1st Floor Corridor", 'prop-1'),

  // Floor 2: 202 - 233
  ...generateFloorRooms(2, 202, 233, 'prop-1'),
  createRoom(2, "2nd Floor Corridor", 'prop-1'),

  // Floor 3: 302 - 333
  ...generateFloorRooms(3, 302, 333, 'prop-1'),
  createRoom(3, "3rd Floor Corridor", 'prop-1'),
];
