import React, { useState } from 'react';
import { User, Task, Property, Room } from '../../types';
import { PropertyDashboard } from './PropertyDashboard';
import { RoomGrid } from './RoomGrid';
import { MaintenanceSchedule } from './MaintenanceSchedule';
import { DocumentRepair } from './DocumentRepair';
import { PMChecklist } from './PMChecklist';
import logo from '../../assets/Fyxinn_glow_logo.png';
import { generateRooms, MOCK_PROPERTY } from '../../App';

interface Props {
  user: User;
  onLogout: () => void;
  tasks: Task[];
  properties: Property[];
  rooms?: Room[]; // Optional since we can generate them
  onAddTask: (task: Task) => void;
}

type View = 'dashboard' | 'checklist' | 'repair' | 'schedule' | 'roomgrid';

export const StayFykedPortal: React.FC<Props> = ({ user, onLogout, tasks, properties, rooms: initialRooms, onAddTask }) => {
  const [view, setView] = useState<View>('dashboard');
  const [rooms] = useState<Room[]>(() => initialRooms && initialRooms.length > 0 ? initialRooms : generateRooms(MOCK_PROPERTY));

  return (
    <div className="flex flex-col h-[100dvh] bg-surface text-on-surface overflow-hidden">
      {/* TopAppBar */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-neutral-950/80 backdrop-blur-md border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          {/* We use an img or icon depending on what's available. The user provided a logo to use. */}
          <img src={logo} alt="STAYFYKED Logo" className="h-8 w-auto object-contain" />
          <h1 className="font-['Space_Grotesk'] tracking-tighter uppercase font-bold text-xl font-black text-[#58E21F] drop-shadow-[0_0_8px_rgba(88,226,31,0.5)]">
            STAYFYKED
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onLogout} className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined">logout</span>
          </button>
          <div className="w-8 h-8 rounded-full overflow-hidden border border-primary-fixed">
            <img 
              src={user.avatar || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"} 
              alt="User Profile" 
              className="w-full h-full object-cover" 
            />
          </div>
        </div>
      </header>

      {/* Main Canvas */}
      <main className="flex-1 overflow-hidden mt-16 pb-20 relative">
        {view === 'dashboard' && <PropertyDashboard user={user} properties={properties} onNavigate={(v) => setView(v as View)} />}
        {view === 'roomgrid' && <RoomGrid rooms={rooms} />}
        {view === 'schedule' && <MaintenanceSchedule tasks={tasks} user={user} />}
        {view === 'repair' && <DocumentRepair user={user} onSubmit={(t) => { onAddTask(t); setView('schedule'); }} onCancel={() => setView('dashboard')} />}
        {view === 'checklist' && <PMChecklist />}
      </main>

      {/* BottomNavBar */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 pb-safe bg-neutral-900/90 backdrop-blur-xl border-t border-white/10 shrink-0">
        <button 
          onClick={() => setView('dashboard')}
          className={`flex flex-col items-center justify-center transition-all group active:scale-90 duration-150 ${view === 'dashboard' ? 'text-[#58E21F] drop-shadow-[0_0_5px_rgba(88,226,31,0.6)]' : 'text-neutral-500 hover:text-cyan-400'}`}
        >
          <span className="material-symbols-outlined">dashboard</span>
          <span className="font-['Space_Grotesk'] text-[10px] uppercase font-medium tracking-widest mt-1">Dashboard</span>
        </button>
        <button 
          onClick={() => setView('checklist')}
          className={`flex flex-col items-center justify-center transition-all group active:scale-90 duration-150 ${view === 'checklist' ? 'text-[#58E21F] drop-shadow-[0_0_5px_rgba(88,226,31,0.6)]' : 'text-neutral-500 hover:text-cyan-400'}`}
        >
          <span className="material-symbols-outlined">fact_check</span>
          <span className="font-['Space_Grotesk'] text-[10px] uppercase font-medium tracking-widest mt-1">Checklist</span>
        </button>
        <button 
          onClick={() => setView('repair')}
          className={`flex flex-col items-center justify-center transition-all group active:scale-90 duration-150 ${view === 'repair' ? 'text-[#58E21F] drop-shadow-[0_0_5px_rgba(88,226,31,0.6)]' : 'text-neutral-500 hover:text-cyan-400'}`}
        >
          <span className="material-symbols-outlined">build</span>
          <span className="font-['Space_Grotesk'] text-[10px] uppercase font-medium tracking-widest mt-1">Repair</span>
        </button>
        <button 
          onClick={() => setView('schedule')}
          className={`flex flex-col items-center justify-center transition-all group active:scale-90 duration-150 ${view === 'schedule' ? 'text-[#58E21F] drop-shadow-[0_0_5px_rgba(88,226,31,0.6)]' : 'text-neutral-500 hover:text-cyan-400'}`}
        >
          <span className="material-symbols-outlined">calendar_month</span>
          <span className="font-['Space_Grotesk'] text-[10px] uppercase font-medium tracking-widest mt-1">Schedule</span>
        </button>
      </nav>
    </div>
  );
};
