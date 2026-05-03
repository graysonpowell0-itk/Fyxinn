import React from 'react';
import { Room, RoomStatus } from '../../types';

interface Props {
  rooms: Room[];
}

export const RoomGrid: React.FC<Props> = ({ rooms }) => {
  const byFloor = Array.from(new Set(rooms.map(r => r.floor))).sort((a, b) => b - a);

  const getStatusColor = (status: RoomStatus) => {
    switch (status) {
      case RoomStatus.COMPLETED: return 'text-primary bg-primary/10 border-primary/20';
      case RoomStatus.IN_PROGRESS: return 'text-secondary-container bg-secondary-container/10 border-secondary-container/20';
      case RoomStatus.ISSUE_REPORTED: return 'text-error bg-error/10 border-error/20';
      case RoomStatus.WAITING_APPROVAL: return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      default: return 'text-zinc-500 bg-zinc-800 border-zinc-700/50';
    }
  };

  const getStatusIcon = (status: RoomStatus) => {
    switch (status) {
      case RoomStatus.COMPLETED: return 'check_circle';
      case RoomStatus.IN_PROGRESS: return 'engineering';
      case RoomStatus.ISSUE_REPORTED: return 'report_problem';
      case RoomStatus.WAITING_APPROVAL: return 'pending_actions';
      default: return 'inventory_2';
    }
  };

  const getStatusLabel = (status: RoomStatus) => {
    switch (status) {
      case RoomStatus.COMPLETED: return 'MAINTAINED';
      case RoomStatus.IN_PROGRESS: return 'IN PROGRESS';
      case RoomStatus.ISSUE_REPORTED: return 'ISSUE REPORTED';
      case RoomStatus.WAITING_APPROVAL: return 'WAITING';
      default: return 'NOT STARTED';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24 space-y-8">
      {/* Hero Section */}
      <section className="mb-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-headline-lg text-headline-lg text-[#58E21F] uppercase tracking-tighter">Westside Apartment - Floor 4</h2>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <p className="font-label-lg text-label-lg text-zinc-400 uppercase tracking-widest">Room Maintenance Status</p>
          </div>
        </div>
      </section>

      {/* Stats Overview */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="col-span-1 md:col-span-2 glass-panel p-6 rounded-xl border border-white/5 flex flex-col justify-between relative overflow-hidden h-48">
          <div className="relative z-10">
            <p className="font-label-sm text-label-sm text-zinc-500 uppercase mb-1">Floor Efficiency</p>
            <p className="font-headline-xl text-headline-xl text-on-surface">84<span className="text-primary">%</span></p>
          </div>
          <div className="absolute right-0 bottom-0 w-1/2 h-full">
            <img 
              src="https://images.unsplash.com/photo-1550684848-fac1c5b4e853?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
              className="w-full h-full object-cover opacity-20" 
              style={{ maskImage: 'linear-gradient(to left, black, transparent)', WebkitMaskImage: 'linear-gradient(to left, black, transparent)' }}
              alt="Floor network"
            />
          </div>
          <div className="relative z-10 w-full bg-zinc-800 h-1 rounded-full mt-4">
            <div className="bg-primary h-full rounded-full neon-glow-primary" style={{ width: '84%' }}></div>
          </div>
        </div>
        
        <div className="glass-panel p-6 rounded-xl border border-white/5 flex flex-col justify-center items-center text-center">
          <span className="material-symbols-outlined text-4xl text-secondary-container mb-2">event_upcoming</span>
          <p className="font-label-lg text-label-lg text-on-background">Next PM Due</p>
          <p className="font-headline-md text-headline-md text-secondary-container">Oct 24</p>
        </div>
      </section>

      {/* Room Grid */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {rooms.slice(0, 8).map(room => {
          const colors = getStatusColor(room.status);
          const icon = getStatusIcon(room.status);
          const label = getStatusLabel(room.status);

          return (
            <div key={room.id} className="surface-container-low p-4 rounded-xl border border-zinc-700/50 hover:border-zinc-500 transition-all duration-300 flex flex-col justify-between h-48">
              <div className="flex justify-between items-start">
                <h3 className={`font-headline-md text-headline-md ${room.status === RoomStatus.COMPLETED ? 'text-zinc-400' : 'text-on-surface'}`}>
                  {room.number}
                </h3>
                <div className={`p-2 rounded-lg ${colors}`}>
                  <span className="material-symbols-outlined">{icon}</span>
                </div>
              </div>
              <div className="mt-auto">
                <span className={`font-label-sm text-label-sm px-2 py-1 rounded ${colors.split(' ')[1]} ${colors.split(' ')[0]}`}>
                  {label}
                </span>
                <p className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest truncate">
                  {room.housekeepingStatus || 'Ready'}
                </p>
              </div>
            </div>
          );
        })}
        
        {/* Extra Imagery for Bento feel */}
        <div className="col-span-2 glass-panel p-0 rounded-xl border border-white/5 overflow-hidden h-48 relative">
          <img 
            src="https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
            className="w-full h-full object-cover opacity-60" 
            alt="Cybernetics" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent flex items-end p-6">
          </div>
        </div>
      </section>
    </div>
  );
};
