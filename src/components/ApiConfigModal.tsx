import React, { useState, useEffect } from 'react';
import { fetchWarera } from '../api/apiClient';
import { Key, Trash2, User, Settings, Check, X, Loader2, AlertCircle } from 'lucide-react';

async function searchUser(username: string, token: string) {
  // search.searchAnything hanya mengembalikan { userIds: [...] } — array ID,
  // bukan object user lengkap. Jadi kita ambil ID pertama (match terbaik),
  // lalu fetch profil lengkapnya lewat user.getUserById.
  const searchResult = await fetchWarera('search.searchAnything', { searchText: username }, token || null);
  if (!searchResult.success) throw new Error(searchResult.error || 'Gagal mencari pemain');

  const userId = searchResult.data?.userIds?.[0];
  if (!userId) throw new Error('User tidak ditemukan');

  const profileResult = await fetchWarera('user.getUserById', { userId }, token || null);
  if (!profileResult.success) throw new Error(profileResult.error || 'Gagal memuat profil');

  const user = profileResult.data;
  if (!user) throw new Error('Gagal memuat profil user');

  return user; // { _id, username, avatarUrl, ... }
}

interface ApiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ApiConfigModal({ isOpen, onClose }: ApiConfigModalProps) {
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [foundUser, setFoundUser] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      // Load data tersimpan
      try {
        const saved = JSON.parse(localStorage.getItem('warera_config') || '{}');
        setUsername(saved.username || '');
        setToken(saved.token || '');
        setFoundUser(saved.user || null);
      } catch (e) {
        // ignore
      }
      setStatus(null);
      setErrorMsg('');
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!username.trim()) {
      setErrorMsg('Username wajib diisi');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');
    setFoundUser(null);

    try {
      const user = await searchUser(username.trim(), token.trim());
      setFoundUser(user);

      // Simpan semua ke satu key
      localStorage.setItem('warera_config', JSON.stringify({
        username: user.username,
        userId: user._id,
        token: token.trim() || null,
        user,
      }));

      // Also set the token in global state/localStorage
      if (token.trim()) {
        localStorage.setItem('warera_api_token', token.trim());
      } else {
        localStorage.removeItem('warera_api_token');
      }

      setStatus('success');
      setTimeout(() => onClose(), 1000);

    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Gagal mencari user');
    }
  };

  const handleClear = () => {
    localStorage.removeItem('warera_config');
    localStorage.removeItem('warera_api_token');
    setUsername('');
    setToken('');
    setFoundUser(null);
    setStatus(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex justify-center items-start pt-[12vh] z-50 animate-fade-in">
      <div className="bg-[#0F1117] border border-emerald-500/30 rounded-xl p-6 w-full max-w-[440px] text-slate-100 shadow-2xl relative mx-4">
        
        {/* CLOSE BUTTON */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition duration-200"
        >
          <X className="w-5 h-5" />
        </button>

        {/* HEADER */}
        <div className="flex items-center gap-2.5 mb-6 pb-3 border-b border-slate-800">
          <Settings className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold tracking-tight text-white">
            WarEra API Companion Config
          </h3>
        </div>

        {/* FORM FIELD: USERNAME */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Username <span className="text-emerald-400 font-bold">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setStatus(null); }}
              placeholder="e.g. zxz"
              className="w-full bg-[#08090C] border border-slate-800 focus:border-emerald-500/50 rounded-lg py-2.5 pl-10 pr-4 text-slate-200 placeholder-slate-600 outline-none transition duration-200 text-sm"
            />
          </div>
          <span className="block text-[10px] text-slate-500 mt-1.5">
            Public username to load player profile & company structure
          </span>
        </div>

        {/* FORM FIELD: API TOKEN */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            API Key / Token <span className="text-slate-500 font-normal italic">(optional)</span>
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); setStatus(null); }}
              placeholder="Paste token from in-game settings..."
              className="w-full bg-[#08090C] border border-slate-800 focus:border-emerald-500/50 rounded-lg py-2.5 pl-10 pr-4 text-slate-200 placeholder-slate-600 outline-none transition duration-200 text-sm"
            />
          </div>
          <span className="block text-[10px] text-slate-500 mt-1.5">
            Required for secure/private endpoints like tracking transactions
          </span>
        </div>

        {/* FOUND USER PREVIEW */}
        {foundUser && status === 'success' && (
          <div className="mb-5 p-3.5 bg-emerald-950/20 border border-emerald-500/20 rounded-lg flex items-center gap-3 animate-fade-in">
            {foundUser.avatarUrl ? (
              <img src={foundUser.avatarUrl} alt="" className="w-9 h-9 rounded-full border border-emerald-500/20 object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-sm">
                {foundUser.username?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-white truncate">{foundUser.username}</div>
              <div className="text-[10px] text-slate-500 truncate">ID: {foundUser._id}</div>
            </div>
            <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold shrink-0">
              <Check className="w-4 h-4" />
              <span>Connected</span>
            </div>
          </div>
        )}

        {/* ERROR DISPLAY */}
        {status === 'error' && (
          <div className="mb-5 p-3 bg-rose-950/20 border border-rose-500/20 rounded-lg flex items-start gap-2.5 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-800/60">
          <button 
            onClick={handleClear} 
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-800 hover:border-red-900/40 hover:bg-red-950/20 text-slate-400 hover:text-red-400 rounded-lg transition duration-200 text-xs font-semibold cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={onClose} 
              className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition duration-200 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={status === 'loading'}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:text-slate-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition duration-200 text-xs cursor-pointer shadow-lg shadow-emerald-950/20"
            >
              {status === 'loading' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Save Connection'
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
