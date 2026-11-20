import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const SERVER_ORIGIN = `${window.location.protocol}//${window.location.hostname}:5000`;
const API_URL = import.meta.env.VITE_API_URL ?? `${SERVER_ORIGIN}/api`;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? SERVER_ORIGIN;

type Role = 'super_admin' | 'owner' | 'staff' | 'tenant';
type AdminScreen = 'dashboard' | 'create-room' | 'register-tenant';

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  boardingHouseId?: string;
};

type Room = {
  id: string;
  boardingHouseId: string;
  roomNumber: string;
  floor: number;
  type: string;
  occupancy: number;
  maxCapacity: number;
  monthlyRent: number;
  status: string;
  facilities: string[];
  description: string;
};

type Tenant = {
  id: string;
  name: string;
  email: string;
  phone: string;
  boardingHouseId: string;
  roomId?: string;
  status: string;
};

type Payment = {
  id: string;
  tenantId: string;
  roomId: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
};

type MaintenanceRequest = {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  status: string;
};

type DashboardState = {
  summary: {
    totalRooms: number;
    availableRooms: number;
    occupiedRooms: number;
    totalTenants: number;
    totalPayments: number;
    monthlyIncome: number;
  };
  notifications: Array<{ id: string; title: string; message: string }>;
  announcements: Array<{ id: string; message: string }>;
  rooms: Room[];
  tenants: Tenant[];
  payments: Payment[];
  maintenanceRequests: MaintenanceRequest[];
  tenant?: Tenant | null;
  boardingHouse?: { id: string; name: string; address: string; contact: string } | null;
  monthlyBalance?: number;
  currentMonthPaid?: number;
};

const api = axios.create({ baseURL: API_URL });

const defaultSummary = {
  totalRooms: 0,
  availableRooms: 0,
  occupiedRooms: 0,
  totalTenants: 0,
  totalPayments: 0,
  monthlyIncome: 0,
};

