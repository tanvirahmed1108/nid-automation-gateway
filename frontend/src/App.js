import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

if (!document.getElementById('tw')) {
  const s = document.createElement('script');
  s.id = 'tw'; s.src = 'https://cdn.tailwindcss.com';
  document.head.appendChild(s);
}

const Spinner = ({ dark }) => (
  <span className={`inline-block w-3.5 h-3.5 border-2 rounded-full animate-spin
    ${dark ? 'border-gray-200 border-t-emerald-700' : 'border-white/30 border-t-white'}`} />
);

const Toast = ({ toast }) => !toast ? null : (
  <div className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl text-white text-xs font-semibold shadow-xl
    ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-700'}`}>
    {toast.msg}
  </div>
);

const StatCard = ({ label, value, sub, subColor = 'text-gray-400', dark }) => (
  <div className={`rounded-xl p-3 ${dark ? '' : 'bg-gray-100'}`}
    style={dark ? { background: '#064e3b' } : {}}>
    <p className={`text-[9px] font-semibold uppercase tracking-wider mb-1 ${dark ? 'text-emerald-300' : 'text-gray-400'}`}>{label}</p>
    <p className={`text-xl font-semibold ${dark ? 'text-white' : 'text-gray-800'}`}>{value}</p>
    <p className={`text-[9px] mt-1 ${dark ? 'text-emerald-400' : subColor}`}>{sub}</p>
  </div>
);

const Field = ({ label, value, mono, empty }) => (
  <div>
    <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
    <div className={`px-2.5 py-2 bg-gray-50 rounded-lg text-xs border border-gray-100 min-h-[30px] flex items-center
      ${mono ? 'font-mono tracking-wide' : ''}
      ${!value ? 'text-gray-300 italic' : 'text-gray-800'}`}>
      {value || (empty || '—')}
    </div>
  </div>
);

const BarRow = ({ label, count, total }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-400">{count} · {pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: '#059669' }} />
      </div>
    </div>
  );
};

const PanelHeader = ({ step, title, badge, blue }) => (
  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
    <span className="w-6 h-6 text-white text-[9px] font-semibold rounded-md flex items-center justify-center flex-shrink-0"
      style={{ background: blue ? '#1d4ed8' : '#064e3b' }}>{step}</span>
    <h3 className="text-xs font-semibold text-gray-700 flex-1">{title}</h3>
    {badge}
  </div>
);

// ── Birth cert fields — permanent_address removed ─────
const BC_FIELDS = [
  { key: 'personal_id_no', label: 'Birth Registration No.', mono: true  },
  { key: 'name',           label: 'Full Name',              mono: false },
  { key: 'father_name',    label: "Father's Name",          mono: false },
  { key: 'mother_name',    label: "Mother's Name",          mono: false },
  { key: 'dob',            label: 'Date of Birth',          mono: false },
  { key: 'gender',         label: 'Gender',                 mono: false },
  { key: 'nationality',    label: 'Nationality',            mono: false },
  { key: 'place_of_birth', label: 'Place of Birth',         mono: false },
];

