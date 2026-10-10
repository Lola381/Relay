'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ApiResponse, AuthUser } from '@pm/shared';
import { SidePane } from '@/components/metro/SidePane';
import { api, ApiError } from '@/lib/api/client';
import { useAuth, useCurrentUser } from '@/lib/auth/AuthProvider';
import { roleLabel } from '@/lib/format';
import { btn, inputClass } from '@/lib/ui';

/** Your own profile (PATCH /me) and password (PUT /me/password). */
export function ProfilePane({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <SidePane open={open} onOpenChange={onOpenChange} title="Profile">
      {open && <ProfileForms />}
    </SidePane>
  );
}

function ProfileForms() {
  const user = useCurrentUser();
  const { updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setSavingProfile(true);
    try {
      const { data } = await api<ApiResponse<AuthUser>>('/me', { method: 'PATCH', body: { name, avatarUrl } });
      updateUser(data);
      toast.success('Profile saved');
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setSavingPassword(true);
    try {
      await api('/me/password', { method: 'PUT', body: { currentPassword, newPassword } });
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Password changed. Your other sessions were signed out.');
    } catch (err) {
      const fieldMessage =
        err instanceof ApiError && Array.isArray(err.details) ? (err.details as { message: string }[])[0]?.message : null;
      setPasswordError(fieldMessage ?? (err instanceof ApiError ? err.message : 'Could not change your password.'));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-10">
      <form onSubmit={saveProfile} className="space-y-5">
        <p className="text-sm text-muted">
          {user.email} · {roleLabel(user.role)}
          <br />
          Your email and role can only be changed by an administrator.
        </p>
        {profileError && <p className="text-danger" role="alert">{profileError}</p>}
        <label className="block">
          <span className="mb-1.5 block">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required className={inputClass()} />
        </label>
        <label className="block">
          <span className="mb-1.5 block">Avatar image URL (optional)</span>
          <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} type="url" className={inputClass()} />
        </label>
        <button type="submit" className={btn.primary} disabled={savingProfile || !name.trim()}>
          {savingProfile ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <form onSubmit={savePassword} className="space-y-5 border-t border-border-subtle pt-8">
        <h3 className="text-2xl font-light">Change password</h3>
        {passwordError && <p className="text-danger" role="alert">{passwordError}</p>}
        <label className="block">
          <span className="mb-1.5 block">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass()}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block">New password (at least 8 characters)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass()}
          />
        </label>
        <button type="submit" className={btn.primary} disabled={savingPassword || !currentPassword || newPassword.length < 8}>
          {savingPassword ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
