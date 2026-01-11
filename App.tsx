
import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { User, UserRole, RFQ, Bid, RFQStatus } from './types';
import { Icons, COLORS } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// --- 数据模型映射转换 ---
const Map = {
  rfq: {
    toModel: (d: any): RFQ => ({
      id: d.id, title: d.title, description: d.description, deadline: d.deadline,
      status: d.status as RFQStatus, createdAt: d.created_at, creatorId: d.creator_id, items: []
    }),
    toDB: (m: RFQ) => ({
      id: m.id, title: m.title, description: m.description, deadline: m.deadline,
      status: m.status, creator_id: m.creatorId
    })
  },
  bid: {
    toModel: (d: any): Bid => ({
      id: d.id, rfqId: d.rfq_id, vendorId: d.vendor_id, vendorName: d.vendor_name,
      amount: Number(d.amount), currency: 'CNY', deliveryDate: '', notes: '', timestamp: d.timestamp, itemQuotes: []
    }),
    toDB: (m: Bid) => ({
      id: m.id, rfq_id: m.rfqId, vendor_id: m.vendorId, vendor_name: m.vendorName, amount: m.amount
    })
  },
  user: {
    toModel: (d: any): User => ({
      id: d.id, name: d.name, role: d.role as UserRole, company: d.company, password: d.password, createdAt: d.created_at
    }),
    toDB: (m: User) => ({
      id: m.id, name: m.name, role: m.role, company: m.company, password: m.password
    })
  }
};

const INITIAL_USERS: User[] = [
  { id: 'admin', name: '系统管理员', role: UserRole.SYS_ADMIN, company: 'QuickBid', password: 'admin', createdAt: new Date().toISOString() },
  { id: 'buyer', name: '王采购', role: UserRole.ADMIN, company: '演示采购中心', password: '123', createdAt: new Date().toISOString() },
  { id: 'vendor1', name: '李供货', role: UserRole.VENDOR, company: '演示供应商', password: '123', createdAt: new Date().toISOString() }
];

const getCloudConfig = () => ({
  url: localStorage.getItem('qb_cloud_url') || '',
  key: localStorage.getItem('qb_cloud_key') || ''
});

let supabase: any = null;
const initSupabase = () => {
  const { url, key } = getCloudConfig();
  if (url && key) {
    try { supabase = createClient(url, key); } catch (e) { console.error("Supabase Init Error:", e); }
  }
};
initSupabase();

const DataService = {
  isCloud() { return !!supabase; },
  
  async getRFQs() {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_r') || '[]');
    const { data, error } = await supabase.from('rfqs').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map(Map.rfq.toModel);
  },

  async getBids() {
    if (!supabase) return JSON.parse(localStorage.getItem('qb_b') || '[]');
    const { data, error } = await supabase.from('bids').select('*');
    if (error) return [];
    return (data || []).map(Map.bid.toModel);
  },

  async getUsers() {
    const localUsers = JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS));
    if (!supabase) return localUsers;
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      const cloudUsers = (data || []).map(Map.user.toModel);
      if (cloudUsers.length === 0) return INITIAL_USERS;
      const combined = [...cloudUsers];
      INITIAL_USERS.forEach(u => {
        if (!combined.find(c => c.id === u.id)) combined.push(u);
      });
      return combined;
    } catch (e) {
      return localUsers;
    }
  },

  async saveRFQ(rfq: RFQ) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_r') || '[]');
      localStorage.setItem('qb_r', JSON.stringify([rfq, ...local]));
      return;
    }
    await supabase.from('rfqs').upsert(Map.rfq.toDB(rfq));
  },

  async saveBid(bid: Bid) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_b') || '[]');
      const idx = local.findIndex((b: any) => b.rfqId === bid.rfqId && b.vendorId === bid.vendorId);
      if(idx >= 0) local[idx] = bid; else local.push(bid);
      localStorage.setItem('qb_b', JSON.stringify(local));
      return;
    }
    await supabase.from('bids').upsert(Map.bid.toDB(bid));
  },

  async saveUser(user: User) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS));
      const idx = local.findIndex((u: any) => u.id === user.id);
      if (idx >= 0) local[idx] = user; else local.push(user);
      localStorage.setItem('qb_u', JSON.stringify(local));
      return;
    }
    await supabase.from('users').upsert(Map.user.toDB(user));
  },

  async deleteUser(id: string) {
    if (!supabase) {
      const local = JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS));
      const filtered = local.filter((u: any) => u.id !== id);
      localStorage.setItem('qb_u', JSON.stringify(filtered));
      return;
    }
    await supabase.from('users').delete().eq('id', id);
  }
};

