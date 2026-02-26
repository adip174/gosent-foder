import React, { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Save, ArrowLeft, FileText, Calendar, Activity, Printer, Edit, Trash2, Lock, User, Key, Wrench, BookOpen, Globe } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// --- SETUP FIREBASE CLOUD STORAGE ---
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, deleteDoc } from "firebase/firestore";

// Konfigurasi API Firebase

const localFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Mendeteksi apakah berjalan di Canvas Preview atau Lokal
const activeFirebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : localFirebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'gosent-foder-app';

const app = initializeApp(activeFirebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- KONSTANTA & DATA AWAL ---
const CURRENTS = Array.from({ length: 17 }, (_, i) => i * 10); // [0, 10, 20, ..., 160]

const STANDARD_POS = {
  0: 0, 10: 0, 20: 0.5, 30: 1.1, 40: 1.8, 50: 2.4, 60: 3.1, 70: 3.7, 
  80: 4.4, 90: 5.0, 100: 5.6, 110: 6.3, 120: 6.9, 130: 7.6, 140: 8.2, 
  150: 8.9, 160: 9.5
};

const STANDARD_ANGLE = {
  0: 0, 10: 0, 20: 1.5, 30: 3.4, 40: 5.4, 50: 7.3, 60: 9.2, 70: 11.1,
  80: 13.1, 90: 15.0, 100: 16.9, 110: 18.9, 120: 20.8, 130: 22.7, 140: 24.6,
  150: 26.6, 160: 28.5
};

const WIZARD_STEPS = [
  ...CURRENTS.map(c => ({ phase: 'INCREASE', ma: c, key: 'inc' })),
  ...[...CURRENTS].reverse().map(c => ({ phase: 'DECREASE', ma: c, key: 'dec' }))
];

const generateEmptyTest = () => {
  const testData = {};
  CURRENTS.forEach(c => {
    testData[c] = { incAngle: '', incPos: '', decAngle: '', decPos: '' };
  });
  return testData;
};

// Fungsi helper untuk generate data grafik
const generateChartData = (test1Data, test2Data) => {
  const data = [];
  
  CURRENTS.forEach(c => {
    data.push({
      current: c.toString(),
      test1: test1Data[c].incPos !== '' ? parseFloat(test1Data[c].incPos) : null,
      test2: test2Data[c].incPos !== '' ? parseFloat(test2Data[c].incPos) : null,
      standart: STANDARD_POS[c]
    });
  });

  const decCurrents = [...CURRENTS].reverse().slice(1);
  decCurrents.forEach(c => {
    data.push({
      current: c.toString(),
      test1: test1Data[c].decPos !== '' ? parseFloat(test1Data[c].decPos) : null,
      test2: test2Data[c].decPos !== '' ? parseFloat(test2Data[c].decPos) : null,
      standart: STANDARD_POS[c]
    });
  });

  return data;
};

const calculateSelisih = (incPos, decPos) => {
  const inc = parseFloat(incPos);
  const dec = parseFloat(decPos);
  if (!isNaN(inc) && !isNaN(dec)) {
    return Math.abs(inc - dec).toFixed(2);
  }
  return '-';
};

const generateNarrative = (t1, t2) => {
  const getVal = (t, curr, field) => parseFloat(t[curr][field]) || 0;
  
  const avgZeroPos = ((getVal(t1, 20, 'incPos') + getVal(t2, 20, 'incPos')) / 2);
  const avgZeroAng = ((getVal(t1, 20, 'incAngle') + getVal(t2, 20, 'incAngle')) / 2);
  const avgSpanPos = ((getVal(t1, 160, 'incPos') + getVal(t2, 160, 'incPos')) / 2);
  const avgSpanAng = ((getVal(t1, 160, 'incAngle') + getVal(t2, 160, 'incAngle')) / 2);

  const movingPos = (avgSpanPos - avgZeroPos) / 14;
  const movingAng = (avgSpanAng - avgZeroAng) / 14;

  const isZeroAngOk = avgZeroAng >= 1.23 && avgZeroAng <= 1.77;
  const isSpanAngOk = avgSpanAng >= 28.23 && avgSpanAng <= 28.77;
  const isMovingPosOk = movingPos >= 0.61 && movingPos <= 0.68;
  const isMovingAngOk = movingAng >= 1.83 && movingAng <= 2.03;

  let maxSelisih = 0;
  CURRENTS.forEach(c => {
    const s1 = parseFloat(calculateSelisih(t1[c].incPos, t1[c].decPos)) || 0;
    const s2 = parseFloat(calculateSelisih(t2[c].incPos, t2[c].decPos)) || 0;
    maxSelisih = Math.max(maxSelisih, s1, s2);
  });

  const status = (isZeroAngOk && isSpanAngOk && isMovingPosOk && isMovingAngOk) ? "NORMAL" : "PERLU PENGECEKAN/KALIBRASI";

  return `Berdasarkan hasil pengukuran dan standar operasional (Ref: Woodward Manual 36637):
- Titik Zero Angle (20 mA) : ${avgZeroAng.toFixed(2)}° (Tol: 1.23 - 1.77°) -> ${isZeroAngOk ? 'OK' : 'OUT RANGE'}
- Titik Span Angle (160 mA) : ${avgSpanAng.toFixed(2)}° (Tol: 28.23 - 28.77°) -> ${isSpanAngOk ? 'OK' : 'OUT RANGE'}
- Linearitas Posisi (Moving) : ${movingPos.toFixed(2)} Inch/Step (Tol: 0.61 - 0.68) -> ${isMovingPosOk ? 'OK' : 'OUT RANGE'}
- Linearitas Angle (Moving) : ${movingAng.toFixed(2)}°/Step (Tol: 1.83 - 2.03°) -> ${isMovingAngOk ? 'OK' : 'OUT RANGE'}
- Histeresis (Selisih Maks) : ${maxSelisih.toFixed(2)} Inch.

Kesimpulan: Karakteristik linearitas Governor dinyatakan ${status}.`;
};

// --- KOMPONEN LOGIN ---
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    // Keamanan Front-end dasar: Menggunakan Base64 encoding agar kredensial tidak terbaca langsung di source code biasa.
    // 'Z29zZW50' adalah hasil sandi dari 'gosent'
    // 'c3VwcGFiYW5na2l0' adalah hasil sandi dari 'suppabangkit'
    if (btoa(username) === 'Z29zZW50' && btoa(password) === 'c3VwcGFiYW5na2l0') {
      try { sessionStorage.setItem('gosent_auth', 'true'); } catch (e) {}
      onLogin();
    } else {
      setError('Username atau Password tidak valid!');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans text-slate-200">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 p-6 flex flex-col items-center border-b border-slate-700">
          <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mb-4 border border-blue-500/30">
            <Lock className="text-blue-500 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-wide">GOSENT FODER</h1>
          <p className="text-slate-400 text-sm mt-1">Sistem Database Pengujian Governor</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg text-sm text-center font-medium">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-400">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
                <input 
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Masukkan username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-400">Password</label>
              <div className="relative">
                <Key className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg mt-4 flex justify-center items-center gap-2"
            >
              <Lock size={18} /> Masuk Aplikasi
            </button>
          </form>
        </div>
      </div>
      <p className="text-slate-500 text-xs mt-8">
        &copy; {new Date().getFullYear()} PT PLN Nusantara Power Services
      </p>
    </div>
  );
}

