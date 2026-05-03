import React from 'react';
import { Task, User } from '../../types';

interface Props {
  tasks: Task[];
  user: User;
}

export const MaintenanceSchedule: React.FC<Props> = ({ tasks }) => {
  return (
    <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24 min-h-screen">
      {/* Dashboard Header */}
      <div className="mb-6">
        <h2 className="font-headline-lg text-headline-lg text-primary tracking-tight mb-1 uppercase">Upcoming Maintenance</h2>
        <p className="font-label-lg text-label-lg text-neutral-400">{tasks.length} ACTIVE PROTOCOLS THIS WEEK</p>
      </div>

      {/* Schedule Controls */}
      <div className="flex gap-4 mb-8 overflow-x-auto pb-2 no-scrollbar">
        <button className="bg-primary text-on-primary px-6 py-1.5 font-label-lg text-label-lg rounded-full flex items-center gap-1.5 cyber-glow transition-all active:scale-95 shrink-0">
          <span className="material-symbols-outlined text-[18px]">calendar_view_week</span>
          WEEKLY
        </button>
        <button className="glass-panel text-neutral-400 px-6 py-1.5 font-label-lg text-label-lg rounded-full flex items-center gap-1.5 transition-all hover:text-white shrink-0">
          <span className="material-symbols-outlined text-[18px]">calendar_view_month</span>
          MONTHLY
        </button>
        <button className="glass-panel text-neutral-400 px-6 py-1.5 font-label-lg text-label-lg rounded-full flex items-center gap-1.5 transition-all hover:text-white shrink-0">
          <span className="material-symbols-outlined text-[18px]">filter_list</span>
          FILTERS
        </button>
      </div>

      {/* Timeline Container */}
      <div className="relative pl-8">
        {/* Timeline Line */}
        <div className="absolute left-1 top-0 bottom-0 timeline-line opacity-20"></div>

        {/* Date Group: Today */}
        <div className="mb-12 relative">
          <div className="absolute -left-[31px] top-1 h-3 w-3 bg-secondary-container rounded-full cyber-glow-cyan border-2 border-surface-dim"></div>
          <h3 className="font-headline-md text-headline-md text-on-surface mb-4">
            TODAY <span className="text-secondary text-sm font-normal ml-2">ACTIVE</span>
          </h3>

          {tasks.slice(0, 2).map((task, idx) => (
            <div key={task.id} className={`glass-panel rounded-xl p-4 mb-4 border-l-4 ${idx === 0 ? 'border-l-primary-container' : 'border-l-secondary-container'} transition-all hover:bg-neutral-800/40`}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col">
                  <span className={`font-label-sm text-label-sm ${idx === 0 ? 'text-primary' : 'text-secondary'} mb-1 tracking-widest uppercase`}>
                    {task.priority} PRIORITY
                  </span>
                  <h4 className="font-headline-md text-body-lg text-white mb-1 truncate max-w-[200px]">{task.description}</h4>
                </div>
                <span className={`material-symbols-outlined ${idx === 0 ? 'text-primary-container animate-pulse' : 'text-secondary-container'}`}>
                  {idx === 0 ? 'sensors' : 'build'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-neutral-400 font-label-sm text-label-sm">
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">schedule</span> {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                {task.roomNumber && (
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">location_on</span> ROOM {task.roomNumber}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Date Group: Tomorrow */}
        {tasks.length > 2 && (
          <div className="mb-12 relative">
            <div className="absolute -left-[31px] top-1 h-3 w-3 bg-neutral-600 rounded-full border-2 border-surface-dim"></div>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-4">
              TOMORROW <span className="text-neutral-500 text-sm font-normal ml-2">PENDING</span>
            </h3>

            {tasks.slice(2, 4).map(task => (
              <div key={task.id} className="glass-panel rounded-xl p-4 mb-4 border-l-4 border-l-orange-500/50 transition-all hover:bg-neutral-800/40">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-orange-400 mb-1 tracking-widest uppercase">
                      {task.priority} PRIORITY
                    </span>
                    <h4 className="font-headline-md text-body-lg text-white mb-1">{task.description}</h4>
                  </div>
                  <span className="material-symbols-outlined text-orange-500">elevator</span>
                </div>
                <div className="flex items-center gap-4 text-neutral-400 font-label-sm text-label-sm">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">schedule</span> 10:00 AM
                  </div>
                  {task.roomNumber && (
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">location_on</span> ROOM {task.roomNumber}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
