import React, { useState } from 'react';

export const PMChecklist: React.FC = () => {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    'hvac': false,
    'smoke': false,
    'water': false,
    'elevator': true
  });

  const toggleItem = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 pt-6 pb-32">
      {/* Property Header Section */}
      <section className="relative h-48 rounded-xl overflow-hidden group mb-6">
        <img 
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
          alt="Westside Apartment" 
          className="w-full h-full object-cover opacity-60" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent"></div>
        <div className="absolute bottom-4 left-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-secondary-container/20 text-secondary px-2 py-0.5 rounded-full font-label-sm text-label-sm">RESIDENTIAL</span>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span className="text-primary font-label-sm text-label-sm uppercase tracking-widest">Live Status</span>
            </div>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-background uppercase tracking-tighter">Westside Apartment</h2>
          <div className="flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-[14px]">location_on</span>
            <span>DISTRICT 7 • BLDG 402</span>
          </div>
        </div>
      </section>

      {/* Stats Quick View */}
      <section className="grid grid-cols-2 gap-4 mb-6">
        <div className="glass-panel p-4 rounded-lg border-l-2 border-[#58E21F]">
          <p className="text-on-surface-variant font-label-sm text-label-sm uppercase">Pending PMs</p>
          <p className="text-headline-md font-headline-md text-primary">03</p>
        </div>
        <div className="glass-panel p-4 rounded-lg border-l-2 border-secondary-container">
          <p className="text-on-surface-variant font-label-sm text-label-sm uppercase">Next Due</p>
          <p className="text-headline-md font-headline-md text-secondary">24H</p>
        </div>
      </section>

      {/* PM Checklist Header */}
      <div className="flex flex-col gap-4 pt-4 mb-4">
        <h3 className="font-headline-md text-headline-md uppercase tracking-tight flex items-center gap-2 w-full">
          <span className="material-symbols-outlined text-primary">fact_check</span>
          PM Checklist
        </h3>
        <div className="flex items-center gap-3">
          <button className="bg-[#58E21F] text-on-primary font-label-lg text-label-lg px-4 py-2.5 rounded-full flex items-center gap-2 active:scale-95 transition-transform">
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            UPLOAD
          </button>
          <button className="bg-[#58E21F] text-on-primary font-label-lg text-label-lg px-4 py-2.5 rounded-full flex items-center gap-2 active:scale-95 transition-transform">
            <span className="material-symbols-outlined text-[18px]">add</span>
            ADD TASK
          </button>
        </div>
      </div>

      {/* Checklist Items */}
      <div className="space-y-4">
        {/* Item 1: Active/Urgent */}
        <div className={`glass-panel p-4 rounded-lg flex items-center justify-between transition-all ${checkedItems.hvac ? 'opacity-50' : 'border-t-2 border-[#58E21F] neon-border-active'}`}>
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <input 
                type="checkbox" 
                checked={checkedItems.hvac}
                onChange={() => toggleItem('hvac')}
                className="w-5 h-5 rounded-sm bg-surface-container border-outline text-primary focus:ring-primary focus:ring-offset-background cursor-pointer" 
              />
            </div>
            <div className="space-y-1">
              <h4 className={`font-label-lg text-label-lg uppercase font-bold ${checkedItems.hvac ? 'text-on-background line-through' : 'text-primary'}`}>HVAC Filter Change</h4>
              <div className="flex items-center gap-2">
                <span className="text-on-surface-variant font-label-sm text-label-sm uppercase">HVAC SYSTEM</span>
                <span className="w-1 h-1 rounded-full bg-neutral-700"></span>
                <span className={`${checkedItems.hvac ? 'text-on-surface-variant' : 'text-error'} font-label-sm text-label-sm font-bold uppercase`}>
                  {checkedItems.hvac ? 'COMPLETED' : 'DUE TODAY'}
                </span>
              </div>
            </div>
          </div>
          <button className="text-on-surface-variant">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        {/* Item 2 */}
        <div className={`glass-panel p-4 rounded-lg flex items-center justify-between transition-all ${checkedItems.smoke ? 'opacity-50' : ''}`}>
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <input 
                type="checkbox" 
                checked={checkedItems.smoke}
                onChange={() => toggleItem('smoke')}
                className="w-5 h-5 rounded-sm bg-surface-container border-outline text-primary focus:ring-primary focus:ring-offset-background cursor-pointer" 
              />
            </div>
            <div className="space-y-1">
              <h4 className={`font-label-lg text-label-lg uppercase ${checkedItems.smoke ? 'text-on-background line-through' : 'text-on-background'}`}>Check Smoke Detectors</h4>
              <div className="flex items-center gap-2">
                <span className="text-on-surface-variant font-label-sm text-label-sm uppercase">FIRE SAFETY</span>
                <span className="w-1 h-1 rounded-full bg-neutral-700"></span>
                <span className="text-on-surface-variant font-label-sm text-label-sm uppercase">DUE IN 3 DAYS</span>
              </div>
            </div>
          </div>
          <button className="text-on-surface-variant">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        {/* Item 3 */}
        <div className={`glass-panel p-4 rounded-lg flex items-center justify-between transition-all ${checkedItems.water ? 'opacity-50' : ''}`}>
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <input 
                type="checkbox" 
                checked={checkedItems.water}
                onChange={() => toggleItem('water')}
                className="w-5 h-5 rounded-sm bg-surface-container border-outline text-primary focus:ring-primary focus:ring-offset-background cursor-pointer" 
              />
            </div>
            <div className="space-y-1">
              <h4 className={`font-label-lg text-label-lg uppercase ${checkedItems.water ? 'text-on-background line-through' : 'text-on-background'}`}>Inspect Water Heater</h4>
              <div className="flex items-center gap-2">
                <span className="text-on-surface-variant font-label-sm text-label-sm uppercase">PLUMBING</span>
                <span className="w-1 h-1 rounded-full bg-neutral-700"></span>
                <span className="text-on-surface-variant font-label-sm text-label-sm uppercase">DUE OCT 28</span>
              </div>
            </div>
          </div>
          <button className="text-on-surface-variant">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        {/* Item 4: Completed State */}
        <div className={`glass-panel p-4 rounded-lg flex items-center justify-between transition-all ${checkedItems.elevator ? 'opacity-50' : ''}`}>
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <input 
                type="checkbox" 
                checked={checkedItems.elevator}
                onChange={() => toggleItem('elevator')}
                className="w-5 h-5 rounded-sm bg-primary border-primary text-on-primary focus:ring-primary focus:ring-offset-background cursor-pointer" 
              />
            </div>
            <div className="space-y-1">
              <h4 className={`font-label-lg text-label-lg uppercase ${checkedItems.elevator ? 'text-on-background line-through' : 'text-on-background'}`}>Check Elevator Cables</h4>
              <div className="flex items-center gap-2">
                <span className="text-primary font-label-sm text-label-sm uppercase flex items-center gap-1">
                  {checkedItems.elevator && <span className="material-symbols-outlined text-[12px]">done_all</span>}
                  {checkedItems.elevator ? 'COMPLETED' : 'DUE SOON'}
                </span>
              </div>
            </div>
          </div>
          <button className="text-on-surface-variant">
            <span className="material-symbols-outlined">{checkedItems.elevator ? 'history' : 'chevron_right'}</span>
          </button>
        </div>
      </div>

      {/* Timeline/History Preview */}
      <div className="pt-6">
        <h3 className="font-headline-md text-headline-md uppercase tracking-tight mb-4">Maintenance History</h3>
        <div className="relative pl-8 space-y-6 before:content-[''] before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
          {/* Node 1 */}
          <div className="relative">
            <span className="absolute -left-[25px] top-1 w-[11px] h-[11px] rounded-full bg-secondary-container shadow-[0_0_8px_#00c1fd]"></span>
            <p className="font-label-sm text-label-sm text-secondary-container uppercase mb-1">OCT 15, 2023</p>
            <p className="font-body-md text-body-md text-on-surface uppercase">Roof Membrane Inspection</p>
            <p className="text-label-sm text-on-surface-variant">Technician: R. Miller • Pass</p>
          </div>
          
          {/* Node 2 */}
          <div className="relative">
            <span className="absolute -left-[25px] top-1 w-[11px] h-[11px] rounded-full bg-neutral-600"></span>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase mb-1">SEP 30, 2023</p>
            <p className="font-body-md text-body-md text-on-surface uppercase">Emergency Lighting Test</p>
            <p className="text-label-sm text-on-surface-variant">Technician: Auto-System • Pass</p>
          </div>
        </div>
      </div>
    </div>
  );
};