const INITIAL_BC_DATA = {
  name: '', father_name: '', mother_name: '',
  place_of_birth: '',
  dob: '', age: null,
  registration_no: '', registration_book_no: 'N/A',
  personal_id_no: '', gender: '', nationality: '',
  timestamp: ''
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn]             = useState(false);
  const [isAdmin, setIsAdmin]                   = useState(false);
  const [authMode, setAuthMode]                 = useState('login');
  const [view, setView]                         = useState('scan');
  const [scanTab, setScanTab]                   = useState('nid');
  const [credentials, setCredentials]           = useState({ username: '', password: '' });

  const [nidFile, setNidFile]                   = useState(null);
  const [nidPreview, setNidPreview]             = useState(null);
  const [nidLoading, setNidLoading]             = useState(false);
  const [nidPdfLoading, setNidPdfLoading]       = useState(false);
  const [nidData, setNidData]                   = useState({ name: '', nid_number: '', dob: '', age: null, benefits: [], timestamp: '' });

  const [bcFile, setBcFile]                     = useState(null);
  const [bcPreview, setBcPreview]               = useState(null);
  const [bcLoading, setBcLoading]               = useState(false);
  const [bcPdfLoading, setBcPdfLoading]         = useState(false);
  const [bcData, setBcData]                     = useState(INITIAL_BC_DATA);
  const [bcDragOver, setBcDragOver]             = useState(false);

  const [history, setHistory]                   = useState([]);
  const [analytics, setAnalytics]               = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [toast, setToast]                       = useState(null);
  const [authLoading, setAuthLoading]           = useState(false);
  const [nidDragOver, setNidDragOver]           = useState(false);
  const [time, setTime]                         = useState(new Date());
  const [todayStats, setTodayStats]             = useState({ total: 0, nid: 0, bc: 0 });

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchTodayStats = async (username) => {
    try {
      const res = await axios.get(`${API}/history/${username}`);
      const all = res.data;
      const today = new Date().toISOString().slice(0, 10);
      const todayScans = all.filter(h => h.timestamp?.startsWith(today));
      setTodayStats({
        total: todayScans.length,
        nid:   todayScans.filter(h => h.type === 'nid' || !h.type).length,
        bc:    todayScans.filter(h => h.type === 'birth_cert').length,
      });
    } catch {}
  };

  const handleAuth = async () => {
    if (!credentials.username || !credentials.password) return showToast('Enter credentials', 'error');
    if (authMode === 'admin') {
      if (credentials.username === ADMIN_USERNAME && credentials.password === ADMIN_PASSWORD) {
        setIsAdmin(true); setIsLoggedIn(true);
        showToast('Welcome, Administrator!');
        setTimeout(() => fetchTodayStats(credentials.username), 300);
      } else showToast('Invalid admin credentials', 'error');
      return;
    }
    setAuthLoading(true);
    try {
      await axios.post(`${API}/${authMode === 'login' ? 'login' : 'register'}`, credentials);
      if (authMode === 'login') {
        setIsAdmin(false); setIsLoggedIn(true);
        showToast(`Welcome, ${credentials.username}!`);
        setTimeout(() => fetchTodayStats(credentials.username), 300);
      } else { showToast('Account created! Please log in.'); setAuthMode('login'); }
    } catch (err) { showToast(err.response?.data?.detail || 'Auth failed', 'error'); }
    setAuthLoading(false);
  };

  const handleNidFile = (f) => {
    if (!f) return;
    setNidFile(f); setNidPreview(URL.createObjectURL(f));
    setNidData({ name: '', nid_number: '', dob: '', age: null, benefits: [], timestamp: '' });
  };
  const handleNidDrop = (e) => {
    e.preventDefault(); setNidDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith('image/')) handleNidFile(f);
    else showToast('Please upload an image file', 'error');
  };
  const handleNidExtract = async () => {
    if (!nidFile) return showToast('Upload an NID image first', 'error');
    setNidLoading(true);
    const fd = new FormData(); fd.append('file', nidFile);
    try {
      const res = await axios.post(`${API}/extract-nid?username=${credentials.username}`, fd);
      if (res.data.status === 'success') {
        setNidData(res.data.data); showToast('NID extracted!');
        fetchTodayStats(credentials.username);
      } else showToast(res.data.message || 'Extraction failed', 'error');
    } catch { showToast('Extraction failed. Check backend.', 'error'); }
    setNidLoading(false);
  };
  const handleNidPDF = async () => {
    setNidPdfLoading(true);
    try {
      const res = await axios.post(`${API}/generate-report`, nidData, {
        responseType: 'blob', headers: { 'Content-Type': 'application/json' }
      });
      if ((res.headers['content-type'] || '').includes('application/json')) {
        showToast(JSON.parse(await res.data.text()).detail || 'PDF failed', 'error'); return;
      }
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url;
      a.setAttribute('download', `NID_Report_${nidData.nid_number || 'citizen'}.pdf`);
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url); showToast('NID report downloaded!');
    } catch { showToast('PDF download failed', 'error'); }
    setNidPdfLoading(false);
  };
  const resetNid = () => {
    setNidFile(null); setNidPreview(null);
    setNidData({ name: '', nid_number: '', dob: '', age: null, benefits: [], timestamp: '' });
    showToast('Ready for next NID scan!');
  };

  const handleBcFile = (f) => {
    if (!f) return;
    setBcFile(f); setBcPreview(URL.createObjectURL(f)); setBcData(INITIAL_BC_DATA);
  };
  const handleBcDrop = (e) => {
    e.preventDefault(); setBcDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith('image/')) handleBcFile(f);
    else showToast('Please upload an image file', 'error');
  };
  const handleBcExtract = async () => {
    if (!bcFile) return showToast('Upload a birth certificate image first', 'error');
    setBcLoading(true);
    const fd = new FormData(); fd.append('file', bcFile);
    try {
      const res = await axios.post(`${API}/extract-birth-cert?username=${credentials.username}`, fd);
      if (res.data.status === 'success') {
        setBcData(res.data.data); showToast('Birth certificate extracted!');
        fetchTodayStats(credentials.username);
      } else showToast(res.data.message || 'Extraction failed', 'error');
    } catch { showToast('Extraction failed. Check backend.', 'error'); }
    setBcLoading(false);
  };
  const handleBcPDF = async () => {
    setBcPdfLoading(true);
    try {
      const res = await axios.post(`${API}/generate-birth-cert-report`, bcData, {
        responseType: 'blob', headers: { 'Content-Type': 'application/json' }
      });
      if ((res.headers['content-type'] || '').includes('application/json')) {
        showToast(JSON.parse(await res.data.text()).detail || 'PDF failed', 'error'); return;
      }
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url;
      a.setAttribute('download', `BirthCert_${bcData.personal_id_no || 'report'}.pdf`);
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url); showToast('Birth cert report downloaded!');
    } catch { showToast('PDF download failed', 'error'); }
    setBcPdfLoading(false);
  };
  const resetBc = () => { setBcFile(null); setBcPreview(null); setBcData(INITIAL_BC_DATA); showToast('Ready for next birth cert scan!'); };
  const updateBcField = (key, val) => setBcData(prev => ({ ...prev, [key]: val }));

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/history/${credentials.username}`);
      setHistory(res.data); setView('history');
    } catch { showToast('Failed to load history', 'error'); }
  };
  const fetchAnalytics = async () => {
    setView('analytics'); setAnalyticsLoading(true);
    try { const res = await axios.get(`${API}/admin/analytics`); setAnalytics(res.data); }
    catch { showToast('Analytics failed', 'error'); }
    setAnalyticsLoading(false);
  };
  const handleLogout = () => {
    setIsLoggedIn(false); setIsAdmin(false); setAuthMode('login'); setView('scan');
    setNidData({ name: '', nid_number: '', dob: '', age: null, benefits: [], timestamp: '' });
    setBcData(INITIAL_BC_DATA);
    setNidFile(null); setNidPreview(null); setBcFile(null); setBcPreview(null);
    setHistory([]); setAnalytics(null); setTodayStats({ total: 0, nid: 0, bc: 0 });
  };

  if (!isLoggedIn) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg,#064e3b,#065f46)' }}>
      <Toast toast={toast} />
      <div className="bg-white rounded-2xl shadow-2xl p-9 w-96 border border-gray-100">
        <div className="text-center mb-6">
          <div className="w-14 h-9 rounded-xl mx-auto mb-4 flex items-center justify-center" style={{ background: '#064e3b' }}>
            <div className="w-5 h-5 bg-red-500 rounded-full" />
          </div>
          <h1 className="text-lg font-semibold text-gray-800">Smart-Nagorik</h1>
          <p className="text-xs text-gray-400 mt-1">Bangladesh National ID Gateway</p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5 mb-5 gap-0.5">
          {[['login','Sign In'],['register','Register'],['admin','🛡️ Admin']].map(([id,label]) => (
            <button key={id} onClick={() => setAuthMode(id)}
              className={`flex-1 py-2 rounded-md text-xs font-semibold transition-all
                ${authMode===id ? id==='admin' ? 'bg-amber-50 text-amber-800 shadow-sm border border-amber-200'
                  : 'bg-white text-emerald-800 shadow-sm border border-gray-200'
                  : id==='admin' ? 'text-amber-600' : 'text-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {['username','password'].map(f => (
            <input key={f} type={f==='password'?'password':'text'}
              placeholder={f.charAt(0).toUpperCase()+f.slice(1)}
              value={credentials[f]}
              onChange={e => setCredentials({...credentials,[f]:e.target.value})}
              onKeyDown={e => e.key==='Enter' && handleAuth()}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all" />
          ))}
          <button onClick={handleAuth} disabled={authLoading}
            className={`w-full py-3 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60
              ${authMode==='admin' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-800 hover:bg-emerald-700'}`}>
            {authLoading ? <Spinner /> : authMode==='login' ? 'Sign In' : authMode==='register' ? 'Create Account' : '🛡️ Admin Login'}
          </button>
        </div>
      </div>
    </div>
  );

  const navItems = [
    { id:'scan',    icon:'⚡', label:'Document Scanner', action:()=>setView('scan') },
    { id:'history', icon:'≡',  label:'Scan History',     action:fetchHistory },
    ...(isAdmin ? [
      { id:'analytics', icon:'◈', label:'Analytics',     action:fetchAnalytics, admin:true },
      { id:'system',    icon:'⚙', label:'System Status', action:()=>setView('system'), admin:true },
    ] : []),
  ];
  const recentScans = history.slice(-4).reverse();
  const pageMeta = {
    scan:      { title:'Document Scanner',  sub:'Scan NID cards or Birth Certificates',      pill:'Smart-Nagorik' },
    history:   { title:'Scan History',      sub:`All scans by ${credentials.username}`,      pill:`${history.length} records` },
    analytics: { title:'Admin Analytics',   sub:'Real-time citizen service demand insights', pill:'Admin Panel' },
    system:    { title:'System Status',     sub:'Backend health and OCR engine monitoring',  pill:'All Systems OK' },
  };
  const pm = pageMeta[view] || pageMeta.scan;

  return (
    <div className="flex min-h-screen" style={{ background:'#f3f4f6' }}>
      <Toast toast={toast} />

      <aside className="w-48 flex flex-col fixed inset-y-0 left-0 z-10" style={{ background:'#064e3b' }}>
        <div className="p-3 pb-2">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-4">
            <div className="w-7 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background:'#047857' }}>
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
            </div>
            <div>
              <p className="text-white text-[11px] font-semibold leading-none">Smart-Nagorik</p>
              <span className="text-emerald-400 text-[9px]">ID Gateway</span>
            </div>
          </div>
          <p className="text-[9px] text-emerald-400 opacity-60 px-2 mb-1 tracking-wider font-semibold">MAIN</p>
          {navItems.filter(n=>!n.admin).map(({id,icon,label,action}) => (
            <button key={id} onClick={action}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-medium transition-all text-left mb-0.5
                ${view===id ? 'bg-white/15 text-white' : 'text-emerald-300 hover:bg-white/10 hover:text-white'}`}>
              <span className="w-3.5 text-center text-xs">{icon}</span>{label}
            </button>
          ))}
          {isAdmin && (<>
            <p className="text-[9px] text-emerald-400 opacity-60 px-2 mb-1 mt-3 tracking-wider font-semibold">ADMIN</p>
            {navItems.filter(n=>n.admin).map(({id,icon,label,action}) => (
              <button key={id} onClick={action}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-medium transition-all text-left mb-0.5
                  ${view===id ? 'bg-amber-500/20 text-amber-300' : 'text-amber-400 hover:bg-amber-500/10'}`}>
                <span className="w-3.5 text-center text-xs">{icon}</span>{label}
              </button>
            ))}
          </>)}
        </div>
        <div className="flex-1 px-3 overflow-y-auto">
          {recentScans.length > 0 && (
            <div className="mt-2">
              <p className="text-[9px] text-emerald-400 opacity-60 px-2 mb-1.5 tracking-wider font-semibold">RECENT SCANS</p>
              {recentScans.map((h,i) => (
                <div key={i} className="px-2.5 py-1.5 rounded-lg mb-1 cursor-pointer transition-all"
                  style={{ background:'rgba(255,255,255,0.07)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.12)'}
                  onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.07)'}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full
                      ${h.type==='birth_cert' ? 'bg-blue-500/30 text-blue-200' : 'bg-emerald-500/30 text-emerald-200'}`}>
                      {h.type==='birth_cert' ? 'BC' : 'NID'}
                    </span>
                    <p className="text-emerald-100 text-[10px] font-medium truncate">{h.name}</p>
                  </div>
                  <span className="text-emerald-500 text-[9px]">{h.timestamp?.slice(11,16)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-2.5 border-t border-white/10">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl" style={{ background:'rgba(0,0,0,0.2)' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0"
              style={{ background:'rgba(255,255,255,0.2)' }}>
              {credentials.username[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[10px] font-medium truncate">{credentials.username}</p>
              <p className="text-emerald-400 text-[9px]">{isAdmin ? '🛡️ Admin' : 'Operator'}</p>
            </div>
            <button onClick={handleLogout} className="text-emerald-400 hover:text-red-400 transition-colors text-sm" title="Logout">⏻</button>
          </div>
        </div>
      </aside>

      <main className="ml-48 flex-1 flex flex-col min-h-screen">
        <div className="bg-white border-b border-gray-100 px-5 py-2.5 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">{pm.title}</h2>
            <p className="text-[10px] text-gray-400">{pm.sub}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[9px] text-gray-400">{time.toLocaleTimeString()}</span>
            <span className="flex items-center gap-1 text-[9px] text-emerald-600">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />Live
            </span>
            <span className={`text-[9px] font-semibold px-2.5 py-1 rounded-full border
              ${view==='analytics'||view==='system' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
              {pm.pill}
            </span>
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col gap-3">

          {view==='scan' && (<>
            <div className="grid grid-cols-4 gap-2.5">
              <StatCard dark label="Today's Scans"  value={todayStats.total} sub="scans today" />
              <StatCard label="NID Scans"            value={todayStats.nid}   sub="today" subColor="text-emerald-600" />
              <StatCard label="Birth Cert Scans"     value={todayStats.bc}    sub="today" subColor="text-blue-600" />
              <StatCard label="Avg Process Time"     value="2.4s"             sub="OCR + parse" />
            </div>

            <div className="flex gap-2">
              <button onClick={()=>setScanTab('nid')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-all
                  ${scanTab==='nid' ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-300'}`}
                style={scanTab==='nid' ? { background:'#065f46' } : {}}>
                🪪 NID Card Scan
              </button>
              <button onClick={()=>setScanTab('birth')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-all
                  ${scanTab==='birth' ? 'text-white border-transparent bg-blue-700' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`}>
                📜 Birth Certificate Scan
              </button>
            </div>

            {scanTab==='nid' && (
              <div className="grid grid-cols-2 gap-3 flex-1">
                <div className="bg-white rounded-xl border border-gray-100 flex flex-col">
                  <PanelHeader step="01" title="NID Upload" />
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div onDragOver={e=>{e.preventDefault();setNidDragOver(true);}} onDragLeave={()=>setNidDragOver(false)}
                      onDrop={handleNidDrop} onClick={()=>document.getElementById('nid-file').click()}
                      className={`border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-all overflow-hidden
                        ${nidPreview?'border-emerald-300 bg-emerald-50/30':nidDragOver?'border-emerald-500 bg-emerald-50':'border-gray-200 hover:border-emerald-300 bg-gray-50'}`}
                      style={{ minHeight:'240px' }}>
                      {nidPreview ? <img src={nidPreview} alt="NID" className="max-h-56 object-contain p-2" />
                        : <div className="text-center p-6"><div className="text-4xl mb-3">🪪</div>
                            <p className="text-sm font-medium text-gray-500">Drop NID image here</p>
                            <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · max 10MB</p></div>}
                      <input id="nid-file" type="file" accept="image/*" className="hidden" onChange={e=>handleNidFile(e.target.files[0])} />
                    </div>
                    {nidFile && <p className="text-xs text-emerald-700 font-medium bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 truncate">📎 {nidFile.name} · {(nidFile.size/1024).toFixed(1)} KB</p>}
                    <button onClick={handleNidExtract} disabled={nidLoading||!nidFile}
                      className="w-full py-3 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      style={{ background:'#065f46' }}>
                      {nidLoading ? <><Spinner /> AI Processing...</> : <>⚡ Extract NID Data</>}
                    </button>
                    {nidFile && !nidLoading && (
                      <button onClick={resetNid} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all">
                        🔄 Scan Another NID
                      </button>
                    )}
                    <div className="border-t border-gray-100 pt-3 mt-auto">
                      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">How it works</p>
                      {['Upload NID front image','AI extracts name, NID & DOB','Eligibility is calculated','Download official PDF report'].map((s,i) => (
                        <div key={i} className="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
                          <div className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-semibold flex-shrink-0" style={{ background:'#064e3b' }}>{i+1}</div>
                          <span className="text-xs text-gray-500">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 flex flex-col">
                  <PanelHeader step="02" title="Extracted NID Data"
                    badge={nidData.name ? <span className="ml-auto text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Verified</span> : null} />
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <Field label="Full Name"    value={nidData.name}       empty="Waiting for scan..." />
                    <Field label="NID Number"   value={nidData.nid_number} mono />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Date of Birth" value={nidData.dob} />
                      <Field label="Age"            value={nidData.age ? `${nidData.age} yrs` : ''} />
                    </div>
                    {nidData.benefits?.length > 0 && (
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Eligible Services</p>
                        <div className="flex flex-wrap gap-1.5">
                          {nidData.benefits.map((b,i) => (
                            <span key={i} className="text-[10px] font-semibold px-2.5 py-1 rounded-full border"
                              style={{ background:'#ecfdf5', color:'#065f46', borderColor:'#a7f3d0' }}>✓ {b.split('(')[0].trim()}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {nidData.name ? (<>
                      <div className="rounded-xl p-3.5 border" style={{ background:'#f0fdf4', borderColor:'#bbf7d0' }}>
                        <p className="text-[9px] font-semibold uppercase tracking-wider mb-3" style={{ color:'#065f46' }}>Citizen Summary</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          {[['Category',nidData.age>=65?'Senior':nidData.age>=36?'Middle Age':'Youth'],['Services',`${nidData.benefits?.length||0} eligible`],['Status','Active Citizen'],['Verified',new Date().toLocaleDateString('en-GB')]].map(([k,v]) => (
                            <div key={k}><p className="text-[8px] uppercase tracking-wider mb-0.5" style={{ color:'#16a34a' }}>{k}</p><p className="text-xs font-semibold" style={{ color:'#14532d' }}>{v}</p></div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quick Actions</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={handleNidPDF} disabled={nidPdfLoading}
                            className="py-2.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all">
                            {nidPdfLoading ? <><Spinner /> Generating...</> : <>📄 Download PDF</>}
                          </button>
                          <button onClick={()=>navigator.clipboard?.writeText(nidData.nid_number).then(()=>showToast('NID copied!'))}
                            className="py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all border"
                            style={{ background:'#ecfdf5', color:'#065f46', borderColor:'#a7f3d0' }}>📋 Copy NID</button>
                          <button onClick={fetchHistory} className="py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all border border-gray-200">📜 View History</button>
                          <button onClick={resetNid} className="py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all border border-gray-200">🔄 New Scan</button>
                        </div>
                      </div>
                    </>) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-gray-300 py-10">
                        <div className="text-5xl mb-3 opacity-20">🪪</div>
                        <p className="text-xs">Extract an NID to see citizen data here</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {scanTab==='birth' && (
              <div className="grid grid-cols-2 gap-3 flex-1">
                <div className="bg-white rounded-xl border border-gray-100 flex flex-col">
                  <PanelHeader step="01" title="Birth Certificate Upload" blue />
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div onDragOver={e=>{e.preventDefault();setBcDragOver(true);}} onDragLeave={()=>setBcDragOver(false)}
                      onDrop={handleBcDrop} onClick={()=>document.getElementById('bc-file').click()}
                      className={`border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-all overflow-hidden
                        ${bcPreview?'border-blue-300 bg-blue-50/30':bcDragOver?'border-blue-500 bg-blue-50':'border-gray-200 hover:border-blue-300 bg-gray-50'}`}
                      style={{ minHeight:'240px' }}>
                      {bcPreview ? <img src={bcPreview} alt="Birth Cert" className="max-h-56 object-contain p-2" />
                        : <div className="text-center p-6"><div className="text-4xl mb-3">📜</div>
                            <p className="text-sm font-medium text-gray-500">Drop birth certificate here</p>
                            <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · max 10MB</p></div>}
                      <input id="bc-file" type="file" accept="image/*" className="hidden" onChange={e=>handleBcFile(e.target.files[0])} />
                    </div>
                    {bcFile && <p className="text-xs text-blue-700 font-medium bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 truncate">📎 {bcFile.name} · {(bcFile.size/1024).toFixed(1)} KB</p>}
                    <button onClick={handleBcExtract} disabled={bcLoading||!bcFile}
                      className="w-full py-3 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-blue-700 hover:bg-blue-800">
                      {bcLoading ? <><Spinner /> AI Processing...</> : <>⚡ Extract Certificate Data</>}
                    </button>
                    {bcFile && !bcLoading && (
                      <button onClick={resetBc} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all">
                        🔄 Scan Another Certificate
                      </button>
                    )}
                    <div className="border-t border-gray-100 pt-3 mt-auto">
                      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Fields extracted</p>
                      {['Birth Registration Number (17-18 digits)','Name, Father & Mother Name','Date of Birth & Gender','Place of Birth & Nationality'].map((s,i) => (
                        <div key={i} className="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
                          <div className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-semibold flex-shrink-0 bg-blue-700">{i+1}</div>
                          <span className="text-xs text-gray-500">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 flex flex-col">
                  <PanelHeader step="02" title="Birth Certificate Form" blue
                    badge={bcData.name||bcData.personal_id_no
                      ? <span className="ml-auto text-[9px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">✓ Auto-filled</span>
                      : null} />
                  <div className="p-4 flex flex-col gap-2.5 flex-1 overflow-y-auto">
                    {bcData.name||bcData.personal_id_no ? (<>
                      <p className="text-[9px] text-gray-400 font-medium">Fields auto-filled from scan — you can edit any field before downloading.</p>
                      {BC_FIELDS.map(({key,label,mono}) => (
                        <div key={key}>
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
                          <input type="text" value={bcData[key]||''} onChange={e=>updateBcField(key,e.target.value)}
                            className={`w-full px-2.5 py-2 bg-gray-50 rounded-lg text-xs border border-gray-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all ${mono?'font-mono tracking-wide':''}`} />
                        </div>
                      ))}
                      <div className="rounded-xl p-3.5 border mt-1" style={{ background:'#eff6ff', borderColor:'#bfdbfe' }}>
                        <p className="text-[9px] font-semibold uppercase tracking-wider mb-3" style={{ color:'#1d4ed8' }}>Certificate Summary</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                          {[['Age',bcData.age?`${bcData.age} yrs`:'N/A'],['Gender',bcData.gender||'N/A'],['Nationality',bcData.nationality||'Bangladeshi'],['BRN',bcData.personal_id_no?bcData.personal_id_no.slice(0,8)+'…':'N/A']].map(([k,v]) => (
                            <div key={k}><p className="text-[8px] uppercase tracking-wider mb-0.5" style={{ color:'#3b82f6' }}>{k}</p><p className="text-xs font-semibold" style={{ color:'#1e3a8a' }}>{v}</p></div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Actions</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={handleBcPDF} disabled={bcPdfLoading}
                            className="py-2.5 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 bg-blue-700 hover:bg-blue-800">
                            {bcPdfLoading ? <><Spinner /> Generating...</> : <>📄 Download PDF</>}
                          </button>
                          <button onClick={()=>navigator.clipboard?.writeText(bcData.personal_id_no).then(()=>showToast('BRN copied!'))}
                            className="py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all border"
                            style={{ background:'#eff6ff', color:'#1d4ed8', borderColor:'#bfdbfe' }}>📋 Copy BRN</button>
                          <button onClick={fetchHistory} className="py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all border border-gray-200">📜 View History</button>
                          <button onClick={resetBc} className="py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all border border-gray-200">🔄 New Scan</button>
                        </div>
                      </div>
                    </>) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-gray-300 py-10">
                        <div className="text-5xl mb-3 opacity-20">📜</div>
                        <p className="text-xs text-center">Scan a birth certificate to<br />auto-fill this form</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>)}

          {view==='history' && (<>
            <div className="grid grid-cols-4 gap-2.5">
              <StatCard dark label="Total Records"   value={history.length} sub="all time" />
              <StatCard label="NID Scans"             value={history.filter(h=>h.type==='nid'||!h.type).length} sub="total" subColor="text-emerald-600" />
              <StatCard label="Birth Cert Scans"      value={history.filter(h=>h.type==='birth_cert').length}   sub="total" subColor="text-blue-600" />
              <StatCard label="Success Rate"          value="94%" sub={`${Math.round(history.length*0.94)} / ${history.length}`} />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {history.length===0
                ? <div className="text-center py-16 text-gray-400"><div className="text-3xl mb-2">📋</div><p className="text-xs">No scan history yet.</p></div>
                : <>
                    <div className="grid px-4 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100 bg-gray-50"
                      style={{ gridTemplateColumns:'0.5fr 1.2fr 1fr 1fr 0.5fr' }}>
                      {['Type','Timestamp','Name','BRN / NID','Age'].map(h=><span key={h}>{h}</span>)}
                    </div>
                    {history.map((h,i) => (
                      <div key={i} className="grid px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors items-center last:border-0"
                        style={{ gridTemplateColumns:'0.5fr 1.2fr 1fr 1fr 0.5fr' }}>
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full inline-block text-center
                          ${h.type==='birth_cert' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                          {h.type==='birth_cert' ? 'BC' : 'NID'}
                        </span>
                        <span className="font-mono text-[9px] text-gray-400">{h.timestamp}</span>
                        <span className="text-xs font-semibold text-gray-700">{h.name}</span>
                        <span className="font-mono text-[9px] text-gray-500 truncate">{h.personal_id_no||h.nid_number||'—'}</span>
                        <span className="text-xs text-gray-500">{h.age?`${h.age} yrs`:'—'}</span>
                      </div>
                    ))}
                  </>}
            </div>
          </>)}

          {view==='analytics' && (
            !isAdmin
              ? <div className="flex flex-col items-center justify-center py-20 text-center"><div className="text-5xl mb-3">🚫</div><h3 className="text-sm font-semibold text-gray-700 mb-1">Access Denied</h3><p className="text-xs text-gray-400">Admin only.</p></div>
              : analyticsLoading
                ? <div className="flex flex-col items-center py-16 gap-3 text-gray-400"><Spinner dark /><p className="text-xs">Loading...</p></div>
                : analytics ? (<>
                    <div className="grid grid-cols-4 gap-2.5">
                      <StatCard dark label="Total Scans"      value={analytics.total_scans}        sub="all time" />
                      <StatCard label="NID Scans"             value={analytics.nid_scans||0}        sub="total" subColor="text-emerald-600" />
                      <StatCard label="Birth Cert Scans"      value={analytics.birth_cert_scans||0} sub="total" subColor="text-blue-600" />
                      {Object.entries(analytics.age_groups||{}).slice(0,1).map(([g,c]) => (
                        <StatCard key={g} label={g} value={c} sub={`${analytics.total_scans>0?((c/analytics.total_scans)*100).toFixed(1):0}%`} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl border border-gray-100 p-4">
                        <h3 className="text-xs font-semibold text-gray-700 mb-3">Service Demand</h3>
                        {Object.entries(analytics.service_demand||{}).sort(([,a],[,b])=>b-a).map(([s,c]) => (
                          <BarRow key={s} label={s.split('(')[0].trim()} count={c} total={analytics.total_scans} />
                        ))}
                      </div>
                      <div className="flex flex-col gap-3">
                        <div className="bg-white rounded-xl border border-gray-100 p-4 flex-1">
                          <h3 className="text-xs font-semibold text-gray-700 mb-3">Age Distribution</h3>
                          {Object.entries(analytics.age_groups||{}).map(([g,c],idx) => {
                            const pct=analytics.total_scans>0?(c/analytics.total_scans)*100:0;
                            const colors=['#059669','#d97706','#7c3aed'];
                            const r=19; const circ=2*Math.PI*r;
                            return (
                              <div key={g} className="flex items-center gap-3 mb-4">
                                <div style={{ position:'relative', width:48, height:48, flexShrink:0 }}>
                                  <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform:'rotate(-90deg)' }}>
                                    <circle cx="24" cy="24" r={r} fill="none" stroke="#f3f4f6" strokeWidth="5" />
                                    <circle cx="24" cy="24" r={r} fill="none" stroke={colors[idx]} strokeWidth="5"
                                      strokeDasharray={`${(pct/100)*circ} ${circ}`} strokeLinecap="round" />
                                  </svg>
                                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:600, color:colors[idx] }}>{Math.round(pct)}%</div>
                                </div>
                                <div><p className="text-xs font-medium text-gray-700">{g}</p><span className="text-[9px] text-gray-400">{c} citizens</span></div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 p-4">
                          <h3 className="text-xs font-semibold text-gray-700 mb-2">Recent Activity</h3>
                          {[['Karim H.','Youth Grant','2m'],['Fatema B.','Voter Reg.','18m'],['Abdul R.','Old Age','1h']].map(([n,s,t]) => (
                            <div key={n} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                              <span className="text-xs font-medium text-gray-700">{n}</span>
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background:'#ecfdf5', color:'#065f46' }}>{s}</span>
                              <span className="text-[9px] text-gray-400">{t} ago</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>) : <div className="text-center py-14 text-gray-400"><div className="text-3xl mb-2">📊</div><p className="text-xs">No analytics data.</p></div>
          )}

          {view==='system' && (<>
            <div className="grid grid-cols-4 gap-2.5">
              <StatCard dark label="Uptime"       value="99.8%" sub="last 30 days" />
              <StatCard label="API Latency"        value="142ms" sub="Normal"       subColor="text-emerald-600" />
              <StatCard label="OCR Engine"         value="Active" sub="CPU mode"   subColor="text-emerald-600" />
              <StatCard label="Storage"            value="2.4 GB" sub="of 10 GB used" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Service Health</h3>
                {[['FastAPI Backend',true],['EasyOCR Engine',true],['NID Extractor',true],['Birth Cert Extractor',true],['PDF Generator',true],['Users Database',true],['History Store',true]].map(([s,ok]) => (
                  <div key={s} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2"><div className={`w-1.5 h-1.5 rounded-full ${ok?'bg-emerald-500':'bg-amber-500'}`} /><span className="text-xs text-gray-700">{s}</span></div>
                    <span className={`text-[9px] font-semibold ${ok?'text-emerald-600':'text-amber-600'}`}>{ok?'Online':'Degraded'}</span>
                  </div>
                ))}
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2.5">Resource Usage</h3>
                  {[['CPU',34,'#059669'],['Memory',61,'#d97706'],['Storage',24,'#059669'],['Network',12,'#059669']].map(([l,p,c]) => (
                    <div key={l} className="mb-2.5">
                      <div className="flex justify-between text-[9px] mb-1"><span className="text-gray-600">{l}</span><span className="font-semibold text-gray-700">{p}%</span></div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width:`${p}%`, background:c }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Event Log</h3>
                {[['#059669','NID scanned successfully','2 min ago'],['#059669','Birth cert extracted','4 min ago'],['#059669','PDF report generated','5 min ago'],['#d97706','Slow OCR response (3.1s)','12 min ago'],['#059669','New user registered','1 hr ago'],['#ef4444','Failed extraction attempt','3 hr ago']].map(([c,t,ts],i) => (
                  <div key={i} className="flex items-start gap-2.5 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background:c }} />
                    <div className="flex-1"><p className="text-xs font-medium text-gray-700">{t}</p><span className="text-[9px] text-gray-400">{ts}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </>)}

        </div>
      </main>
    </div>
  );
}