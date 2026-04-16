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
