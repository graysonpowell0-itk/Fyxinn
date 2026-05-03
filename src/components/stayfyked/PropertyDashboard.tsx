import React from 'react';
import { Property, User } from '../../types';
import logo from '../../assets/Fyxinn_glow_logo.png';

interface Props {
  properties?: Property[];
  user: User;
  onNavigate: (view: string) => void;
}

export const PropertyDashboard: React.FC<Props> = ({ properties = [], user, onNavigate }) => {
  return (
    <div className="flex-1 overflow-y-auto px-6 space-y-6 pt-6 pb-24">
      {/* Welcome Section */}
      <section className="space-y-1">
        <h2 className="font-headline-md text-headline-md text-on-background">Asset Overview</h2>
        <p className="font-label-sm text-label-sm text-neutral-400">
          {properties.length} PROPERTIES ACTIVE • 2 ATTENTION REQUIRED
        </p>
      </section>

      {/* Bento Grid Summary */}
      <section className="grid grid-cols-2 gap-4">
        <div className="glass-card p-4 rounded-xl flex flex-col justify-between h-32 border-l-2 border-l-[#58E21F]">
          <div className="flex justify-between items-start">
            <span className="material-symbols-outlined text-[#58E21F]">health_and_safety</span>
            <span className="text-[10px] font-bold text-[#58E21F] bg-[#58E21F]/10 px-2 py-0.5 rounded-full">OPTIMAL</span>
          </div>
          <div>
            <div className="text-2xl font-black text-on-surface">94%</div>
            <div className="font-label-sm text-[10px] text-neutral-500 uppercase tracking-widest">Global Health</div>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl flex flex-col justify-between h-32 border-l-2 border-l-error">
          <div className="flex justify-between items-start">
            <span className="material-symbols-outlined text-error">pending_actions</span>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></div>
              <span className="text-[10px] font-bold text-error uppercase">Urgent</span>
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-on-surface">12</div>
            <div className="font-label-sm text-[10px] text-neutral-500 uppercase tracking-widest">Pending Tasks</div>
          </div>
        </div>
      </section>

      {/* Property List */}
      <section className="space-y-4">
        {/* Mocking the first property */}
        <div className="glass-card rounded-xl overflow-hidden group border-t-2 border-t-[#58E21F] transition-all active:scale-95 duration-200">
          <div className="relative h-40">
            <img 
              src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
              alt="Westside Apartment" 
              className="w-full h-full object-cover opacity-60" 
            />
            <div className="absolute top-3 right-3 bg-neutral-950/60 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1 border border-white/10">
              <span className="material-symbols-outlined text-[#58E21F] text-sm">bolt</span>
              <span className="font-label-sm text-[12px] text-[#58E21F] font-bold uppercase">Up to date</span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <h3 className="font-headline-md text-xl font-bold text-on-surface">Westside Apartment</h3>
                <p className="font-label-sm text-neutral-400">District 7, Sector B</p>
              </div>
              <div className="text-right">
                <div className="text-[#58E21F] font-black text-xl">98%</div>
                <div className="font-label-sm text-[10px] text-neutral-500 uppercase tracking-tighter">Health Score</div>
              </div>
            </div>
            
            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#58E21F] h-full w-[98%] neon-glow-primary"></div>
            </div>
            
            <button 
              onClick={() => onNavigate('roomgrid')}
              className="w-full h-12 bg-[#00C1FD] text-on-secondary-fixed font-bold rounded-lg flex items-center justify-center gap-2 hover:brightness-110 transition-all neon-glow-cyan"
            >
              <span>VIEW DETAILS</span>
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* The Beach House */}
        <div className="glass-card rounded-xl overflow-hidden group border-t-2 border-t-[#00C1FD] transition-all active:scale-95 duration-200">
          <div className="relative h-40">
            <img 
              src="https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
              alt="The Beach House" 
              className="w-full h-full object-cover opacity-60" 
            />
            <div className="absolute top-3 right-3 bg-neutral-950/60 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1 border border-white/10">
              <span className="material-symbols-outlined text-[#00C1FD] text-sm">notification_important</span>
              <span className="font-label-sm text-[12px] text-[#00C1FD] font-bold uppercase">Needs Attention</span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <h3 className="font-headline-md text-xl font-bold text-on-surface">The Beach House</h3>
                <p className="font-label-sm text-neutral-400">Coastal Range, Lot 44</p>
              </div>
              <div className="text-right">
                <div className="text-[#00C1FD] font-black text-xl">72%</div>
                <div className="font-label-sm text-[10px] text-neutral-500 uppercase tracking-tighter">Health Score</div>
              </div>
            </div>
            
            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#00C1FD] h-full w-[72%] cyber-glow-cyan"></div>
            </div>
            
            <button 
              onClick={() => onNavigate('repair')}
              className="w-full h-12 bg-white text-neutral-950 font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-neutral-200 transition-all"
            >
              <span>DIAGNOSE ISSUES</span>
              <span className="material-symbols-outlined text-lg">build</span>
            </button>
          </div>
        </div>
      </section>

      {/* Floating Action Button */}
      <button className="fixed bottom-24 right-6 w-14 h-14 bg-[#58E21F] text-on-primary-fixed rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(88,226,31,0.4)] active:scale-90 transition-all z-40">
        <span className="material-symbols-outlined text-3xl font-bold">add</span>
      </button>
    </div>
  );
};