// --- KOMPONEN UTAMA ---
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try { return sessionStorage.getItem('gosent_auth') === 'true'; } catch(e) { return false; }
  });
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'form' | 'report'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [records, setRecords] = useState([]);
  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // State untuk pencarian
  const [searchSN, setSearchSN] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 1. Inisialisasi Otentikasi Firebase
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Autentikasi gagal:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Fetch Data dari Firestore Real-time
  useEffect(() => {
    if (!user) return;

    // Membuat rujukan koneksi ke koleksi data di Cloud
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'governor_tests'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedRecords = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Urutkan dari yang terbaru (local sorting)
      loadedRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
      setRecords(loadedRecords);
    }, (error) => {
      console.error("Gagal mengambil data dari cloud:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Menyimpan record baru ke Cloud
  const handleSaveRecord = async (newRecord) => {
    if (!user) {
      console.error("Tidak terhubung ke server cloud. Mohon tunggu sesaat.");
      return;
    }

    setIsSaving(true);
    try {
      if (newRecord.id) {
        // Melakukan Update jika data sudah ada id-nya (Proses Edit)
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'governor_tests', newRecord.id);
        const dataToSave = { ...newRecord };
        delete dataToSave.id; // Jangan masukkan id ke dalam isi dokumen
        await updateDoc(docRef, dataToSave);
      } else {
        // Menyimpan data sebagai dokumen baru (Proses Create Baru)
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'governor_tests'), newRecord);
      }
      setView('dashboard');
    } catch (error) {
      console.error("Gagal menyimpan data:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRecord = (record) => {
    setEditingRecord(record);
    setView('form');
  };

  const handleDeleteRecord = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'governor_tests', id));
    } catch (error) {
      console.error("Gagal menghapus data:", error);
    }
  };

  const handleViewReport = (record) => {
    setSelectedRecord(record);
    setView('report');
  };

  // Filter Data di Dashboard
  const filteredRecords = useMemo(() => {
    return records.filter(rec => {
      const matchSN = rec.sn?.toLowerCase().includes(searchSN.toLowerCase());
      const matchStart = startDate ? new Date(rec.date) >= new Date(startDate) : true;
      const matchEnd = endDate ? new Date(rec.date) <= new Date(endDate) : true;
      return matchSN && matchStart && matchEnd;
    });
  }, [records, searchSN, startDate, endDate]);

  // Merender layar Login jika pengguna belum otentikasi
  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 font-sans text-slate-200">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 shadow-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={24} className="text-blue-400" />
            <h1 className="text-lg md:text-xl font-bold tracking-wide text-slate-100">GOSENT FODER</h1>
            <span className={`ml-3 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${user ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800' : 'bg-orange-900/40 text-orange-400 border-orange-800'}`}>
              {user ? 'Cloud Sync On' : 'Connecting...'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {view !== 'dashboard' && (
              <button 
                onClick={() => setView('dashboard')}
                className="flex items-center gap-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 md:px-4 rounded-lg transition whitespace-nowrap"
              >
                <ArrowLeft size={16} /> <span className="hidden sm:inline">Kembali ke Dashboard</span>
              </button>
            )}
            {view === 'dashboard' && (
              <button 
                onClick={() => {
                  try { sessionStorage.removeItem('gosent_auth'); } catch(e) {}
                  setIsAuthenticated(false);
                }}
                className="flex items-center gap-2 text-sm bg-slate-700 hover:bg-red-900/60 text-slate-300 hover:text-red-400 px-3 py-2 rounded-lg transition whitespace-nowrap border border-transparent hover:border-red-800"
                title="Keluar (Logout)"
              >
                <Lock size={16} /> <span className="hidden sm:inline">Logout</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 print:p-0 print:m-0">
        {view === 'dashboard' && (
          <Dashboard 
            records={filteredRecords}
            searchSN={searchSN} setSearchSN={setSearchSN}
            startDate={startDate} setStartDate={setStartDate}
            endDate={endDate} setEndDate={setEndDate}
            onNewTest={() => { setEditingRecord(null); setView('form'); }}
            onViewReport={handleViewReport}
            onEdit={handleEditRecord}
            onDelete={handleDeleteRecord}
            isLoading={!user && records.length === 0}
          />
        )}
        {view === 'form' && (
          <TestForm onSave={handleSaveRecord} onCancel={() => setView('dashboard')} isSaving={isSaving} initialData={editingRecord} />
        )}
        {view === 'report' && selectedRecord && (
          <ReportView record={selectedRecord} />
        )}
      </main>
    </div>
  );
}

// --- KOMPONEN DASHBOARD ---
function Dashboard({ records, searchSN, setSearchSN, startDate, setStartDate, endDate, setEndDate, onNewTest, onViewReport, onEdit, onDelete, isLoading }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const uniqueSNs = useMemo(() => {
    return Array.from(new Set(records.map(r => r.sn).filter(Boolean)));
  }, [records]);

  const filteredSuggestions = uniqueSNs.filter(sn => 
    sn.toLowerCase().includes(searchSN.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end border-b border-slate-700 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">GOSENT FODER - Database Pengujian</h2>
          <p className="text-slate-400 text-sm mt-1">Cari dan kelola riwayat pengujian. Semua data tersimpan di Cloud.</p>
        </div>
        <button 
          onClick={onNewTest}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg shadow-sm transition font-medium"
        >
          <Plus size={18} /> Data Baru
        </button>
      </div>

      {/* Filter Section */}
      <div className="bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-700 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Serial Number</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
            <input 
              type="text" 
              value={searchSN}
              onChange={(e) => setSearchSN(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Ketik S/N..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none placeholder-slate-500"
            />
            {/* Dropdown Auto-complete SN */}
            {showSuggestions && searchSN && filteredSuggestions.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filteredSuggestions.map((sn, idx) => (
                  <li 
                    key={idx}
                    onMouseDown={() => {
                      setSearchSN(sn);
                      setShowSuggestions(false);
                    }}
                    className="px-4 py-2 hover:bg-blue-600 cursor-pointer text-slate-200 transition-colors"
                  >
                    {sn}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Dari Tanggal</label>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Sampai Tanggal</label>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-700 border-b border-slate-600 text-slate-300 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Tanggal Uji</th>
                <th className="px-6 py-4">Governor S/N</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-slate-400">
                    <Activity size={32} className="mx-auto mb-3 text-blue-500 animate-spin" />
                    Menghubungkan ke Cloud & Memuat Data...
                  </td>
                </tr>
              ) : records.length > 0 ? (
                records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-700/50 transition">
                    <td className="px-6 py-4 flex items-center gap-2">
                      <Calendar size={16} className="text-slate-400" />
                      {new Date(rec.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 font-medium text-blue-400">{rec.sn}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-900/50 text-emerald-400 border border-emerald-800">
                        Selesai
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {deleteConfirmId === rec.id ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-xs text-red-400 font-medium">Hapus?</span>
                          <button onClick={() => { onDelete(rec.id); setDeleteConfirmId(null); }} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition shadow-sm">Ya</button>
                          <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded transition shadow-sm">Batal</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => onEdit(rec)} className="p-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded transition shadow-sm" title="Edit Data">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => setDeleteConfirmId(rec.id)} className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded transition shadow-sm" title="Hapus Data">
                            <Trash2 size={14} />
                          </button>
                          <button 
                            onClick={() => onViewReport(rec)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition text-xs font-semibold shadow-sm"
                            title="Cetak PDF"
                          >
                            <Printer size={14} /> Cetak
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-slate-500">
                    <FileText size={32} className="mx-auto mb-3 text-slate-600" />
                    Tidak ada data pengujian di Database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- KOMPONEN FORM PENGUJIAN ---
function TestForm({ onSave, onCancel, isSaving, initialData }) {
  const [formData, setFormData] = useState({
    date: initialData?.date || new Date().toISOString().split('T')[0],
    sn: initialData?.sn || '',
    pressOil: initialData?.pressOil || '',
    conclusion: initialData?.conclusion || ''
  });

  const [test1Data, setTest1Data] = useState(initialData?.test1 || generateEmptyTest());
  const [test2Data, setTest2Data] = useState(initialData?.test2 || generateEmptyTest());
  const [activeTab, setActiveTab] = useState('TEST1');
  const [errorMsg, setErrorMsg] = useState('');
  const [activeInfoTab, setActiveInfoTab] = useState('woodward'); // State untuk tab info

  // State untuk Pop-up Wizard
  const [wizardConfig, setWizardConfig] = useState({ isOpen: false, stepIndex: 0 });

  const handleOpenWizard = () => {
    setWizardConfig({ isOpen: true, stepIndex: 0 });
  };

  const handleCloseWizard = () => {
    setWizardConfig({ ...wizardConfig, isOpen: false });
  };

  const handleWizardNext = () => {
    if (wizardConfig.stepIndex < WIZARD_STEPS.length - 1) {
      setWizardConfig(prev => ({ ...prev, stepIndex: prev.stepIndex + 1 }));
    } else {
      handleCloseWizard(); // Otomatis menutup saat sudah selesai step terakhir
    }
  };

  const handleWizardPrev = () => {
    if (wizardConfig.stepIndex > 0) {
      setWizardConfig(prev => ({ ...prev, stepIndex: prev.stepIndex - 1 }));
    }
  };

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      conclusion: generateNarrative(test1Data, test2Data)
    }));
  }, [test1Data, test2Data]);

  const handleMetaChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleTestDataChange = (testType, current, field, value) => {
    const sanitizedValue = value.replace(',', '.');
    if (sanitizedValue !== '' && isNaN(sanitizedValue) && sanitizedValue !== '.' && sanitizedValue !== '-') return;
    
    if (testType === 'TEST1') {
      setTest1Data(prev => ({
        ...prev,
        [current]: { ...prev[current], [field]: sanitizedValue }
      }));
    } else {
      setTest2Data(prev => ({
        ...prev,
        [current]: { ...prev[current], [field]: sanitizedValue }
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.sn || !formData.date) {
        setErrorMsg("S/N dan Tanggal wajib diisi!");
        return;
    }
    setErrorMsg('');
    
    const newRecord = {
      ...(initialData?.id ? { id: initialData.id } : {}),
      ...formData,
      test1: test1Data,
      test2: test2Data
    };
    onSave(newRecord);
  };

  const chartData = useMemo(() => generateChartData(test1Data, test2Data), [test1Data, test2Data]);

  const renderTable = (testType, dataState) => (
    <div className="overflow-x-auto border border-slate-600 rounded-lg bg-slate-800">
      <table className="w-full text-sm text-center">
        <thead className="bg-slate-700 text-slate-200 font-semibold border-b border-slate-600">
          <tr>
            <th rowSpan="2" className="p-3 border-r border-slate-600 align-middle">Current<br/>(mA)</th>
            <th colSpan="2" className="p-2 border-r border-slate-600 text-blue-400 bg-blue-900/20">INCREASE (Naik)</th>
            <th colSpan="2" className="p-2 border-r border-slate-600 text-orange-400 bg-orange-900/20">DECREASE (Turun)</th>
            <th rowSpan="2" className="p-3 align-middle">Selisih<br/>Posisi</th>
          </tr>
          <tr>
            <th className="p-2 border-t border-r border-slate-600 bg-blue-900/10">Angle (')</th>
            <th className="p-2 border-t border-r border-slate-600 bg-blue-900/10">Pos (0-10)</th>
            <th className="p-2 border-t border-r border-slate-600 bg-orange-900/10">Angle (')</th>
            <th className="p-2 border-t border-r border-slate-600 bg-orange-900/10">Pos (0-10)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {CURRENTS.map((current) => (
            <tr key={current} className={`transition-colors ${(current === 20 || current === 160) ? 'bg-slate-500/40' : 'hover:bg-slate-700/50'}`}>
              <td className="p-2 font-bold bg-slate-800/50 border-r border-slate-700 text-slate-300">{current}</td>
              {/* Increase */}
              <td className="p-1 border-r border-slate-700">
                <input 
                  type="text" 
                  title={`Standar Angle: ${STANDARD_ANGLE[current]}°`}
                  value={dataState[current].incAngle}
                  onChange={(e) => handleTestDataChange(testType, current, 'incAngle', e.target.value)}
                  className="w-full text-center py-1.5 px-2 bg-transparent focus:bg-slate-900 text-slate-200 border-transparent focus:border-blue-500 rounded focus:ring-0 outline-none"
                  placeholder="0.00"
                />
              </td>
              <td className="p-1 border-r border-slate-700 bg-blue-900/10">
                <input 
                  type="text" 
                  title={`Standar Posisi: ${STANDARD_POS[current]}`}
                  value={dataState[current].incPos}
                  onChange={(e) => handleTestDataChange(testType, current, 'incPos', e.target.value)}
                  className="w-full text-center py-1.5 px-2 bg-transparent focus:bg-slate-900 text-slate-200 border-transparent focus:border-blue-500 rounded focus:ring-0 outline-none font-medium"
                  placeholder="0.00"
                />
              </td>
              {/* Decrease */}
              <td className="p-1 border-r border-slate-700">
                <input 
                  type="text" 
                  title={`Standar Angle: ${STANDARD_ANGLE[current]}°`}
                  value={dataState[current].decAngle}
                  onChange={(e) => handleTestDataChange(testType, current, 'decAngle', e.target.value)}
                  className="w-full text-center py-1.5 px-2 bg-transparent focus:bg-slate-900 text-slate-200 border-transparent focus:border-orange-500 rounded focus:ring-0 outline-none"
                  placeholder="0.00"
                />
              </td>
              <td className="p-1 border-r border-slate-700 bg-orange-900/10">
                <input 
                  type="text" 
                  title={`Standar Posisi: ${STANDARD_POS[current]}`}
                  value={dataState[current].decPos}
                  onChange={(e) => handleTestDataChange(testType, current, 'decPos', e.target.value)}
                  className="w-full text-center py-1.5 px-2 bg-transparent focus:bg-slate-900 text-slate-200 border-transparent focus:border-orange-500 rounded focus:ring-0 outline-none font-medium"
                  placeholder="0.00"
                />
              </td>
              {/* Selisih */}
              <td className="p-2 font-semibold text-slate-400 bg-slate-800/30">
                {calculateSelisih(dataState[current].incPos, dataState[current].decPos)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errorMsg && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg text-sm flex items-center shadow-sm">
          <span className="font-bold mr-2">Peringatan:</span> {errorMsg}
        </div>
      )}

      {/* Header Info */}
      <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700">
        <h2 className="text-xl font-bold text-slate-100 mb-4 pb-2 border-b border-slate-700">Informasi Pengujian</h2>
        
        {/* Info Tools & Standar (Interactive Tabs) */}
        <div className="mb-6 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-sm">
          {/* Tab Navigation */}
          <div className="flex overflow-x-auto border-b border-slate-700 bg-slate-900/50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button 
              type="button"
              onClick={() => setActiveInfoTab('woodward')} 
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${activeInfoTab === 'woodward' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
            >
              <BookOpen size={16} /> Standar Woodward
            </button>
            <button 
              type="button"
              onClick={() => setActiveInfoTab('ieee')} 
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${activeInfoTab === 'ieee' ? 'text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
            >
              <Globe size={16} /> Standar Internasional
            </button>
            <button 
              type="button"
              onClick={() => setActiveInfoTab('tools')} 
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${activeInfoTab === 'tools' ? 'text-orange-400 border-b-2 border-orange-500 bg-orange-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
            >
              <Wrench size={16} /> Tools Pengujian
            </button>
          </div>
          
          {/* Tab Content */}
          <div className="p-5">
            {activeInfoTab === 'woodward' && (
              <div className="animate-in fade-in duration-300">
                <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700">
                    <div className="divide-y divide-slate-700">
                      <div className="flex justify-between p-3 hover:bg-slate-800/50 transition-colors"><span className="text-slate-400">Zero (20 mA)</span> <strong className="text-slate-100">Angle 1.5° | Pos 0.5"</strong></div>
                      <div className="flex justify-between p-3 hover:bg-slate-800/50 transition-colors"><span className="text-slate-400">Span (160 mA)</span> <strong className="text-slate-100">Angle 28.5° | Pos 9.5"</strong></div>
                      <div className="flex justify-between p-3 hover:bg-slate-800/50 transition-colors"><span className="text-slate-400">Tol. Zero Angle</span> <strong className="text-slate-100">1.23° - 1.77°</strong></div>
                      <div className="flex justify-between p-3 hover:bg-slate-800/50 transition-colors"><span className="text-slate-400">Tol. Span Angle</span> <strong className="text-slate-100">28.23° - 28.77°</strong></div>
                    </div>
                    <div className="divide-y divide-slate-700">
                      <div className="flex justify-between p-3 hover:bg-slate-800/50 transition-colors"><span className="text-slate-400">Linearitas Posisi</span> <strong className="text-slate-100">0.61 - 0.68"/Step</strong></div>
                      <div className="flex justify-between p-3 hover:bg-slate-800/50 transition-colors"><span className="text-slate-400">Linearitas Angle</span> <strong className="text-slate-100">1.83 - 2.03°/Step</strong></div>
                      <div className="flex justify-between p-3 hover:bg-slate-800/50 transition-colors"><span className="text-slate-400">Press Oil Gauge</span> <strong className="text-slate-100">230 - 240 psi</strong></div>
                      <div className="flex justify-between p-3 hover:bg-slate-800/50 transition-colors"><span className="text-slate-400">Injector Range</span> <strong className="text-slate-100">0 - 200 mA</strong></div>
                    </div>
                  </div>
                </div>
                <div className="text-blue-400 text-xs mt-3 flex items-center gap-1.5 font-medium">
                  <Activity size={14} /> * Toleransi Histeresis Maksimal 3% sesuai spesifikasi pabrikan (Manual 36637).
                </div>
              </div>
            )}
            
            {activeInfoTab === 'ieee' && (
              <div className="animate-in fade-in duration-300">
                <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden text-sm divide-y divide-slate-700">
                  <div className="p-4 hover:bg-slate-800/50 transition-colors">
                    <strong className="text-emerald-400 flex items-center gap-2 mb-1"><Globe size={16} /> IEEE Std 125-2007</strong>
                    <p className="text-slate-400 text-xs leading-relaxed">Recommended Practice for Preparation of Equipment Specifications for Speed-Governing of Hydraulic Turbines. Digunakan sebagai acuan validasi respons waktu dan batas histeresis mekanik.</p>
                  </div>
                  <div className="p-4 hover:bg-slate-800/50 transition-colors">
                    <strong className="text-emerald-400 flex items-center gap-2 mb-1"><Globe size={16} /> IEC 61362:2012</strong>
                    <p className="text-slate-400 text-xs leading-relaxed">Guide to specification of hydraulic turbine control systems. Mengatur pedoman pengujian linearitas transducer, closed-loop performance, dan deadband governor.</p>
                  </div>
                </div>
              </div>
            )}

            {activeInfoTab === 'tools' && (
              <div className="animate-in fade-in duration-300">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 flex flex-col items-center justify-center text-center gap-2 hover:border-orange-500/50 transition-colors">
                    <div className="bg-slate-800 p-3 rounded-full text-orange-400"><Activity size={24}/></div>
                    <span className="font-semibold text-slate-200 text-xs">Gosent Foder</span>
                  </div>
                  <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 flex flex-col items-center justify-center text-center gap-2 hover:border-orange-500/50 transition-colors">
                    <div className="bg-slate-800 p-3 rounded-full text-orange-400"><Activity size={24}/></div>
                    <span className="font-semibold text-slate-200 text-xs">Pressure Gauge</span>
                  </div>
                  <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 flex flex-col items-center justify-center text-center gap-2 hover:border-orange-500/50 transition-colors">
                    <div className="bg-slate-800 p-3 rounded-full text-orange-400"><Activity size={24}/></div>
                    <span className="font-semibold text-slate-200 text-xs">Multimeter Kalibrasi</span>
                  </div>
                  <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 flex flex-col items-center justify-center text-center gap-2 hover:border-orange-500/50 transition-colors">
                    <div className="bg-slate-800 p-3 rounded-full text-orange-400"><Activity size={24}/></div>
                    <span className="font-semibold text-slate-200 text-xs">Current Injector</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-400 mb-2">Tanggal</label>
            <input 
              type="date" name="date" required
              value={formData.date} onChange={handleMetaChange}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-400 mb-2">Governor S/N</label>
            <input 
              type="text" name="sn" required
              value={formData.sn} onChange={handleMetaChange}
              placeholder="Contoh: 11502243"
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none placeholder-slate-600"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-400 mb-2">Press Oil (psi)</label>
            <input 
              type="number" name="pressOil" 
              value={formData.pressOil} onChange={handleMetaChange}
              placeholder="Contoh: 230"
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none placeholder-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Tabs for Test 1 & Test 2 */}
      <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
        <div className="flex border-b border-slate-700 bg-slate-900 justify-between items-center pr-4">
          <div className="flex flex-1">
            <button
              type="button"
              className={`flex-1 py-4 font-bold text-center transition-colors ${activeTab === 'TEST1' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
              onClick={() => setActiveTab('TEST1')}
            >
              TEST 1
            </button>
            <button
              type="button"
              className={`flex-1 py-4 font-bold text-center transition-colors ${activeTab === 'TEST2' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
              onClick={() => setActiveTab('TEST2')}
            >
              TEST 2
            </button>
          </div>
          <button
            type="button"
            onClick={handleOpenWizard}
            className="ml-4 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg shadow-sm transition font-medium text-sm"
          >
            <Activity size={16} /> Isi via Pop-up
          </button>
        </div>
        
        <div className="p-6">
          <div className="mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <p className="text-sm text-slate-400">Isi data pada kolom yang tersedia. Nilai desimal dapat menggunakan koma atau titik. Kolom "Selisih" akan dihitung otomatis.</p>
            <span className="text-xs font-medium text-blue-400 bg-blue-900/20 px-3 py-1.5 rounded-full border border-blue-800 flex items-center gap-1.5">
              💡 Arahkan kursor ke kolom untuk melihat nilai standar
            </span>
          </div>
          {activeTab === 'TEST1' ? renderTable('TEST1', test1Data) : renderTable('TEST2', test2Data)}
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700 mt-6">
        <h3 className="text-lg font-bold mb-6 text-slate-100 flex items-center gap-2">
          <Activity size={20} className="text-blue-400"/>
          Grafik Karakteristik (Current vs Position)
        </h3>
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 20, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="current" 
                stroke="#94a3b8" 
                tick={{ fill: '#94a3b8' }}
                label={{ value: 'Current (mA)', position: 'insideBottom', offset: -15, fill: '#94a3b8' }}
              />
              <YAxis 
                stroke="#94a3b8" 
                tick={{ fill: '#94a3b8' }}
                domain={[0, 10]}
                label={{ value: 'Position', angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8' }}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f8fafc', borderRadius: '8px' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend verticalAlign="top" height={36}/>
              <Line 
                type="monotone" 
                dataKey="standart" 
                name="Standart" 
                stroke="#10b981" 
                strokeDasharray="5 5"
                strokeWidth={2} 
                dot={false} 
                activeDot={{ r: 4 }} 
                connectNulls 
              />
              <Line 
                type="monotone" 
                dataKey="test1" 
                name="POS 1 (Test 1)" 
                stroke="#f97316" 
                strokeWidth={2} 
                dot={{ r: 4, fill: '#f97316' }} 
                activeDot={{ r: 6 }} 
                connectNulls 
              />
              <Line 
                type="monotone" 
                dataKey="test2" 
                name="POS 2 (Test 2)" 
                stroke="#0ea5e9" 
                strokeWidth={2} 
                dot={{ r: 4, fill: '#0ea5e9' }} 
                activeDot={{ r: 6 }} 
                connectNulls 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Kesimpulan Section */}
      <div className="bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-700 mt-6">
        <h3 className="text-lg font-bold mb-4 text-slate-100 flex items-center gap-2">
          <FileText size={20} className="text-emerald-400"/>
          Kesimpulan Pengukuran
        </h3>
        <textarea 
          name="conclusion"
          value={formData.conclusion}
          onChange={handleMetaChange}
          rows={7}
          className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none placeholder-slate-500 leading-relaxed resize-y font-mono text-sm"
        ></textarea>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-4 mt-8 bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-700">
        <button 
          type="button" 
          onClick={onCancel}
          disabled={isSaving}
          className="px-6 py-2.5 rounded-lg font-semibold text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
        >
          Batal
        </button>
        <button 
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-lg shadow-md transition font-semibold disabled:opacity-50"
        >
          {isSaving ? <Activity className="animate-spin" size={18} /> : <Save size={18} />} 
          {isSaving ? 'Menyimpan ke Cloud...' : 'Simpan Data Pengujian'}
        </button>
      </div>

      {/* Modal Pop-up Wizard Step-by-Step */}
      {wizardConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-slate-900 p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Activity size={18} className="text-blue-400" /> 
                Pengisian Data {activeTab}
              </h3>
              <span className="text-sm font-medium text-slate-400">
                Step {wizardConfig.stepIndex + 1} dari {WIZARD_STEPS.length}
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="h-1.5 w-full bg-slate-700">
              <div 
                className="h-full bg-blue-500 transition-all duration-300" 
                style={{ width: `${((wizardConfig.stepIndex + 1) / WIZARD_STEPS.length) * 100}%` }}
              ></div>
            </div>

            {/* Body */}
            <div className="p-6 flex-1">
              <div className="text-center mb-8">
                <div className={`inline-block px-4 py-1 rounded-full text-sm font-bold mb-3 uppercase tracking-wide ${WIZARD_STEPS[wizardConfig.stepIndex].phase === 'INCREASE' ? 'bg-blue-900/50 text-blue-400 border border-blue-800' : 'bg-orange-900/50 text-orange-400 border border-orange-800'}`}>
                  Siklus {WIZARD_STEPS[wizardConfig.stepIndex].phase} (Naik/Turun)
                </div>
                <h4 className="text-5xl font-extrabold text-slate-100">
                  {WIZARD_STEPS[wizardConfig.stepIndex].ma} <span className="text-2xl text-slate-400 font-semibold">mA</span>
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Input Angle */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-400">Angle (')</label>
                  <input 
                    type="text"
                    autoFocus
                    value={activeTab === 'TEST1' 
                      ? test1Data[WIZARD_STEPS[wizardConfig.stepIndex].ma][`${WIZARD_STEPS[wizardConfig.stepIndex].key}Angle`] 
                      : test2Data[WIZARD_STEPS[wizardConfig.stepIndex].ma][`${WIZARD_STEPS[wizardConfig.stepIndex].key}Angle`]}
                    onChange={(e) => handleTestDataChange(
                      activeTab, 
                      WIZARD_STEPS[wizardConfig.stepIndex].ma, 
                      `${WIZARD_STEPS[wizardConfig.stepIndex].key}Angle`, 
                      e.target.value
                    )}
                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                    className="w-full text-center py-3 px-4 bg-slate-900 text-slate-100 border border-slate-600 focus:border-blue-500 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xl font-medium"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-center text-slate-500">Standar: <span className="text-emerald-400 font-semibold">{STANDARD_ANGLE[WIZARD_STEPS[wizardConfig.stepIndex].ma]}°</span></p>
                </div>

                {/* Input Posisi */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-400">Position (0-10)</label>
                  <input 
                    type="text"
                    value={activeTab === 'TEST1' 
                      ? test1Data[WIZARD_STEPS[wizardConfig.stepIndex].ma][`${WIZARD_STEPS[wizardConfig.stepIndex].key}Pos`] 
                      : test2Data[WIZARD_STEPS[wizardConfig.stepIndex].ma][`${WIZARD_STEPS[wizardConfig.stepIndex].key}Pos`]}
                    onChange={(e) => handleTestDataChange(
                      activeTab, 
                      WIZARD_STEPS[wizardConfig.stepIndex].ma, 
                      `${WIZARD_STEPS[wizardConfig.stepIndex].key}Pos`, 
                      e.target.value
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleWizardNext();
                      }
                    }}
                    className="w-full text-center py-3 px-4 bg-slate-900 text-slate-100 border border-slate-600 focus:border-blue-500 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xl font-medium"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-center text-slate-500">Standar: <span className="text-emerald-400 font-semibold">{STANDARD_POS[WIZARD_STEPS[wizardConfig.stepIndex].ma]}</span></p>
                </div>
              </div>
              <p className="text-center text-slate-500 text-xs mt-6">💡 Tekan <kbd className="font-mono font-bold text-slate-300">Enter</kbd> pada kolom Position untuk lanjut ke step berikutnya.</p>
            </div>

            {/* Footer Actions */}
            <div className="bg-slate-900 p-4 border-t border-slate-700 flex justify-between items-center">
              <button 
                type="button"
                onClick={handleCloseWizard}
                className="text-sm font-medium text-slate-400 hover:text-slate-200 transition"
              >
                Tutup Pop-up
              </button>
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={handleWizardPrev}
                  disabled={wizardConfig.stepIndex === 0}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-lg text-sm font-semibold transition"
                >
                  Sebelumnya
                </button>
                <button 
                  type="button"
                  onClick={handleWizardNext}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition shadow-md"
                >
                  {wizardConfig.stepIndex === WIZARD_STEPS.length - 1 ? 'Selesai' : 'Selanjutnya'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// --- KOMPONEN LAPORAN (UNTUK PRINT / PDF) ---
function ReportView({ record }) {
  const chartData = useMemo(() => generateChartData(record.test1, record.test2), [record]);

  const renderPrintTable = (title, dataState) => (
    <div className="mb-8 break-inside-avoid">
      <h3 className="font-bold text-lg mb-2 text-slate-900 border-b-2 border-slate-300 pb-1">{title}</h3>
      <table className="w-full text-sm text-center border-collapse border border-slate-400">
        <thead className="bg-slate-100 text-slate-900 font-semibold">
          <tr>
            <th rowSpan="2" className="p-2 border border-slate-400 align-middle">Current<br/>(mA)</th>
            <th colSpan="2" className="p-1 border border-slate-400">INCREASE</th>
            <th colSpan="2" className="p-1 border border-slate-400">DECREASE</th>
            <th rowSpan="2" className="p-2 border border-slate-400 align-middle">Selisih<br/>Posisi</th>
          </tr>
          <tr>
            <th className="p-1 border border-slate-400">Angle (')</th>
            <th className="p-1 border border-slate-400">Pos</th>
            <th className="p-1 border border-slate-400">Angle (')</th>
            <th className="p-1 border border-slate-400">Pos</th>
          </tr>
        </thead>
        <tbody className="text-slate-800">
          {CURRENTS.map((current) => (
            <tr key={current} className={(current === 20 || current === 160) ? 'bg-slate-300' : ''}>
              <td className="p-1 border border-slate-400 font-semibold bg-slate-50">{current}</td>
              <td className="p-1 border border-slate-400">{dataState[current].incAngle || '-'}</td>
              <td className="p-1 border border-slate-400 font-medium">{dataState[current].incPos || '-'}</td>
              <td className="p-1 border border-slate-400">{dataState[current].decAngle || '-'}</td>
              <td className="p-1 border border-slate-400 font-medium">{dataState[current].decPos || '-'}</td>
              <td className="p-1 border border-slate-400 font-medium bg-slate-50">
                {calculateSelisih(dataState[current].incPos, dataState[current].decPos)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="bg-slate-100 min-h-screen text-slate-900 p-4 md:p-8 rounded shadow-sm relative flex flex-col items-center">
      {/* Tombol Print */}
      <div className="w-full max-w-4xl flex justify-end items-center mb-4 print:hidden gap-4">
        <span className="text-sm text-slate-600 bg-white px-3 py-1.5 rounded-md shadow-sm border border-slate-200 hidden md:block">
          💡 Tekan <kbd className="font-mono font-bold">Ctrl + P</kbd> / <kbd className="font-mono font-bold">Cmd + P</kbd> jika tombol ini diblokir browser.
        </span>
        <button 
          onClick={() => window.print()}
          className="flex items-center gap-2 text-white px-6 py-2.5 rounded-lg shadow-md font-bold transition bg-blue-600 hover:bg-blue-700"
        >
          <Printer size={18} /> Cetak / Unduh PDF
        </button>
      </div>

      {/* Konten yang akan diubah ke PDF */}
      <div id="report-content" className="bg-white p-8 w-full max-w-4xl shadow-lg border border-slate-200">
        {/* Header Dokumen Laporan */}
        <div className="border-b-4 border-slate-800 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-900">Testing of Governor</h1>
              <p className="text-lg font-semibold text-slate-700 mt-1">PT PLN NUSANTARA POWER SERVICES</p>
            </div>
            <div className="text-right text-sm border border-slate-300 p-2 rounded bg-slate-50 mt-2">
              <p><span className="font-semibold">Tanggal:</span> {new Date(record.date).toLocaleDateString('id-ID')}</p>
              <p><span className="font-semibold">S/N:</span> {record.sn}</p>
              <p><span className="font-semibold">Press Oil:</span> {record.pressOil || '-'} psi</p>
            </div>
          </div>
          
          {/* Info Tools & Standar (Print View) */}
          <div className="flex flex-col md:flex-row gap-6 mt-4 p-4 bg-slate-50 border border-slate-300 rounded text-sm">
            <div className="flex-1">
              <span className="font-bold underline mb-2 block">Tools & Referensi:</span>
              <ul className="list-disc list-outside ml-4 text-slate-800 space-y-1 text-xs mb-3">
                <li>Gosent Foder, Pres. Gauge, Multimeter, Current Injector</li>
              </ul>
              <span className="font-bold underline mb-1 block text-xs">Standar Internasional:</span>
              <ul className="list-disc list-outside ml-4 text-slate-800 space-y-1 text-[10px]">
                <li><span className="font-semibold">IEEE Std 125-2007:</span> Hydro Turbine Speed-Governing</li>
                <li><span className="font-semibold">IEC 61362:2012:</span> Hydraulic Turbine Control Systems</li>
              </ul>
            </div>
            <div className="flex-[2]">
              <span className="font-bold underline mb-2 block">Standart Operasional (Ref: Woodward Manual 36637):</span>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-800 text-xs bg-white p-2 border border-slate-200 rounded">
                <div>• Zero (20 mA) = Angle 1.5° | Pos 0.5"</div>
                <div>• Span (160 mA) = Angle 28.5° | Pos 9.5"</div>
                <div>• Tol. Zero Angle = 1.23° - 1.77°</div>
                <div>• Tol. Span Angle = 28.23° - 28.77°</div>
                <div>• Tol. Linearitas Pos = 0.61 - 0.68"/Step</div>
                <div>• Tol. Linearitas Angle = 1.83 - 2.03°/Step</div>
                <div>• Press Oil Gauge = 230 - 240 psi</div>
                <div>• Injector Range = 0 - 200 mA</div>
                <div className="col-span-2 font-semibold mt-1 text-slate-600 border-t pt-1">* Toleransi Histeresis Maksimal 3% sesuai spesifikasi pabrikan.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Grafik */}
        <div className="mb-8 break-inside-avoid border border-slate-300 p-4 rounded bg-slate-50">
          <h3 className="font-bold text-center mb-4 text-lg">GRAFIK KARAKTERISTIK (CURRENT vs POSITION)</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <XAxis 
                  dataKey="current" 
                  stroke="#475569" 
                  tick={{ fill: '#0f172a' }}
                  label={{ value: 'Current (mA)', position: 'insideBottom', offset: -15, fill: '#0f172a' }}
                />
                <YAxis 
                  stroke="#475569" 
                  tick={{ fill: '#0f172a' }}
                  domain={[0, 10]}
                  label={{ value: 'Position', angle: -90, position: 'insideLeft', offset: -5, fill: '#0f172a' }}
                />
                <Legend verticalAlign="top" height={36}/>
                <Line isAnimationActive={false} type="monotone" dataKey="standart" name="Standart" stroke="#10b981" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="test1" name="POS 1 (Test 1)" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} />
                <Line isAnimationActive={false} type="monotone" dataKey="test2" name="POS 2 (Test 2)" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabel Data */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {renderPrintTable('DATA TEST 1', record.test1)}
          {renderPrintTable('DATA TEST 2', record.test2)}
        </div>

        {/* Kesimpulan Section */}
        <div className="mt-8 p-5 border-2 border-slate-800 bg-white rounded break-inside-avoid shadow-sm">
          <h3 className="font-bold text-lg mb-2 underline uppercase text-slate-900">Kesimpulan</h3>
          <p className="whitespace-pre-line text-slate-800 font-medium leading-relaxed font-mono text-sm">
            {record.conclusion}
          </p>
        </div>

        {/* Footer Laporan */}
        <div className="mt-8 pt-4 border-t border-slate-300 text-sm text-center text-slate-500 break-inside-avoid">
          <p>Dokumen ini di-generate secara otomatis dari Sistem Pengujian Governor.</p>
        </div>
      </div>
    </div>
  );
}