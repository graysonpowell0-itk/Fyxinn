import React, { useState } from 'react';
import { Property, User, UserRole } from '../../types';
import { ProfileEditor, AddPropertyModal } from '../../App';
import { ThemeToggle } from '../../theme';

interface Props {
  user: User;
  properties: Property[];
  onUpdateUser: (updates: Partial<User>) => void;
  onAddProperty: (p: Property) => void;
  onDeleteProperty: (id: string) => void;
  onLogout: () => void;
}

export const ProfileSettings: React.FC<Props> = ({
  user, properties, onUpdateUser, onAddProperty, onDeleteProperty, onLogout,
}) => {
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const isAdmin = user.role === UserRole.ADMIN;

  return (
    <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24 space-y-6 max-w-lg mx-auto w-full">
      <header>
        <h2 className="font-headline-lg text-headline-lg text-on-background mb-1">Profile Settings</h2>
        <p className="font-label-sm text-label-sm text-neutral-400 uppercase tracking-widest">{user.role}</p>
      </header>

      {/* Profile */}
      <section className="glass-card rounded-xl p-5">
        <h3 className="font-grotesk text-xs font-600 text-gray-300 uppercase tracking-widest flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>person</span>
          My Profile
        </h3>
        <ProfileEditor user={user} onSave={onUpdateUser} />
      </section>

      {/* Appearance */}
      <section className="glass-card rounded-xl p-5">
        <h3 className="font-grotesk text-xs font-600 text-gray-300 uppercase tracking-widest flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-secondary" style={{ fontSize: 16 }}>contrast</span>
          Appearance
        </h3>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 font-grotesk">Switch between dark and light mode</p>
          <ThemeToggle />
        </div>
      </section>

      {/* Property settings — admin only */}
      {isAdmin && (
        <section className="glass-card rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-grotesk text-xs font-600 text-gray-300 uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary" style={{ fontSize: 16 }}>apartment</span>
              Property Settings
            </h3>
            <button
              onClick={() => setShowAddProperty(true)}
              className="flex items-center gap-1.5 text-[10px] font-grotesk font-600 text-primary border border-primary/30 bg-primary/5 hover:bg-primary/15 px-3 py-1.5 rounded-sm transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
              Add Property
            </button>
          </div>

          {properties.length === 0 ? (
            <p className="text-xs text-gray-500 font-grotesk py-4 text-center">No properties yet.</p>
          ) : (
            <div className="space-y-3">
              {properties.map(p => (
                <div key={p.id} className="bg-surface-3 border border-border rounded-sm p-4 flex items-start gap-3">
                  <div className="w-12 h-12 rounded-sm bg-surface-2 border border-border flex items-center justify-center overflow-hidden shrink-0">
                    {p.photoUrl
                      ? <img src={p.photoUrl} alt={p.name} className="w-full h-full object-contain" />
                      : <span className="material-symbols-outlined text-gray-600" style={{ fontSize: 22 }}>apartment</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-grotesk font-600 text-gray-200 truncate">{p.name}</p>
                    {p.address && <p className="text-[10px] text-gray-500 font-grotesk mt-0.5 truncate">{p.address}</p>}
                    <p className="text-[10px] text-gray-600 font-grotesk mt-1">
                      {p.floors} floor{p.floors === 1 ? '' : 's'} · {p.floorLayouts?.reduce((acc, fl) => acc + (fl.end - fl.start + 1), 0) || 0} rooms
                    </p>
                    {p.floorLayouts && p.floorLayouts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.floorLayouts.map(fl => (
                          <span key={fl.floor} className="px-1.5 py-0.5 text-[8px] font-grotesk bg-secondary/10 border border-secondary/20 text-secondary rounded-sm">
                            F{fl.floor}: {fl.start}–{fl.end}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {confirmDeleteId === p.id ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <p className="text-[9px] text-red-400 font-grotesk text-right max-w-[110px]">Remove this property?</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[9px] font-grotesk text-gray-500 border border-border px-2 py-1 rounded-sm hover:text-gray-300 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => { onDeleteProperty(p.id); setConfirmDeleteId(null); }}
                            className="text-[9px] font-grotesk text-red-400 border border-red-400/30 bg-red-400/10 px-2 py-1 rounded-sm hover:bg-red-400/20 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => properties.length > 1 ? setConfirmDeleteId(p.id) : undefined}
                        title={properties.length === 1 ? 'Cannot remove the last property' : 'Remove property'}
                        className={`transition-colors ${properties.length === 1 ? 'text-gray-700 cursor-not-allowed' : 'text-gray-600 hover:text-red-400'}`}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Logout */}
      <button
        onClick={onLogout}
        className="w-full py-3 flex items-center justify-center gap-2 text-red-400 border border-red-400/30 bg-red-400/5 hover:bg-red-400/15 font-grotesk text-xs font-600 uppercase tracking-widest rounded-lg transition-all"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
        Log Out
      </button>

      {showAddProperty && (
        <AddPropertyModal
          onSave={p => { onAddProperty(p); setShowAddProperty(false); }}
          onClose={() => setShowAddProperty(false)}
        />
      )}
    </div>
  );
};
