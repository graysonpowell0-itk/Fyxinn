import React, { useState } from 'react';
import { Task, User } from '../../types';

interface Props {
  user: User;
  onSubmit: (task: Task) => void;
  onCancel: () => void;
}

export const DocumentRepair: React.FC<Props> = ({ user, onSubmit, onCancel }) => {
  const [roomNumber, setRoomNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      description: description.trim(),
      status: 'PENDING',
      reportedBy: user.name,
      createdAt: new Date().toISOString(),
      priority,
      roomNumber: roomNumber.trim() || undefined,
    };
    
    onSubmit(newTask);
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 pt-6 pb-10 max-w-lg mx-auto w-full">
      {/* Header Section */}
      <header className="mb-6">
        <h2 className="font-headline-lg text-headline-lg text-on-background mb-1">Document Repair</h2>
        <p className="font-body-md text-on-surface-variant">Log major structural or hardware maintenance requirements for technical auditing.</p>
      </header>

      {/* Form Section */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Room Name Field */}
        <div className="group relative">
          <label htmlFor="room_name" className="block font-label-lg text-label-lg text-primary uppercase mb-1 tracking-widest">
            Room Name / Number
          </label>
          <div className="border-b border-white/10 neon-border-focus transition-all duration-300">
            <input 
              id="room_name"
              type="text" 
              value={roomNumber}
              onChange={e => setRoomNumber(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 text-on-background font-body-lg py-2 px-0 placeholder:text-on-surface-variant/30" 
              placeholder="e.g. Server Room A-12 or 401" 
            />
          </div>
        </div>

        {/* Date Field */}
        <div className="group relative">
          <label htmlFor="repair_date" className="block font-label-lg text-label-lg text-primary uppercase mb-1 tracking-widest">
            Incident Date
          </label>
          <div className="border-b border-white/10 neon-border-focus transition-all duration-300">
            <input 
              id="repair_date"
              type="date" 
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 text-on-background font-body-lg py-2 px-0 appearance-none" 
            />
          </div>
        </div>

        {/* Repair Description Field */}
        <div className="group relative">
          <label htmlFor="description" className="block font-label-lg text-label-lg text-primary uppercase mb-1 tracking-widest">
            Repair Description
          </label>
          <div className="border-b border-white/10 neon-border-focus transition-all duration-300">
            <textarea 
              id="description"
              rows={4}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 text-on-background font-body-md py-2 px-0 placeholder:text-on-surface-variant/30 resize-none" 
              placeholder="Detailed technical diagnostic of the failure and required components..."
              required
            ></textarea>
          </div>
        </div>

        {/* Upload Images Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <label className="block font-label-lg text-label-lg text-primary uppercase tracking-widest">
              Technical Documentation
            </label>
            <span className="font-label-sm text-label-sm text-on-surface-variant">0/6 MAX</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button type="button" className="aspect-square rounded-lg border-2 border-dashed border-secondary-container/20 flex flex-col items-center justify-center gap-2 hover:border-secondary-container/50 hover:bg-secondary-container/5 transition-all group">
              <span className="material-symbols-outlined text-secondary-container group-hover:scale-110 transition-transform">add_a_photo</span>
              <span className="font-label-sm text-secondary-container uppercase">Add Detail</span>
            </button>
            <div className="aspect-square rounded-lg bg-surface-container-lowest border border-white/5 flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant/20">image</span>
            </div>
          </div>
        </div>

        {/* Priority Selector */}
        <div className="pt-2">
          <label className="block font-label-lg text-label-lg text-primary uppercase mb-4 tracking-widest">Urgency Level</label>
          <div className="flex gap-2">
            <button 
              type="button" 
              onClick={() => setPriority('LOW')}
              className={`flex-1 py-2 border rounded-lg font-label-lg transition-all ${
                priority === 'LOW' ? 'border-primary text-primary bg-primary/5 shadow-[0_0_10px_rgba(88,226,31,0.2)]' : 'border-white/10 text-on-surface-variant hover:border-primary hover:text-primary'
              }`}
            >
              NORMAL
            </button>
            <button 
              type="button" 
              onClick={() => setPriority('MEDIUM')}
              className={`flex-1 py-2 border rounded-lg font-label-lg transition-all ${
                priority === 'MEDIUM' ? 'border-secondary-container text-secondary-container bg-secondary-container/5 shadow-[0_0_10px_rgba(0,193,253,0.2)]' : 'border-white/10 text-on-surface-variant hover:border-secondary-container hover:text-secondary-container'
              }`}
            >
              MAJOR
            </button>
            <button 
              type="button" 
              onClick={() => setPriority('HIGH')}
              className={`flex-1 py-2 border rounded-lg font-label-lg transition-all ${
                priority === 'HIGH' ? 'border-error text-error bg-error/5 shadow-[0_0_10px_rgba(255,180,171,0.2)]' : 'border-white/10 text-on-surface-variant hover:border-error hover:text-error'
              }`}
            >
              CRITICAL
            </button>
          </div>
        </div>

        {/* Action Footer */}
        <footer className="pt-2 pb-4">
          <div className="max-w-lg mx-auto flex gap-4">
            <button 
              type="button"
              onClick={onCancel}
              className="px-6 py-4 bg-surface-container border border-white/10 text-on-surface font-headline-md rounded-lg active:scale-95 transition-all"
            >
              CANCEL
            </button>
            <button 
              type="submit"
              disabled={!description.trim()}
              className="flex-1 py-4 bg-primary-container text-on-primary font-headline-md rounded-lg neon-glow-primary active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <span className="material-symbols-outlined filled">save</span>
              SAVE REPAIR
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
};
