import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { 
  Car, 
  User, 
  History, 
  PlusCircle, 
  AlertTriangle, 
  CheckCircle, 
  Wrench, 
  Trash2, 
  Edit2, 
  Save, 
  X 
} from 'lucide-react';

// --- CONFIGURATION ---
const PIN_CODE = "6538";

const CARS = [
  "6663 Dzire",
  "8333 Ertiga",
  "4442 Ertiga",
  "2220 Ertiga",
  "2220 Crysta"
];

const DRIVERS = [
  "Sulfiker", 
  "Ali", 
  "Fazil", 
  "Maheen", 
  "Anzad", 
  "Sinaj", 
  "Fareed"
];

const SERVICE_INTERVAL = 10000;
const ALIGNMENT_INTERVAL = 5000;

// --- FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: "AIzaSyB9brdInU-gWKyap4iPN6syGeInwQdafR8",
  authDomain: "car-care-fleet.firebaseapp.com",
  projectId: "car-care-fleet",
  storageBucket: "car-care-fleet.firebasestorage.app",
  messagingSenderId: "674160245116",
  appId: "1:674160245116:web:1c88306338b6c803298cf9",
  measurementId: "G-T0FFMTC7F0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- COMPONENTS ---

// 1. PIN Modal Component (Dark Theme)
const PinModal = ({ isOpen, onClose, onSuccess, title = "Enter PIN" }) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin === PIN_CODE) {
      onSuccess();
      setPin("");
      setError(false);
      onClose();
    } else {
      setError(true);
      setPin("");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
      <div className="bg-gray-900 border border-yellow-600/50 rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <h3 className="text-2xl font-bold text-yellow-500 mb-6 text-center">{title}</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full text-center text-4xl tracking-widest p-4 bg-gray-800 border-2 border-gray-700 text-white rounded-xl focus:border-yellow-500 outline-none mb-6 placeholder-gray-600"
            placeholder="••••"
            autoFocus
          />
          {error && <p className="text-red-400 text-center mb-6 text-lg">Incorrect PIN</p>}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 text-gray-400 font-semibold hover:bg-gray-800 rounded-xl text-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-4 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 text-lg shadow-[0_0_15px_rgba(234,179,8,0.3)]"
            >
              Verify
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// 2. Status Badge Helper (Dark Theme)
const StatusBadge = ({ current, last, interval, type }) => {
  const diff = current - (last || 0);
  const isOverdue = diff >= interval;
  const dueIn = interval - diff;

  // Dark theme colors: Green text for good, Red text for bad
  const statusClasses = isOverdue 
    ? "bg-red-900/20 text-red-400 border-red-900/50" 
    : "bg-green-900/20 text-green-400 border-green-900/50";
  
  const icon = isOverdue ? <AlertTriangle size={18} /> : <CheckCircle size={18} />;

  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${statusClasses} text-sm font-medium`}>
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-base">{type}</span>
      </div>
      <div className="text-right">
        {isOverdue ? (
          <span className="font-bold text-red-400">Overdue {diff - interval} km</span>
        ) : (
          <span className="text-gray-300">Due in {dueIn} km</span>
        )}
      </div>
    </div>
  );
};

// 3. Main App Component
export default function CarCareApp() {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard'); // dashboard, entry, history
  
  // Form State
  const [selectedCar, setSelectedCar] = useState(CARS[0]);
  const [selectedDriver, setSelectedDriver] = useState(DRIVERS[0]);
  const [odometer, setOdometer] = useState("");
  const [passengerKm, setPassengerKm] = useState("");
  const [isAlignment, setIsAlignment] = useState(false);
  const [isService, setIsService] = useState(false);
  
  // Pin & Edit State
  const [pinModal, setPinModal] = useState({ open: false, action: null });
  const [editingId, setEditingId] = useState(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // --- DATA SYNC ---
  useEffect(() => {
    if (!user) return;
    
    // Using strict path as per rules
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'car_logs'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort in memory (Rule 2: No complex queries)
      // Sort by Odometer Descending (highest first)
      data.sort((a, b) => b.odometer - a.odometer);
      setLogs(data);
      setLoading(false);
    }, (error) => {
      console.error("Data fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // --- DERIVED DATA (Dashboard Stats) ---
  const carStats = useMemo(() => {
    const stats = {};
    
    CARS.forEach(car => {
      // Get all logs for this car
      const carLogs = logs.filter(l => l.car === car);
      
      // Since logs are sorted desc by odometer, the first one is current
      const currentLog = carLogs[0];
      const currentOdo = currentLog ? currentLog.odometer : 0;
      
      // Find last service/alignment events
      // We look for the *highest* odometer reading where service was done
      const lastServiceLog = carLogs.find(l => l.service);
      const lastAlignLog = carLogs.find(l => l.alignment);
      
      const lastService = lastServiceLog ? lastServiceLog.odometer : 0;
      const lastAlignment = lastAlignLog ? lastAlignLog.odometer : 0;

      // Calculate total passenger KM
      const totalPassengerKm = carLogs.reduce((sum, log) => sum + (Number(log.passengerKm) || 0), 0);

      stats[car] = {
        currentOdo,
        lastService,
        lastAlignment,
        totalPassengerKm,
        logsCount: carLogs.length
      };
    });
    
    return stats;
  }, [logs]);

  // --- ACTIONS ---

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!odometer) return;
    
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'car_logs'), {
        car: selectedCar,
        driver: selectedDriver,
        odometer: Number(odometer),
        passengerKm: Number(passengerKm) || 0,
        alignment: isAlignment,
        service: isService,
        timestamp: Date.now(),
        dateString: new Date().toLocaleDateString()
      });
      
      // Reset form and go to dashboard
      setOdometer("");
      setPassengerKm("");
      setIsAlignment(false);
      setIsService(false);
      setView('dashboard');
    } catch (err) {
      console.error("Error adding entry:", err);
      alert("Failed to save entry. Check connection.");
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'car_logs', id));
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const handleEditUpdate = async (id, newData) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'car_logs', id), newData);
      setEditingId(null);
    } catch (err) {
      console.error("Error updating:", err);
    }
  };

  // --- RENDER HELPERS ---

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-yellow-500 font-bold text-xl">Loading Fleet Data...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 pb-24 font-sans text-gray-100 flex flex-col items-center">
      
      {/* Header */}
      <header className="bg-black border-b border-yellow-600/50 w-full sticky top-0 z-40 shadow-lg">
        <div className="max-w-lg mx-auto flex justify-between items-center p-5">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3 text-yellow-500">
              <Car size={28} className="text-yellow-500" />
              Car Care
            </h1>
            <p className="text-sm text-gray-400 mt-1">Fleet Monitor</p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <div>{CARS.length} Cars</div>
            <div>{DRIVERS.length} Drivers</div>
          </div>
        </div>
      </header>

      {/* Main Content Container - Centered and Padded */}
      <main className="w-full max-w-lg p-6 space-y-6">
        
        {/* DASHBOARD VIEW */}
        {view === 'dashboard' && (
          <div className="space-y-6">
            {CARS.map(car => {
              const stats = carStats[car];
              const isDanger = (stats.currentOdo - stats.lastService >= SERVICE_INTERVAL) || 
                               (stats.currentOdo - stats.lastAlignment >= ALIGNMENT_INTERVAL);

              return (
                <div key={car} className={`bg-gray-800 rounded-2xl shadow-xl border-l-8 p-6 ${isDanger ? 'border-l-red-500' : 'border-l-green-500'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-bold text-white tracking-wide">{car}</h2>
                    <span className="text-3xl font-mono font-bold text-yellow-500">
                      {stats.currentOdo.toLocaleString()} <span className="text-sm text-gray-500 font-sans">km</span>
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3 mb-4">
                    <StatusBadge 
                      type="Wheel Alignment" 
                      current={stats.currentOdo} 
                      last={stats.lastAlignment} 
                      interval={ALIGNMENT_INTERVAL} 
                    />
                    <StatusBadge 
                      type="Periodic Service" 
                      current={stats.currentOdo} 
                      last={stats.lastService} 
                      interval={SERVICE_INTERVAL} 
                    />
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-gray-700 text-sm text-gray-400">
                    <span>With Passengers: <span className="text-gray-200">{stats.totalPassengerKm.toLocaleString()} km</span></span>
                    <span>{stats.logsCount} entries</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* NEW ENTRY VIEW */}
        {view === 'entry' && (
          <div className="bg-gray-800 rounded-2xl shadow-xl p-6 animate-fade-in border border-gray-700">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3 text-yellow-500 border-b border-gray-700 pb-4">
              <PlusCircle size={28} />
              New Log Entry
            </h2>
            <form onSubmit={handleAddEntry} className="space-y-6">
              
              {/* Car Selection */}
              <div>
                <label className="block text-base font-semibold text-gray-300 mb-3">Select Car</label>
                <div className="grid grid-cols-1 gap-3">
                  {CARS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedCar(c)}
                      className={`p-4 text-lg font-medium rounded-xl border-2 text-left transition-all ${
                        selectedCar === c 
                          ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]' 
                          : 'bg-gray-700 text-gray-400 border-transparent hover:bg-gray-600'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Driver Selection */}
              <div>
                <label className="block text-base font-semibold text-gray-300 mb-3">Driver</label>
                <select 
                  value={selectedDriver}
                  onChange={(e) => setSelectedDriver(e.target.value)}
                  className="w-full p-4 text-lg rounded-xl bg-gray-700 border border-gray-600 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none appearance-none"
                >
                  {DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Odometer Readings */}
              <div className="space-y-6">
                <div>
                  <label className="block text-base font-semibold text-gray-300 mb-3">Current Odometer (km)</label>
                  <input 
                    type="number" 
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    className="w-full p-4 text-2xl bg-gray-700 border border-gray-600 rounded-xl text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none font-mono placeholder-gray-500"
                    placeholder="e.g. 10500"
                    required
                  />
                  {odometer && carStats[selectedCar].currentOdo > Number(odometer) && (
                    <p className="text-red-400 text-sm mt-2 flex items-center gap-2">
                      <AlertTriangle size={14} /> 
                      Warning: Lower than last recorded ({carStats[selectedCar].currentOdo})
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-base font-semibold text-gray-300 mb-3">Passenger Distance (km)</label>
                  <input 
                    type="number" 
                    value={passengerKm}
                    onChange={(e) => setPassengerKm(e.target.value)}
                    className="w-full p-4 text-2xl bg-gray-700 border border-gray-600 rounded-xl text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none font-mono placeholder-gray-500"
                    placeholder="Optional"
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="bg-gray-700/50 p-5 rounded-xl space-y-4 border border-gray-700">
                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-colors ${isAlignment ? 'bg-yellow-500 border-yellow-500' : 'bg-transparent border-gray-500 group-hover:border-gray-400'}`}>
                    {isAlignment && <CheckCircle size={20} className="text-black" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={isAlignment} onChange={(e) => setIsAlignment(e.target.checked)} />
                  <span className="text-lg font-medium text-gray-200">Wheel Alignment Done</span>
                </label>

                <label className="flex items-center gap-4 cursor-pointer group">
                  <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-colors ${isService ? 'bg-yellow-500 border-yellow-500' : 'bg-transparent border-gray-500 group-hover:border-gray-400'}`}>
                    {isService && <CheckCircle size={20} className="text-black" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={isService} onChange={(e) => setIsService(e.target.checked)} />
                  <span className="text-lg font-medium text-gray-200">Periodic Service Done</span>
                </label>
              </div>

              {/* Submit */}
              <button 
                type="submit" 
                disabled={!odometer}
                className="w-full bg-yellow-500 text-black font-bold text-xl py-5 rounded-2xl shadow-[0_4px_14px_rgba(234,179,8,0.4)] hover:bg-yellow-400 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed transition-all active:scale-[0.98] mt-4"
              >
                Update Log
              </button>
            </form>
          </div>
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && (
          <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 overflow-hidden">
            <div className="p-5 border-b border-gray-700 bg-gray-800 flex justify-between items-center sticky top-0 z-10">
              <h2 className="text-xl font-bold text-yellow-500">Recent Activity</h2>
              <span className="text-sm text-gray-400">Tap icon to edit</span>
            </div>
            <div className="divide-y divide-gray-700">
              {logs.length === 0 ? (
                <div className="p-10 text-center text-gray-500 text-lg">No logs found. Start driving!</div>
              ) : (
                logs.map(log => {
                  const isEditing = editingId === log.id;
                  
                  return (
                    <div key={log.id} className="p-5 hover:bg-gray-700/50 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-lg font-bold text-white block mb-1">{log.car}</span>
                          <span className="text-sm text-gray-400 flex items-center gap-2">
                            <User size={14} className="text-yellow-500" /> {log.driver}
                          </span>
                        </div>
                        <div className="text-right">
                          {isEditing ? (
                            <input 
                              type="number" 
                              className="w-28 p-2 bg-gray-900 border border-yellow-500 rounded text-right font-mono text-white text-lg"
                              defaultValue={log.odometer}
                              id={`edit-odo-${log.id}`}
                            />
                          ) : (
                            <span className="font-mono text-xl font-bold text-yellow-500 block">{log.odometer} km</span>
                          )}
                          <span className="text-xs text-gray-500">{log.dateString || "Unknown Date"}</span>
                        </div>
                      </div>

                      {/* Chips for service/alignment */}
                      <div className="flex gap-3 mb-3 flex-wrap">
                        {log.alignment && <span className="bg-purple-900/50 text-purple-300 border border-purple-700/50 text-xs px-3 py-1 rounded-full font-medium">Alignment</span>}
                        {log.service && <span className="bg-orange-900/50 text-orange-300 border border-orange-700/50 text-xs px-3 py-1 rounded-full font-medium">Service</span>}
                        {log.passengerKm > 0 && (
                          <span className="bg-gray-700 text-gray-300 border border-gray-600 text-xs px-3 py-1 rounded-full font-medium">
                            Pax: {log.passengerKm} km
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex justify-end gap-5 mt-2 pt-2 border-t border-gray-700/50">
                        {isEditing ? (
                          <>
                            <button 
                              onClick={() => setEditingId(null)}
                              className="text-gray-400 hover:text-white p-2"
                            >
                              <X size={24} />
                            </button>
                            <button 
                              onClick={() => {
                                const newOdo = document.getElementById(`edit-odo-${log.id}`).value;
                                handleEditUpdate(log.id, { odometer: Number(newOdo) });
                              }}
                              className="text-green-500 hover:text-green-400 p-2"
                            >
                              <Save size={24} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => setPinModal({ 
                                open: true, 
                                action: () => setEditingId(log.id),
                                title: "Enter PIN to Edit"
                              })}
                              className="text-gray-500 hover:text-yellow-500 p-2"
                            >
                              <Edit2 size={20} />
                            </button>
                            <button 
                              onClick={() => setPinModal({ 
                                open: true, 
                                action: () => handleDelete(log.id),
                                title: "Enter PIN to Delete"
                              })}
                              className="text-gray-500 hover:text-red-500 p-2"
                            >
                              <Trash2 size={20} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* PIN MODAL */}
      <PinModal 
        isOpen={pinModal.open} 
        onClose={() => setPinModal({ ...pinModal, open: false })}
        onSuccess={pinModal.action}
        title={pinModal.title}
      />

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black border-t border-yellow-900/30 flex justify-around p-4 z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
        <button 
          onClick={() => setView('dashboard')}
          className={`flex flex-col items-center gap-1.5 text-sm font-bold transition-colors ${view === 'dashboard' ? 'text-yellow-500' : 'text-gray-600'}`}
        >
          <Car size={26} />
          Dashboard
        </button>
        
        <button 
          onClick={() => setView('entry')}
          className="flex flex-col items-center gap-1 text-sm font-bold -mt-10 group"
        >
          <div className="bg-yellow-500 text-black p-5 rounded-full shadow-[0_0_20px_rgba(234,179,8,0.4)] group-active:scale-95 transition-transform border-4 border-gray-900">
            <PlusCircle size={32} />
          </div>
          <span className="text-yellow-500 mt-1">Add Log</span>
        </button>

        <button 
          onClick={() => setView('history')}
          className={`flex flex-col items-center gap-1.5 text-sm font-bold transition-colors ${view === 'history' ? 'text-yellow-500' : 'text-gray-600'}`}
        >
          <History size={26} />
          History
        </button>
      </nav>
    </div>
  );
}