const Badge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    [RFQStatus.OPEN]: 'bg-green-100 text-green-800',
    [RFQStatus.CLOSED]: 'bg-gray-100 text-gray-800',
    [RFQStatus.AWARDED]: 'bg-blue-100 text-blue-800',
    [UserRole.SYS_ADMIN]: 'bg-purple-100 text-purple-800',
    [UserRole.ADMIN]: 'bg-indigo-100 text-indigo-800',
    [UserRole.VENDOR]: 'bg-emerald-100 text-emerald-800',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${styles[status] || 'bg-gray-100 text-gray-800'}`}>{status}</span>;
};

// --- 报价列表组件 (甲方可见) ---
const BidsTable: React.FC<{ bids: Bid[] }> = ({ bids }) => {
  const exportCSV = () => {
    const headers = ['供应商', '公司', '报价金额', '报价时间'];
    const rows = bids.map(b => [b.vendorName, b.vendorName, b.amount, new Date(b.timestamp).toLocaleString()]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `项目报价清单_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-black text-gray-700 uppercase text-xs tracking-widest">报价清单 (按价格升序)</h4>
        <button onClick={exportCSV} className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase hover:underline">
          <Icons.Download /> 导出 EXCEL/CSV
        </button>
      </div>
      <div className="bg-gray-50 rounded-3xl overflow-hidden border border-gray-100">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-gray-100/50">
              <th className="p-4 font-black text-gray-400 uppercase text-[10px]">供应商</th>
              <th className="p-4 font-black text-gray-400 uppercase text-[10px]">最终报价 (CNY)</th>
              <th className="p-4 font-black text-gray-400 uppercase text-[10px]">更新时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bids.sort((a,b)=>a.amount - b.amount).map(b => (
              <tr key={b.id} className="hover:bg-white transition-colors">
                <td className="p-4 font-bold text-gray-800">{b.vendorName}</td>
                <td className="p-4 font-black text-indigo-600">¥ {b.amount.toLocaleString()}</td>
                <td className="p-4 text-gray-400 text-xs">{new Date(b.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RFQDetail: React.FC<{ rfq: RFQ, bids: Bid[], user: User, onAddBid: (bid: Bid) => void }> = ({ rfq, bids, user, onAddBid }) => {
  const [amount, setAmount] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const rfqBids = useMemo(() => bids.filter(b => b.rfqId === rfq.id), [bids, rfq.id]);
  
  // 核心逻辑：计算当前最低价
  const lowestBid = useMemo(() => {
    if (rfqBids.length === 0) return null;
    return rfqBids.reduce((min, b) => b.amount < min.amount ? b : min, rfqBids[0]);
  }, [rfqBids]);

  const myBid = rfqBids.find(b => b.vendorId === user.id);
  const isBuyer = user.role === UserRole.ADMIN || user.role === UserRole.SYS_ADMIN;

  const submitBid = async () => {
    const val = parseFloat(amount);
    if(isNaN(val) || val <= 0) return alert('请输入有效报价金额');
    setIsSyncing(true);
    try {
      const bid: Bid = {
        id: myBid?.id || 'B-'+Date.now(), rfqId: rfq.id, vendorId: user.id, vendorName: user.company || user.name,
        amount: val, currency: 'CNY', deliveryDate: '', notes: '', timestamp: new Date().toISOString(), itemQuotes: []
      };
      await DataService.saveBid(bid);
      onAddBid(bid);
      alert('报价已成功提交');
      setAmount('');
    } catch (e) {
      alert('数据同步失败，请检查网络');
    } finally { setIsSyncing(false); }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* 项目基本信息 */}
      <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
        <div className="flex justify-between items-start">
          <Badge status={rfq.status} />
          <span className="text-[10px] font-black text-gray-300 uppercase">ID: {rfq.id}</span>
        </div>
        <h2 className="text-3xl font-black mt-2 mb-4 text-gray-900">{rfq.title}</h2>
        <p className="text-gray-500 text-sm leading-relaxed">{rfq.description || '暂无详细描述'}</p>
        <div className="mt-6 pt-6 border-t border-gray-50 flex gap-10">
           <div>
             <p className="text-[10px] font-black text-gray-400 uppercase">截止日期</p>
             <p className="font-bold text-gray-700">{rfq.deadline}</p>
           </div>
           <div>
             <p className="text-[10px] font-black text-gray-400 uppercase">收到报价</p>
             <p className="font-bold text-gray-700">{rfqBids.length} 份</p>
           </div>
        </div>
      </div>

      {isBuyer ? (
        /* 甲方视图：完整的图表和列表 */
        <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-50">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-black text-xl text-gray-800">全量竞价分析</h3>
            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-2xl">
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-black text-indigo-600 uppercase">实时同步中</span>
            </div>
          </div>
          {rfqBids.length > 0 ? (
            <>
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart data={[...rfqBids].sort((a,b)=>a.amount - b.amount)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="vendorName" fontSize={10} fontWeight="bold" />
                    <YAxis fontSize={10} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: '#F9FAFB'}} contentStyle={{borderRadius: '24px', border: 'none', fontWeight: 'bold'}} />
                    <Bar dataKey="amount" fill="#4F46E5" radius={[12, 12, 0, 0]} barSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <BidsTable bids={rfqBids} />
            </>
          ) : <div className="text-center py-20 text-gray-300 font-black italic">等待供应商提交报价数据</div>}
        </div>
      ) : (
        /* 乙方视图：市场最低价提示 + 我的报价记录 */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 市场行情卡片 */}
            <div className="bg-indigo-600 p-8 rounded-[40px] shadow-xl text-white">
              <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-2">当前市场最低报价</p>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-black">¥</span>
                <h3 className="text-4xl font-black">
                  {lowestBid ? lowestBid.amount.toLocaleString() : '---'}
                </h3>
              </div>
              <p className="text-[10px] mt-4 font-bold opacity-80">
                {lowestBid ? '所有参与方中的最优价格，保持您的竞争力。' : '您将是第一个出价的供应商。'}
              </p>
            </div>

            {/* 我的状态卡片 */}
            <div className={`p-8 rounded-[40px] shadow-xl border-2 ${myBid ? (lowestBid && myBid.amount === lowestBid.amount ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-amber-200') : 'bg-white border-gray-100'}`}>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">我的最新报价</p>
              {myBid ? (
                <>
                  <div className="flex items-baseline gap-2 text-gray-900">
                    <span className="text-sm font-black">¥</span>
                    <h3 className="text-4xl font-black">{myBid.amount.toLocaleString()}</h3>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    {lowestBid && myBid.amount === lowestBid.amount ? (
                      <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full uppercase">您当前出价最低</span>
                    ) : (
                      <span className="text-[10px] font-black text-amber-600 bg-amber-100 px-3 py-1 rounded-full uppercase">
                        高于最低价 ¥{(myBid.amount - (lowestBid?.amount || 0)).toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center">
                  <p className="text-gray-300 font-black italic">您尚未参与本项目报价</p>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-[10px] font-black text-gray-300 uppercase">
            信息隔离说明：您仅能看到市场最低价的数值，无法获知其他竞争对手的名称或明细。
          </p>
        </div>
      )}

      {/* 报价提交区 (仅乙方) */}
      {user.role === UserRole.VENDOR && rfq.status === RFQStatus.OPEN && (
        <div className="bg-white p-8 rounded-[40px] shadow-2xl border border-gray-100 flex flex-col sm:flex-row gap-4 sticky bottom-8">
          <div className="flex-1 relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-gray-400">¥</span>
            <input 
              type="number" 
              placeholder="输入您的含税总报价" 
              className="w-full pl-10 pr-5 py-5 bg-gray-50 rounded-2xl font-black text-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
              value={amount} 
              onChange={e=>setAmount(e.target.value)} 
            />
          </div>
          <button 
            onClick={submitBid} 
            disabled={isSyncing} 
            className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
          >
            {isSyncing ? '正在同步...' : (myBid ? '更新我的报价' : '确认参与竞价')}
          </button>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('qb_curr_u');
    return saved ? JSON.parse(saved) : null;
  });
  const [showCloudSet, setShowCloudSet] = useState(false);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) localStorage.setItem('qb_curr_u', JSON.stringify(user));
    else localStorage.removeItem('qb_curr_u');
  }, [user]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [r, b, u] = await Promise.all([DataService.getRFQs(), DataService.getBids(), DataService.getUsers()]);
      setRfqs(r); setBids(b); setUsers(u);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    loadAll();
    if (supabase) {
      const sub = supabase.channel('global-sync').on('postgres_changes', { event: '*', schema: 'public' }, loadAll).subscribe();
      return () => { supabase.removeChannel(sub); };
    }
  }, []);

  if (!user) return <AuthPage onAuth={setUser} />;

  const isSysAdmin = user.role === UserRole.SYS_ADMIN;
  const isBuyer = user.role === UserRole.ADMIN || isSysAdmin;

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-indigo-100">
        {showCloudSet && <CloudSettings onClose={() => setShowCloudSet(false)} />}
        <nav className="h-20 bg-white/70 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-100 px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 font-black text-2xl text-indigo-600">
            <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-100"><Icons.Shield /></div>
            <span className="hidden sm:inline tracking-tighter">QuickBid</span>
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={loadAll} className={`p-3 rounded-2xl text-gray-400 hover:bg-gray-100 transition-all ${loading ? 'animate-spin text-indigo-600' : ''}`} title="手动同步数据">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            {isSysAdmin && <Link to="/users" className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:text-indigo-600 hover:bg-white transition-all shadow-sm"><Icons.User /></Link>}
            <button onClick={() => setShowCloudSet(true)} className={`p-3 rounded-2xl transition-all ${DataService.isCloud() ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600 animate-pulse'}`} title="数据库配置"><Icons.Settings /></button>
            <div className="h-8 w-[1px] bg-gray-100 mx-2"></div>
            <button onClick={() => { if(confirm('确认退出登录？')) setUser(null); }} className="text-[10px] font-black text-red-500 uppercase bg-red-50 px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all">登出</button>
          </div>
        </nav>

        <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
          <Routes>
            <Route path="/" element={
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">询价项目大厅</h2>
                    <p className="text-gray-400 text-xs mt-1 font-bold">
                      {DataService.isCloud() ? '🌐 实时同步模式已激活' : '🔕 处于本地沙盒模式'}
                    </p>
                  </div>
                  {isBuyer && (
                    <button onClick={async () => {
                      const title = window.prompt('询价项目名称:');
                      if(!title) return;
                      const r: RFQ = { id: 'R-'+Date.now(), title, description: '需求详见项目附件及描述...', deadline: new Date(Date.now() + 7*24*3600*1000).toISOString().split('T')[0], status: RFQStatus.OPEN, createdAt: new Date().toISOString(), creatorId: user.id, items: [] };
                      await DataService.saveRFQ(r);
                      setRfqs(p => [r, ...p]);
                    }} className="bg-indigo-600 text-white p-5 rounded-[28px] shadow-2xl shadow-indigo-200 hover:scale-110 active:scale-95 transition-all"><Icons.Plus /></button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {rfqs.map(r => (
                    <Link key={r.id} to={`/rfq/${r.id}`} className="group bg-white p-10 rounded-[48px] border border-gray-50 shadow-sm hover:shadow-2xl hover:border-indigo-100 transition-all">
                      <div className="flex justify-between items-center mb-4">
                        <Badge status={r.status} />
                        <span className="text-[10px] font-black text-gray-300">#{r.id.slice(-4)}</span>
                      </div>
                      <h3 className="text-2xl font-black text-gray-800 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2">{r.title}</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">截止: {r.deadline}</p>
                    </Link>
                  ))}
                  {rfqs.length === 0 && <div className="col-span-full py-24 text-center text-gray-300 font-black italic border-2 border-dashed border-gray-100 rounded-[48px]">暂无公开的询价项目</div>}
                </div>
              </div>
            } />
            <Route path="/users" element={isSysAdmin ? <UsersManagement users={users} onUpdate={loadAll} /> : <Navigate to="/" />} />
            <Route path="/rfq/:id" element={<RFQDetailWrapper rfqs={rfqs} bids={bids} user={user} setBids={setBids} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

// --- 用户管理组件 (系统管理员可见) ---
const UsersManagement = ({ users, onUpdate }: { users: User[], onUpdate: () => void }) => {
  const handleDelete = async (id: string) => {
    if(id === 'admin') return alert('不能删除内置管理员账号');
    if(!confirm('确定删除该用户？此操作不可撤销。')) return;
    await DataService.deleteUser(id);
    onUpdate();
  };

  const handleResetPassword = async (user: User) => {
    const newPass = prompt(`为用户 [${user.name}] 设置新密码:`, '123456');
    if(!newPass) return;
    await DataService.saveUser({ ...user, password: newPass });
    alert('密码已更新为: ' + newPass);
    onUpdate();
  };

  const handleAddUser = async () => {
    const id = prompt('输入登录 ID (账号):');
    if(!id) return;
    const name = prompt('输入姓名或公司名称:');
    if(!name) return;
    const roleStr = prompt('选择角色 (1: 乙方/供应商, 2: 甲方/采购员):', '1');
    const role = roleStr === '2' ? UserRole.ADMIN : UserRole.VENDOR;
    const password = prompt('设置初始登录密码:', '123456');
    if(!password) return;

    await DataService.saveUser({
      id, name, role, company: name, password, createdAt: new Date().toISOString()
    });
    alert('用户已成功创建');
    onUpdate();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-gray-900 tracking-tight">用户权限控制台</h2>
        <button onClick={handleAddUser} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-lg shadow-indigo-100 hover:scale-105 transition-all">
          新增账户
        </button>
      </div>
      <div className="bg-white rounded-[40px] shadow-sm border border-gray-50 overflow-hidden">
        <table className="w-full text-left">
          <thead><tr className="bg-gray-50/50">
            <th className="p-6 text-[10px] font-black uppercase text-gray-400">账号</th>
            <th className="p-6 text-[10px] font-black uppercase text-gray-400">显示名称/公司</th>
            <th className="p-6 text-[10px] font-black uppercase text-gray-400">权限级别</th>
            <th className="p-6 text-[10px] font-black uppercase text-gray-400 text-right">管理操作</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50/30 transition-colors">
                <td className="p-6 font-black text-indigo-600">{u.id}</td>
                <td className="p-6 font-bold text-gray-900">{u.name}<br/><span className="text-[10px] text-gray-400 uppercase font-black">{u.company || '-'}</span></td>
                <td className="p-6"><Badge status={u.role} /></td>
                <td className="p-6 text-right space-x-2">
                  <button onClick={()=>handleResetPassword(u)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-all" title="重置密码"><Icons.Settings /></button>
                  {u.id !== 'admin' && (
                    <button onClick={()=>handleDelete(u.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all" title="注销用户"><Icons.Trash /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RFQDetailWrapper = ({ rfqs, bids, user, setBids }: any) => {
  const { id } = useParams();
  const rfq = rfqs.find((r:any) => r.id === id);
  if (!rfq) return <div className="text-center py-40 text-gray-300 font-black italic animate-pulse">正在获取项目详情...</div>;
  return <RFQDetail rfq={rfq} bids={bids} user={user} onAddBid={b => setBids((p:any) => {
    const idx = p.findIndex((x:any)=>x.rfqId===b.rfqId && x.vendorId===b.vendorId);
    if(idx>=0){ const n = [...p]; n[idx]=b; return n; }
    return [b, ...p];
  })} />;
};

const CloudSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [cfg, setCfg] = useState(getCloudConfig());
  const save = () => {
    localStorage.setItem('qb_cloud_url', cfg.url.trim());
    localStorage.setItem('qb_cloud_key', cfg.key.trim());
    window.location.reload();
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl animate-in zoom-in-95 duration-300">
        <h3 className="text-xl font-black mb-6">Supabase 云端配置</h3>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">配置后即可实现跨设备实时竞价</p>
        <div className="space-y-4">
          <input type="text" placeholder="Project URL" className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-indigo-500 outline-none" value={cfg.url} onChange={e=>setCfg({...cfg, url: e.target.value})} />
          <input type="password" placeholder="Anon Key" className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-indigo-500 outline-none" value={cfg.key} onChange={e=>setCfg({...cfg, key: e.target.value})} />
          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="flex-1 p-4 bg-gray-100 rounded-2xl font-black text-xs uppercase hover:bg-gray-200 transition-colors">关闭</button>
            <button onClick={save} className="flex-1 p-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">保存并重启</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AuthPage: React.FC<{ onAuth: (user: User) => void }> = ({ onAuth }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ id: '', password: '', name: '', company: '', role: UserRole.VENDOR });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const all = await DataService.getUsers();
      if (isLogin) {
        const u = all.find((x:any) => x.id.toLowerCase() === formData.id.toLowerCase() && x.password === formData.password);
        if (u) { onAuth(u); } else { alert(`账号或密码不匹配，请检查。`); }
      } else {
        if (!formData.id || !formData.password || !formData.name) return alert('请提供完整的注册信息');
        if (all.find((x:any) => x.id === formData.id)) return alert('账号 ID 已被占用');
        const newUser = { ...formData, createdAt: new Date().toISOString() };
        await DataService.saveUser(newUser);
        onAuth(newUser);
      }
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[60px] p-12 shadow-2xl animate-in zoom-in-95 duration-500">
        <div className="text-center mb-10">
           <div className="inline-block p-5 bg-indigo-600 text-white rounded-[24px] mb-4 shadow-2xl shadow-indigo-100"><Icons.Shield /></div>
           <h1 className="text-3xl font-black text-gray-900 tracking-tighter">QuickBid</h1>
           <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">企业级实时竞价平台</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="账户 ID" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition-all" value={formData.id} onChange={e=>setFormData({...formData, id: e.target.value})} />
          {!isLogin && (
            <>
              <input type="text" placeholder="公司/机构名称" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition-all" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} />
              <select className="w-full p-5 bg-gray-50 rounded-3xl font-black text-indigo-600 outline-none" value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value as UserRole})}>
                <option value={UserRole.VENDOR}>作为供应商 (乙方) 注册</option>
                <option value={UserRole.ADMIN}>作为采购方 (甲方) 注册</option>
              </select>
            </>
          )}
          <input type="password" placeholder="访问密码" required className="w-full p-5 bg-gray-50 rounded-3xl font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition-all" value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} />
          <button disabled={isSubmitting} className="w-full bg-indigo-600 text-white py-6 rounded-[32px] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all mt-4 disabled:opacity-50">
            {isSubmitting ? '正在处理...' : (isLogin ? '安全登录' : '立即创建账户')}
          </button>
        </form>
        <button onClick={()=>setIsLogin(!isLogin)} className="w-full mt-10 text-indigo-600 text-[10px] font-black uppercase tracking-widest text-center hover:underline">
          {isLogin ? '还没有账户？点击注册' : '已有账户？返回登录'}
        </button>
      </div>
    </div>
  );
};

export default App;
