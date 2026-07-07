import React, { useState } from 'react';
import { User, Task, Property, Room } from '../../types';
import { PropertyDashboard } from './PropertyDashboard';
import { RoomGrid } from './RoomGrid';
import { MaintenanceSchedule } from './MaintenanceSchedule';
import { DocumentRepair } from './DocumentRepair';
import { PMChecklist } from './PMChecklist';
import { ProfileSettings } from './ProfileSettings';
import { FyxBotChat } from './FyxBotChat';
import logo from '../../assets/Fyxinn_glow_logo.png';
import { generateRooms, MOCK_PROPERTY } from '../../App';

interface Props {
  user: User;
  onLogout: () => void;
  tasks: Task[];
  properties: Property[];
  rooms?: Room[]; // Optional since we can generate them
  onAddTask: (task: Task) => void;
  onUpdateUser: (updates: Partial<User>) => void;
  onAddProperty: (p: Property) => void;
  onUpdateProperty: (p: Property) => void;
  onDeleteProperty: (id: string) => void;
}

type View = 'dashboard' | 'checklist' | 'repair' | 'schedule' | 'roomgrid' | 'profile';

const NAV_ITEMS: { view: View; icon: string; label: string }[] = [
  { view: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { view: 'checklist', icon: 'fact_check', label: 'Checklist' },
  { view: 'repair', icon: 'build', label: 'Repair' },
  { view: 'schedule', icon: 'calendar_month', label: 'Schedule' },
  { view: 'profile', icon: 'manage_accounts', label: 'Profile' },
];

export const StayFykedPortal: React.FC<Props> = ({
  user, onLogout, tasks, properties, rooms: initialRooms, onAddTask,
  onUpdateUser, onAddProperty, onUpdateProperty, onDeleteProperty,
}) => {
  const [view, setView] = useState<View>('dashboard');
  const [rooms] = useState<Room[]>(() => initialRooms && initialRooms.length > 0 ? initialRooms : generateRooms(MOCK_PROPERTY));

  const openRepairs = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS');

  return (
    <div className="flex flex-col h-[100dvh] bg-surface text-on-surface overflow-hidden">
      {/* TopAppBar */}
      <header className="relative z-20 flex justify-between items-center px-6 h-16 bg-neutral-950/80 backdrop-blur-md border-b border-white/10 shrink-0">
        <img src={logo} alt="Fyxinn" className="h-8 w-auto object-contain" />
        <div className="flex items-center gap-3">
          <button onClick={onLogout} className="text-gray-400 hover:text-gray-200 transition-colors" title="Log out">
            <span className="material-symbols-outlined">logout</span>
          </button>
          <button
            onClick={() => setView('profile')}
            title="Profile settings"
            className={`w-8 h-8 rounded-full overflow-hidden border transition-all ${view === 'profile' ? 'border-[#58E21F] shadow-[0_0_8px_rgba(88,226,31,0.5)]' : 'border-primary-fixed'}`}
          >
            {user.avatar
              ? <img src={user.avatar} alt="User Profile" className="w-full h-full object-cover" />
              : <span className="w-full h-full flex items-center justify-center bg-surface-3">
                  <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 18 }}>person</span>
                </span>
            }
          </button>
        </div>
      </header>

      {/* Main Canvas */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
        {view === 'dashboard' && <PropertyDashboard user={user} properties={properties} onNavigate={(v) => setView(v as View)} />}
        {view === 'roomgrid' && <RoomGrid rooms={rooms} />}
        {view === 'schedule' && <MaintenanceSchedule tasks={tasks} user={user} />}
        {view === 'repair' && <DocumentRepair user={user} onSubmit={(t) => { onAddTask(t); setView('schedule'); }} onCancel={() => setView('dashboard')} />}
        {view === 'checklist' && <PMChecklist properties={properties} />}
        {view === 'profile' && (
          <ProfileSettings
            user={user}
            properties={properties}
            onUpdateUser={onUpdateUser}
            onAddProperty={onAddProperty}
            onUpdateProperty={onUpdateProperty}
            onDeleteProperty={onDeleteProperty}
            onLogout={onLogout}
          />
        )}
      </main>

      {/* FyxBot — only while a repair is open */}
      {openRepairs.length > 0 && <FyxBotChat openRepairs={openRepairs} />}

      {/* BottomNavBar */}
      <nav className="z-20 flex justify-around items-center h-20 pb-safe bg-neutral-900/90 backdrop-blur-xl border-t border-white/10 shrink-0">
        {NAV_ITEMS.map(item => (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={`flex flex-col items-center justify-center transition-all group active:scale-90 duration-150 ${view === item.view ? 'text-[#58E21F] drop-shadow-[0_0_5px_rgba(88,226,31,0.6)]' : 'text-neutral-500 hover:text-cyan-400'}`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="font-['Space_Grotesk'] text-[10px] uppercase font-medium tracking-widest mt-1">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