function getStoredUser(): User | null {
  try {
    const storedUser = localStorage.getItem('boardhouse-user');
    return storedUser ? JSON.parse(storedUser) as User : null;
  } catch {
    localStorage.removeItem('boardhouse-user');
    return null;
  }
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('boardhouse-token'));
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [authRestoring, setAuthRestoring] = useState(Boolean(token && !getStoredUser()));
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [adminScreen, setAdminScreen] = useState<AdminScreen>('dashboard');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [roomForm, setRoomForm] = useState({ roomNumber: '', floor: '', type: 'single', maxCapacity: '', monthlyRent: '' });
  const [tenantForm, setTenantForm] = useState({ name: '', email: '', phone: '', password: '', roomId: '' });
  const [paymentForm, setPaymentForm] = useState({ tenantId: '', roomId: '', amount: '2500', method: 'cash' });
  const [maintenanceForm, setMaintenanceForm] = useState({ title: 'AC issue', description: 'Cooling is not working in room 201', roomId: 'room-201' });
  const [transferTargets, setTransferTargets] = useState<Record<string, string>>({});

  const refreshDashboard = async () => {
    if (!token) return;
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    setDashboardLoading(true);
    setDashboardError('');
    try {
      const response = await api.get('/dashboard');
      setDashboard({
        summary: response.data.summary ?? defaultSummary,
        notifications: response.data.notifications ?? [],
        announcements: response.data.announcements ?? [],
        rooms: response.data.rooms ?? [],
        tenants: response.data.tenants ?? [],
        payments: response.data.payments ?? [],
        maintenanceRequests: response.data.maintenanceRequests ?? [],
        tenant: response.data.tenant ?? null,
        boardingHouse: response.data.boardingHouse ?? response.data.boardingHouses?.[0] ?? null,
        monthlyBalance: response.data.monthlyBalance ?? 0,
        currentMonthPaid: response.data.currentMonthPaid ?? 0,
      });
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setDashboardError(requestError.response?.data?.message ?? 'Could not load your dashboard. Check the server connection and try again.');
      } else {
        setDashboardError('Could not load your dashboard. Try again.');
      }
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    if (!token || user) return;
    api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        setUser(response.data.user);
        localStorage.setItem('boardhouse-user', JSON.stringify(response.data.user));
      })
      .catch(() => {
        localStorage.removeItem('boardhouse-token');
        localStorage.removeItem('boardhouse-user');
        setToken(null);
      })
      .finally(() => setAuthRestoring(false));
  }, [token, user]);

  useEffect(() => {
    if (!token) return;
    refreshDashboard();
  }, [token]);

  useEffect(() => {
    const assignedTenants = dashboard?.tenants.filter((tenant) => tenant.roomId) ?? [];
    if (!assignedTenants.length) {
      setPaymentForm((current) => current.tenantId || current.roomId
        ? { ...current, tenantId: '', roomId: '' }
        : current);
      return;
    }
    setPaymentForm((current) => {
      const selected = assignedTenants.find((tenant) => tenant.id === current.tenantId);
      if (selected) return current.roomId === selected.roomId ? current : { ...current, roomId: selected.roomId ?? '' };
      const first = assignedTenants[0];
      return { ...current, tenantId: first.id, roomId: first.roomId ?? '' };
    });
  }, [dashboard?.tenants]);

  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token } });
    socket.on('connect', () => setConnectionStatus('online'));
    socket.on('connect_error', () => setConnectionStatus('offline'));
    socket.on('disconnect', () => setConnectionStatus('offline'));
    [
      'notification:new',
      'room:created',
      'room:availabilityUpdated',
      'room:occupancyUpdated',
      'tenant:registered',
      'tenant:assigned',
      'tenant:transferred',
      'tenant:checkedOut',
      'payment:recorded',
      'maintenance:created',
      'maintenance:updated',
      'reservation:created',
    ].forEach((eventName) => socket.on(eventName, refreshDashboard));
    return () => {
      socket.disconnect();
    };
  }, [token]);

  const roleLabel = useMemo(() => {
    switch (user?.role) {
      case 'super_admin':
        return 'Super Administrator';
      case 'owner':
        return 'Owner';
      case 'staff':
        return 'Staff';
      case 'tenant':
        return 'Tenant';
      default:
        return 'Guest';
    }
  }, [user]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { email, password });
      const data = response.data;
      setToken(data.token);
      localStorage.setItem('boardhouse-token', data.token);
      setUser(data.user);
      localStorage.setItem('boardhouse-user', JSON.stringify(data.user));
    } catch (err: any) {
      if (err.response) {
        setError(err.response.data?.message ?? 'Login failed');
      } else {
        setError(`Cannot reach the server at ${SERVER_ORIGIN}. Connect this phone to the same Wi-Fi/hotspot as the laptop and check that the server is running.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('boardhouse-token');
    localStorage.removeItem('boardhouse-user');
    setToken(null);
    setUser(null);
    setDashboard(null);
    setAdminScreen('dashboard');
  };

  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      setError('Sign in before creating a room');
      return;
    }
    try {
      await api.post('/rooms', {
        boardingHouseId: dashboard?.boardingHouse?.id ?? user.boardingHouseId,
        roomNumber: roomForm.roomNumber,
        floor: Number(roomForm.floor),
        type: roomForm.type,
        maxCapacity: Number(roomForm.maxCapacity),
        monthlyRent: Number(roomForm.monthlyRent),
        status: 'available',
      });
      setRoomForm({ roomNumber: '', floor: '', type: 'single', maxCapacity: '', monthlyRent: '' });
      await refreshDashboard();
      setAdminScreen('dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Could not create room');
    }
  };

  const registerTenant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api.post('/tenants', {
        name: tenantForm.name,
        email: tenantForm.email,
        phone: tenantForm.phone,
        password: tenantForm.password,
        roomId: tenantForm.roomId,
      });
      setTenantForm({ name: '', email: '', phone: '', password: '', roomId: '' });
      await refreshDashboard();
      setAdminScreen('dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Could not register tenant');
    }
  };

  const moveTenant = async (tenant: Tenant) => {
    const targetRoomId = transferTargets[tenant.id];
    if (!targetRoomId) {
      setError('Choose an available destination room first.');
      return;
    }

    const targetRoom = dashboard?.rooms.find((room) => room.id === targetRoomId);
    if (!targetRoom || !window.confirm(`${tenant.roomId ? 'Move' : 'Assign'} ${tenant.name} to room ${targetRoom.roomNumber}?`)) return;

    try {
      if (tenant.roomId) {
        await api.post(`/tenants/${tenant.id}/transfer`, { targetRoomId });
      } else {
        await api.post(`/rooms/${targetRoomId}/assign`, { tenantId: tenant.id });
      }
      setTransferTargets((targets) => ({ ...targets, [tenant.id]: '' }));
      await refreshDashboard();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Could not change room assignment' : 'Could not change room assignment');
    }
  };

  const checkOutTenant = async (tenant: Tenant) => {
    if (!window.confirm(`Check out ${tenant.name}? Their account and payment history will be retained.`)) return;
    try {
      await api.post(`/tenants/${tenant.id}/checkout`);
      await refreshDashboard();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Could not check out tenant' : 'Could not check out tenant');
    }
  };

  const savePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api.post('/payments', {
        tenantId: paymentForm.tenantId,
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
      });
      setPaymentForm((current) => ({ ...current, amount: '2500', method: 'cash' }));
      refreshDashboard();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Could not record payment');
    }
  };

  const submitMaintenance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api.post('/maintenance', {
        title: maintenanceForm.title,
        description: maintenanceForm.description,
        roomId: maintenanceForm.roomId,
      });
      setMaintenanceForm({ title: 'AC issue', description: 'A follow-up maintenance problem', roomId: 'room-201' });
      refreshDashboard();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Could not submit maintenance request');
    }
  };

  if (authRestoring) {
    return (
      <div className="boards-login-screen">
        <p className="boards-welcome">Restoring your session...</p>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div className="boards-login-screen">
        <div className="boards-login-card">
          <section className="boards-login-intro">
            <img className="boards-login-logo" src="/boards-logo.png" alt="Boards" />
            <div>
              <p className="boards-login-kicker">Boarding house management</p>
              <h1>Keep the house running smoothly.</h1>
              <p className="boards-login-description">Rooms, residents, and day-to-day details together in one place.</p>
            </div>
            <p className="boards-login-footnote">A simpler way to look after your property.</p>
          </section>

          <section className="boards-login-content">
            <div className="mb-6">
              <p className="boards-welcome">Welcome back</p>
              <h2 className="mt-2 text-2xl font-semibold">Sign in to Boards</h2>
            </div>

            <form onSubmit={login} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400" />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Password</label>
                <div className="flex overflow-hidden rounded-xl border border-slate-700 bg-slate-950 focus-within:border-cyan-400">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="px-3 text-sm text-cyan-300 hover:bg-slate-800"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {error && <div className="rounded-lg border border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-200">{error}</div>}
              <button type="submit" disabled={loading} className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="boards-app min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <header className="boards-topbar mb-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <img className="boards-dashboard-logo" src="/boards-logo.png" alt="Boards" />
              <h1 className="text-base font-semibold text-slate-800">{roleLabel} dashboard</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className={`rounded-full border px-3 py-1 text-xs ${connectionStatus === 'online' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : connectionStatus === 'offline' ? 'border-red-500 bg-red-500/10 text-red-300' : 'border-amber-500 bg-amber-500/10 text-amber-300'}`}>
                {connectionStatus === 'online' ? 'Online' : connectionStatus === 'offline' ? 'Reconnecting' : 'Connecting'}
              </div>
              <div className="text-sm text-slate-400">{user.name}</div>
              <button type="button" onClick={logout} className="boards-logout-button">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <path d="M8 3.5H4.75A1.75 1.75 0 0 0 3 5.25v9.5a1.75 1.75 0 0 0 1.75 1.75H8M12.5 6.5 16 10l-3.5 3.5M7 10h9" />
                </svg>
                <span>Log out</span>
              </button>
            </div>
          </div>
          {user.role !== 'tenant' && (
            <nav className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3" aria-label="Dashboard screens">
              <button type="button" onClick={() => setAdminScreen('dashboard')} aria-current={adminScreen === 'dashboard' ? 'page' : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${adminScreen === 'dashboard' ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>Dashboard</button>
              {(user.role === 'owner' || user.role === 'super_admin') && (
                <button type="button" onClick={() => setAdminScreen('create-room')} aria-current={adminScreen === 'create-room' ? 'page' : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${adminScreen === 'create-room' ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>Create Room</button>
              )}
              {(user.role === 'staff' || user.role === 'super_admin' || user.role === 'owner') && (
                <button type="button" onClick={() => setAdminScreen('register-tenant')} aria-current={adminScreen === 'register-tenant' ? 'page' : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${adminScreen === 'register-tenant' ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>Tenant Registration</button>
              )}
            </nav>
          )}
        </header>

        {(error || dashboardError) && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
            <span>{error || dashboardError}</span>
            <button type="button" onClick={() => { setError(''); setDashboardError(''); }} className="shrink-0 rounded px-2 py-1 hover:bg-red-900">Dismiss</button>
          </div>
        )}

        {dashboard ? (
          user.role === 'tenant' ? (
            <TenantDashboard
              dashboard={dashboard}
              maintenanceForm={maintenanceForm}
              setMaintenanceForm={setMaintenanceForm}
              onSubmitMaintenance={submitMaintenance}
            />
          ) : adminScreen === 'create-room' && (user.role === 'owner' || user.role === 'super_admin') ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-4 text-lg font-semibold">Create Room</h2>
              <form onSubmit={createRoom} className="grid gap-3 md:grid-cols-2">
                <input placeholder="Room Number" value={roomForm.roomNumber} onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                <input placeholder="Floor" value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                <select value={roomForm.type} onChange={(e) => setRoomForm({ ...roomForm, type: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                  <option value="suite">Suite</option>
                  <option value="shared">Shared</option>
                </select>
                <input placeholder="Capacity" value={roomForm.maxCapacity} onChange={(e) => setRoomForm({ ...roomForm, maxCapacity: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                <input placeholder="Monthly Rent" value={roomForm.monthlyRent} onChange={(e) => setRoomForm({ ...roomForm, monthlyRent: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white md:col-span-2" />
                <button type="submit" className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 md:col-span-2">Add Room</button>
              </form>
            </div>
          ) : adminScreen === 'register-tenant' && (user.role === 'staff' || user.role === 'super_admin' || user.role === 'owner') ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-4 text-lg font-semibold">Tenant Registration</h2>
              <form onSubmit={registerTenant} className="grid gap-3 md:grid-cols-2">
                <input required placeholder="Tenant Name" value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                <input placeholder="Phone" value={tenantForm.phone} onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                <input required type="email" placeholder="Login email" value={tenantForm.email} onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                <input required type="password" minLength={8} placeholder="Temporary password (8+ characters)" value={tenantForm.password} onChange={(e) => setTenantForm({ ...tenantForm, password: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                <select value={tenantForm.roomId} onChange={(e) => setTenantForm({ ...tenantForm, roomId: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white md:col-span-2">
                  <option value="">Register without room assignment</option>
                  {dashboard.rooms.filter((room) => room.status !== 'maintenance' && room.occupancy < room.maxCapacity).map((room) => (
                    <option key={room.id} value={room.id}>Room {room.roomNumber} · {room.maxCapacity - room.occupancy} bed(s) available</option>
                  ))}
                </select>
                <button type="submit" className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 md:col-span-2">Register Tenant</button>
              </form>
            </div>
          ) : (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <StatCard label="Total Rooms" value={dashboard.summary.totalRooms || dashboard.rooms.length} />
              <StatCard label="Available Rooms" value={dashboard.summary.availableRooms} />
              <StatCard label="Occupied Rooms" value={dashboard.summary.occupiedRooms} />
              <StatCard label="Income This Month" value={`₱${(dashboard.summary.monthlyIncome ?? 0).toLocaleString()}`} />
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
              <div className="min-w-0 space-y-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <h2 className="mb-4 text-lg font-semibold">Room Availability</h2>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {dashboard.rooms.map((room) => (
                      <div key={room.id} className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-semibold">Room {room.roomNumber}</span>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${room.status === 'available' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            {room.status}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm text-slate-300">
                          <div>Floor {room.floor}</div>
                          <div>{room.occupancy}/{room.maxCapacity} occupied</div>
                          <div>₱{room.monthlyRent.toLocaleString()}/month</div>
                          {room.facilities.length > 0 && <div>{room.facilities.join(', ')}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold">Tenant Directory</h2>
                    <p className="mt-1 text-xs text-slate-400">Check-out keeps the tenant and payment history; room transfers preserve assignment history.</p>
                  </div>
                  {dashboard.tenants.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="text-xs uppercase text-slate-500">
                          <tr><th className="pb-3">Tenant</th><th className="pb-3">Room</th><th className="pb-3">Status</th><th className="pb-3">Actions</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {dashboard.tenants.map((tenant) => (
                            <tr key={tenant.id}>
                              <td className="py-3"><div className="font-medium">{tenant.name}</div><div className="text-xs text-slate-400">{tenant.email}</div></td>
                              <td className="py-3">{dashboard.rooms.find((room) => room.id === tenant.roomId)?.roomNumber ?? 'Unassigned'}</td>
                              <td className="py-3 capitalize">{tenant.status.replace('_', ' ')}</td>
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <select
                                    aria-label={`Destination room for ${tenant.name}`}
                                    value={transferTargets[tenant.id] ?? ''}
                                    onChange={(event) => setTransferTargets({ ...transferTargets, [tenant.id]: event.target.value })}
                                    className="max-w-40 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                                  >
                                    <option value="">Choose room</option>
                                    {dashboard.rooms
                                      .filter((room) => room.id !== tenant.roomId && room.status !== 'maintenance' && room.occupancy < room.maxCapacity)
                                      .map((room) => (
                                        <option key={room.id} value={room.id}>Room {room.roomNumber} ({room.maxCapacity - room.occupancy} free)</option>
                                      ))}
                                  </select>
                                  <button type="button" onClick={() => moveTenant(tenant)} className="rounded-lg border border-cyan-700 px-2 py-1.5 text-xs text-cyan-300 hover:bg-cyan-950">
                                    {tenant.roomId ? 'Move' : 'Assign'}
                                  </button>
                                  {tenant.status !== 'checked_out' && (
                                    <button type="button" onClick={() => checkOutTenant(tenant)} className="rounded-lg border border-red-800 px-2 py-1.5 text-xs text-red-300 hover:bg-red-950">
                                      Check out
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="text-sm text-slate-400">No tenant records yet.</p>}
                </div>
              </div>

              <aside className="min-w-0 space-y-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <h2 className="mb-3 text-lg font-semibold">Notifications</h2>
                  <div className="space-y-3">
                    {dashboard.notifications.length > 0 ? dashboard.notifications.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                        <div className="font-medium text-cyan-300">{item.title}</div>
                        <div className="mt-1 text-sm text-slate-300">{item.message}</div>
                      </div>
                    )) : <div className="text-sm text-slate-400">No notifications.</div>}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <h2 className="mb-3 text-lg font-semibold">Announcements</h2>
                  <div className="space-y-3">
                    {dashboard.announcements.length > 0 ? dashboard.announcements.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200">{item.message}</div>
                    )) : <div className="text-sm text-slate-400">No announcements.</div>}
                  </div>
                </div>

                {user.role === 'staff' || user.role === 'super_admin' || user.role === 'owner' ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <h2 className="mb-3 text-lg font-semibold">Record Payment</h2>
                    <form onSubmit={savePayment} className="space-y-3">
                      <select value={paymentForm.tenantId} onChange={(e) => {
                        const selected = dashboard.tenants.find((tenant) => tenant.id === e.target.value);
                        setPaymentForm({ ...paymentForm, tenantId: e.target.value, roomId: selected?.roomId ?? '' });
                      }} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                        {dashboard.tenants.filter((tenant) => tenant.roomId).map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                        ))}
                      </select>
                      <input required type="number" min="0.01" step="0.01" placeholder="Amount" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                      <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                        <option value="cash">Cash</option>
                        <option value="gcash">GCash</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="other">Other</option>
                      </select>
                      <button type="submit" className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-white">Record Payment</button>
                    </form>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <h2 className="mb-3 text-lg font-semibold">Recent Payments</h2>
                  {dashboard.payments.length ? (
                    <div className="space-y-2">
                      {dashboard.payments.slice(-5).reverse().map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-3 text-sm">
                          <div><div>₱{payment.amount.toLocaleString()}</div><div className="text-xs text-slate-400">{payment.method.replace('_', ' ')}</div></div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-xs ${payment.status === 'confirmed' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{payment.status}</span>
                            {payment.status === 'pending' && (user.role === 'staff' || user.role === 'owner' || user.role === 'super_admin') && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await api.patch(`/payments/${payment.id}/confirm`);
                                    await refreshDashboard();
                                  } catch (requestError) {
                                    setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Could not confirm payment' : 'Could not confirm payment');
                                  }
                                }}
                                className="rounded border border-emerald-800 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-950"
                              >
                                Confirm
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-slate-400">No payments recorded.</p>}
                </div>

                {(user.role === 'staff' || user.role === 'owner' || user.role === 'super_admin') && (
                  <MaintenanceQueue
                    requests={dashboard.maintenanceRequests}
                    onStatusChange={async (id, status) => {
                      try {
                        await api.patch(`/maintenance/${id}`, { status });
                        await refreshDashboard();
                      } catch (requestError) {
                        setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Could not update request' : 'Could not update request');
                      }
                    }}
                  />
                )}
              </aside>
            </section>
          </>
          )
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-8 text-center">
            {dashboardLoading ? (
              <p className="text-slate-400">Loading dashboard...</p>
            ) : (
              <div>
                <p className="text-red-300">{dashboardError || 'Dashboard data is not available.'}</p>
                <button type="button" onClick={refreshDashboard} className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Try again</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TenantDashboard({
  dashboard,
  maintenanceForm,
  setMaintenanceForm,
  onSubmitMaintenance,
}: {
  dashboard: DashboardState;
  maintenanceForm: { title: string; description: string; roomId: string };
  setMaintenanceForm: Dispatch<SetStateAction<{ title: string; description: string; roomId: string }>>;
  onSubmitMaintenance: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const room = dashboard.rooms[0];
  const tenant = dashboard.tenant;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Monthly Rent" value={room ? `₱${room.monthlyRent.toLocaleString()}` : '—'} />
        <StatCard label="Paid This Month" value={`₱${(dashboard.currentMonthPaid ?? 0).toLocaleString()}`} />
        <StatCard label="Balance Due" value={`₱${(dashboard.monthlyBalance ?? 0).toLocaleString()}`} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">Your Stay</h2>
            {tenant && room ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <InfoItem label="Tenant" value={tenant.name} />
                <InfoItem label="Room" value={`Room ${room.roomNumber} · Floor ${room.floor}`} />
                <InfoItem label="Boarding House" value={dashboard.boardingHouse?.name ?? 'Boarding House'} />
                <InfoItem label="Address" value={dashboard.boardingHouse?.address ?? 'Address not listed'} />
                <InfoItem label="Room Type" value={room.type} />
                {room.facilities.length > 0 && <InfoItem label="Facilities" value={room.facilities.join(', ')} />}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                {tenant ? 'No room has been assigned to your account yet. Please contact the boarding house staff.' : 'Your tenant profile has not been linked yet. Please contact the boarding house staff.'}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">Payment History</h2>
            {dashboard.payments.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr><th className="pb-3">Date</th><th className="pb-3">Method</th><th className="pb-3">Amount</th><th className="pb-3">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {[...dashboard.payments].reverse().map((payment) => (
                      <tr key={payment.id}>
                        <td className="py-3">{payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : '—'}</td>
                        <td className="py-3 capitalize">{payment.method.replace('_', ' ')}</td>
                        <td className="py-3">₱{payment.amount.toLocaleString()}</td>
                        <td className="py-3 capitalize">{payment.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-400">No payments have been recorded for your account.</p>}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">Submit a Maintenance Request</h2>
            <form onSubmit={onSubmitMaintenance} className="space-y-3">
              <input required placeholder="Issue title" value={maintenanceForm.title} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, title: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              <textarea required placeholder="Describe the problem" value={maintenanceForm.description} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, description: event.target.value })} className="min-h-[110px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              <button type="submit" className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950">Submit Request</button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">Request Status</h2>
            {dashboard.maintenanceRequests.length ? (
              <div className="space-y-3">
                {[...dashboard.maintenanceRequests].reverse().map((request) => (
                  <div key={request.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">{request.title}</div>
                      <span className="shrink-0 rounded-full bg-cyan-500/15 px-2 py-1 text-xs capitalize text-cyan-300">{request.status.replace('_', ' ')}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{request.description}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">You haven’t submitted any maintenance requests.</p>}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 text-lg font-semibold">Announcements</h2>
            {dashboard.announcements.length ? (
              <div className="space-y-2">
                {dashboard.announcements.map((announcement) => (
                  <p key={announcement.id} className="rounded-lg bg-slate-950 p-3 text-sm text-slate-300">{announcement.message}</p>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">No announcements at this time.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium capitalize text-slate-200">{value}</div>
    </div>
  );
}

function MaintenanceQueue({
  requests,
  onStatusChange,
}: {
  requests: MaintenanceRequest[];
  onStatusChange: (id: string, status: 'in_progress' | 'completed') => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-lg font-semibold">Maintenance Queue</h2>
      {requests.length ? (
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{request.title}</div>
                <span className="text-xs capitalize text-amber-300">{request.status.replace('_', ' ')}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{request.description}</p>
              {request.status !== 'completed' && (
                <button
                  type="button"
                  onClick={() => onStatusChange(request.id, request.status === 'submitted' ? 'in_progress' : 'completed')}
                  className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800"
                >
                  {request.status === 'submitted' ? 'Start work' : 'Mark completed'}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-slate-400">No maintenance requests.</p>}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="boards-stat-card">
      <div className="boards-stat-label">{label}</div>
      <div className="boards-stat-value">{value}</div>
    </div>
  );
}
