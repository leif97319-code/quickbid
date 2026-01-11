
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { User, UserRole, RFQ, Bid, RFQStatus } from './types';
import { Icons, COLORS } from './constants';
import { analyzeBids } from './services/geminiService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// --- 初始数据与 Mock ---
const INITIAL_USERS: User[] = [
  { id: 'admin-master', name: '系统管理员', role: UserRole.SYS_ADMIN, company: 'QuickBid 官方', password: 'admin', createdAt: new Date().toISOString() },
  { id: 'buyer-1', name: '采购王工', role: UserRole.ADMIN, company: '顺达电子', password: '123', createdAt: new Date().toISOString() },
  { id: 'vendor-1', name: '供应小李', role: UserRole.VENDOR, company: '博科技术', password: '123', createdAt: new Date().toISOString() }
];

const INITIAL_RFQS: RFQ[] = [
  {
    id: 'RFQ-2024-001',
    title: '500套 工业传感器采购项目',
    description: '寻找用于工厂自动化的高精度温湿度传感器。需支持工业标准协议，具备长寿命特性。',
    deadline: '2025-03-31',
    budget: 15000,
    status: RFQStatus.OPEN,
    createdAt: new Date().toISOString(),
    creatorId: 'buyer-1',
    items: [{ id: 'item-1', name: '高精度温湿度传感器 V2', quantity: 500, unit: '套' }]
  }
];

// --- 通用 UI 组件 ---
const Badge = ({ status, colorClass }: { status: string, colorClass?: string }) => {
  const defaultStyles: Record<string, string> = {
    [RFQStatus.OPEN]: 'bg-green-100 text-green-800',
    [RFQStatus.CLOSED]: 'bg-gray-100 text-gray-800',
    [RFQStatus.AWARDED]: 'bg-blue-100 text-blue-800',
    [UserRole.SYS_ADMIN]: 'bg-purple-100 text-purple-800',
    [UserRole.ADMIN]: 'bg-indigo-100 text-indigo-800',
    [UserRole.VENDOR]: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${colorClass || defaultStyles[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
};

// --- 页面：系统用户管理 ---
const SystemAdminPanel: React.FC<{ 
  users: User[], 
  setUsers: React.Dispatch<React.SetStateAction<User[]>>,
  rfqs: RFQ[],
  setRfqs: React.Dispatch<React.SetStateAction<RFQ[]>>,
  bids: Bid[],
  setBids: React.Dispatch<React.SetStateAction<Bid[]>>
}> = ({ users, setUsers, rfqs, setRfqs, bids, setBids }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const toggleRole = (userId: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: u.role === UserRole.VENDOR ? UserRole.ADMIN : UserRole.VENDOR } : u));
  };

  const resetPassword = (userId: string) => {
    const newPass = window.prompt('请输入该用户的新密码:');
    if (newPass !== null && newPass.trim() !== '') {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, password: newPass.trim() } : u));
      alert('密码重置成功！');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-black flex items-center gap-2 text-indigo-900"><Icons.Settings /> 系统后台管理</h2>
        <div className="flex w-full sm:w-auto gap-2">
          <input type="file" ref={fileInputRef} onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const r = new FileReader();
            r.onload = (ev) => {
              const json = JSON.parse(ev.target?.result as string);
              setUsers(json.users); setRfqs(json.rfqs); setBids(json.bids);
              alert('数据已恢复');
            };
            r.readAsText(file);
          }} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest border border-gray-200 p-3 rounded-2xl bg-white hover:bg-gray-50 transition-colors">导入数据</button>
          <button onClick={() => {
            const data = JSON.stringify({ users, rfqs, bids });
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `QuickBid_Backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
          }} className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white p-3 rounded-2xl shadow-lg shadow-indigo-100 active:scale-95 transition-transform">备份全站</button>
        </div>
      </div>
      
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">账户/公司</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">系统权限</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">当前密码</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">管理操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-bold text-sm text-gray-900">{u.name} <span className="text-gray-300 font-normal ml-1">#{u.id}</span></p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{u.company || '个人用户'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4"><Badge status={u.role} /></td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">
                      {u.password ? '••••••' : '未设置'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => resetPassword(u.id)} 
                        className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl hover:bg-indigo-100 transition-colors"
                      >
                        重置密码
                      </button>
                      {u.role !== UserRole.SYS_ADMIN && (
                        <button 
                          onClick={() => toggleRole(u.id)} 
                          className="text-[10px] font-black uppercase text-gray-400 hover:text-indigo-600 px-3 py-2 rounded-xl transition-colors"
                        >
                          切换身份
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100">
        <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest mb-2 flex items-center gap-2">
          <Icons.Shield /> 安全提醒
        </h4>
        <p className="text-xs text-amber-700 leading-relaxed">
          管理员重置密码后，请务必通过安全渠道告知对方。由于采用本地存储技术，所有数据目前仅保存在您的浏览器中，请定期通过“备份全站”功能下载 JSON 文件以防数据丢失。
        </p>
      </div>
    </div>
  );
};

// --- 页面：登录 ---
const AuthPage: React.FC<{ users: User[], onAuth: (user: User) => void, onRegister: (user: User) => void }> = ({ users, onAuth, onRegister }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ id: '', password: '', name: '', company: '', role: UserRole.VENDOR });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      const found = users.find(u => u.id === formData.id && u.password === formData.password);
      if (found) onAuth(found); else alert('账号或密码错误，请联系管理员重置');
    } else {
      const newUser = { ...formData, createdAt: new Date().toISOString() };
      onRegister(newUser); onAuth(newUser);
    }
  };

  return (
    <div className="min-h-screen bg-white md:bg-gray-100 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 md:shadow-xl border-none md:border">
        <div className="text-center mb-8">
          <div className="inline-block p-4 bg-indigo-600 text-white rounded-2xl mb-4 shadow-lg shadow-indigo-100"><Icons.Shield /></div>
          <h1 className="text-2xl font-black">QuickBid 询价协同</h1>
          <p className="text-gray-400 text-sm mt-2">高效·隔离·智能的竞价平台</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="账户 ID" required className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} />
          {!isLogin && (
            <>
              <input type="text" placeholder="姓名" required className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <input type="text" placeholder="公司名" required className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} />
              <select className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold text-gray-600" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                <option value={UserRole.VENDOR}>我是供应商 (乙方)</option>
                <option value={UserRole.ADMIN}>我是采购经理 (甲方)</option>
              </select>
            </>
          )}
          <input type="password" placeholder="密码" required className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
          <button className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-indigo-100 active:scale-95 transition-transform">
            {isLogin ? '立即登录' : '快速注册并登录'}
          </button>
        </form>
        <button onClick={() => setIsLogin(!isLogin)} className="w-full mt-6 text-indigo-600 text-sm font-bold">
          {isLogin ? '还没有账号？点此快速注册' : '已有账号？返回登录'}
        </button>
      </div>
    </div>
  );
};

// --- 询价单详情 (微信适配版) ---
const RFQDetail: React.FC<{ rfq: RFQ, bids: Bid[], user: User, onAddBid: (bid: Bid) => void }> = ({ rfq, bids, user, onAddBid }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState('');
  const [amount, setAmount] = useState('');
  const rfqBids = bids.filter(b => b.rfqId === rfq.id);
  const myBid = rfqBids.find(b => b.vendorId === user.id);
  
  const currentMinPrice = rfqBids.length > 0 ? Math.min(...rfqBids.map(b => b.amount)) : null;

  const handleShare = () => {
    const text = `【询价邀请】${rfq.title}\n采购需求：${rfq.description.substring(0, 30)}...\n点击下方链接直接参与竞价：\n`;
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: '询价邀请', text: text, url: url }).catch(() => copyToClipboard(text + url));
    } else {
      copyToClipboard(text + url);
    }
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      alert('【分享文案已复制】\n请在微信中粘贴发送给供应商。对方点击即可参与报价。');
    }).catch(() => alert('复制失败，请手动截图或复制网址发送'));
  };

  const handleBid = (e: React.FormEvent) => {
    e.preventDefault();
    onAddBid({
      id: myBid?.id || Date.now().toString(),
      rfqId: rfq.id,
      vendorId: user.id,
      vendorName: user.company || user.name,
      amount: parseFloat(amount),
      currency: 'CNY',
      deliveryDate: '2025-05-01',
      notes: '在线提交',
      timestamp: new Date().toISOString(),
      itemQuotes: []
    });
    alert('报价提交成功！');
  };

  const chartData = rfqBids.map(b => ({ name: b.vendorName, price: b.amount })).sort((a,b) => a.price - b.price);

  return (
    <div className="flex flex-col gap-6 pb-24 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-6 rounded-3xl border shadow-sm">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold leading-tight">{rfq.title}</h2>
          <Badge status={rfq.status} />
        </div>
        <div className="bg-blue-50 text-blue-700 p-3 rounded-xl text-[10px] font-bold uppercase tracking-wider mb-4">
          创建时间：{new Date(rfq.createdAt).toLocaleString()}
        </div>
        <p className="text-gray-500 text-sm mb-6 whitespace-pre-wrap leading-relaxed">{rfq.description}</p>
        <div className="space-y-3">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">物料清单</h4>
          {rfq.items.map(i => (
            <div key={i.id} className="flex justify-between p-4 bg-gray-50 rounded-2xl text-sm border border-gray-100">
              <span className="text-gray-700 font-bold">{i.name}</span>
              <span className="font-black text-indigo-600">{i.quantity} {i.unit}</span>
            </div>
          ))}
        </div>
        {user.role === UserRole.ADMIN && (
          <button onClick={handleShare} className="w-full mt-6 bg-green-600 text-white py-4 rounded-2xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-green-100 active:scale-95 transition-all">
             发送微信邀请给供应商
          </button>
        )}
      </div>

      {user.role === UserRole.ADMIN && rfqBids.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold flex items-center gap-2 text-lg">竞价实时看板 <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-bold">{rfqBids.length}家已报</span></h3>
            <button onClick={async () => { setIsAnalyzing(true); setAiReport(await analyzeBids(rfq.title, rfqBids)); setIsAnalyzing(false); }} className="text-indigo-600 text-[10px] font-black uppercase tracking-wider py-2 px-3 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors">
              {isAnalyzing ? '分析中...' : 'AI 智能评估报告'}
            </button>
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={10} tick={{fill: '#999'}} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} tick={{fill: '#999'}} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#f5f7ff'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)'}} />
                <Bar dataKey="price" fill="#4F46E5" radius={[8,8,0,0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#10B981' : '#4F46E5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {aiReport && <div className="mt-6 p-5 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl text-xs text-indigo-900 leading-relaxed border border-indigo-100 shadow-inner animate-in fade-in duration-700">{aiReport}</div>}
        </div>
      )}

      {user.role === UserRole.VENDOR && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t z-50 md:relative md:border-none md:p-0 md:bg-transparent">
          <div className="max-w-4xl mx-auto space-y-3">
            {currentMinPrice && (
              <div className="flex justify-between items-center px-5 py-3 bg-amber-50 rounded-2xl border border-amber-100 animate-pulse">
                <span className="text-[10px] text-amber-700 font-black uppercase tracking-widest">🔥 实时行情</span>
                <span className="text-xs text-amber-900 font-bold">当前最低价: <span className="text-sm font-black text-amber-600">¥{currentMinPrice.toLocaleString()}</span></span>
              </div>
            )}
            <form onSubmit={handleBid} className="flex gap-2">
              <input type="number" required placeholder="输入总报价 (元)" className="flex-1 p-5 bg-gray-100 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600 outline-none font-bold" value={amount} onChange={e => setAmount(e.target.value)} />
              <button className="bg-indigo-600 text-white px-8 py-5 rounded-2xl font-black shadow-xl shadow-indigo-200 active:scale-90 transition-transform whitespace-nowrap">
                {myBid ? '更新报价' : '确认报价'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 主应用 ---
const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(() => JSON.parse(localStorage.getItem('qb_u') || JSON.stringify(INITIAL_USERS)));
  const [rfqs, setRfqs] = useState<RFQ[]>(() => JSON.parse(localStorage.getItem('qb_r') || JSON.stringify(INITIAL_RFQS)));
  const [bids, setBids] = useState<Bid[]>(() => JSON.parse(localStorage.getItem('qb_b') || '[]'));

  useEffect(() => {
    localStorage.setItem('qb_u', JSON.stringify(users));
    localStorage.setItem('qb_r', JSON.stringify(rfqs));
    localStorage.setItem('qb_b', JSON.stringify(bids));
  }, [users, rfqs, bids]);

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <Router>
      {!user ? (
        <AuthPage users={users} onAuth={setUser} onRegister={u => setUsers(p => [...p, u])} />
      ) : (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-indigo-100 pb-10">
          <nav className="bg-white/80 backdrop-blur-md border-b px-4 h-16 flex items-center justify-between sticky top-0 z-40 shadow-sm">
            <Link to="/" className="text-xl font-black text-indigo-600 flex items-center gap-1 active:scale-95 transition-transform">
              <Icons.Shield /> QuickBid
            </Link>
            <div className="flex items-center gap-3">
              {user.role === UserRole.SYS_ADMIN && (
                <Link to="/admin" className="p-3 text-gray-400 hover:text-indigo-600 transition-colors">
                  <Icons.Settings />
                </Link>
              )}
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] text-gray-400 font-black uppercase tracking-tighter leading-none">Status</span>
                <span className="text-xs font-bold leading-none mt-1">{user.name}</span>
              </div>
              <button 
                onClick={handleLogout} 
                className="h-10 px-4 flex items-center justify-center bg-gray-50 hover:bg-red-50 hover:text-red-600 rounded-2xl text-[11px] font-black text-gray-500 transition-all active:scale-90"
              >
                LOGOUT
              </button>
            </div>
          </nav>

          <main className="p-4 max-w-5xl mx-auto">
            <Routes>
              <Route path="/" element={
                user.role === UserRole.ADMIN ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center pt-2">
                      <h2 className="text-2xl font-black tracking-tight">询价管理</h2>
                      <Link to="/rfq/new" className="bg-indigo-600 text-white p-4 rounded-2xl shadow-lg shadow-indigo-100 active:scale-90 transition-transform">
                        <Icons.Plus />
                      </Link>
                    </div>
                    <div className="grid gap-4">
                      {rfqs.length === 0 ? (
                        <div className="py-20 text-center bg-white rounded-3xl border border-dashed text-gray-400">暂无询价单，点击右上角开始发布</div>
                      ) : (
                        rfqs.map(r => (
                          <Link key={r.id} to={`/rfq/${r.id}`} className="group bg-white p-6 rounded-3xl border border-transparent hover:border-indigo-600 flex justify-between items-center shadow-sm transition-all active:scale-[0.98]">
                            <div className="flex-1 pr-4">
                              <h3 className="font-bold text-lg mb-1 group-hover:text-indigo-600 transition-colors">{r.title}</h3>
                              <div className="flex items-center gap-2">
                                <Badge status={r.status} />
                                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                  {bids.filter(b=>b.rfqId===r.id).length} 家已报
                                </span>
                              </div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-2xl text-gray-300 group-hover:text-indigo-600 transition-colors"><Icons.Layout /></div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-black tracking-tight pt-2">最新项目机会</h2>
                    <div className="grid gap-4">
                      {rfqs.length === 0 ? (
                        <div className="py-20 text-center bg-white rounded-3xl border border-dashed text-gray-400">当前没有公开的招标项目</div>
                      ) : (
                        rfqs.map(r => (
                          <div key={r.id} className="bg-white p-6 rounded-3xl border shadow-sm hover:border-indigo-600 transition-colors">
                            <div className="flex justify-between mb-3"><h3 className="font-bold text-lg">{r.title}</h3><Badge status={r.status} /></div>
                            <p className="text-xs text-gray-400 mb-6 line-clamp-2 leading-relaxed">{r.description}</p>
                            <Link to={`/rfq/${r.id}`} className="block w-full text-center py-5 bg-indigo-600 text-white rounded-2xl text-sm font-black shadow-xl shadow-indigo-100 active:scale-95 transition-transform">
                               立即报价
                            </Link>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              } />
              <Route path="/admin" element={<SystemAdminPanel users={users} setUsers={setUsers} rfqs={rfqs} setRfqs={setRfqs} bids={bids} setBids={setBids} />} />
              <Route path="/rfq/new" element={<NewRFQ onAdd={r => setRfqs(p => [...p, r])} />} />
              <Route path="/rfq/:id" element={<RFQRoute rfqs={rfqs} bids={bids} user={user} onAddBid={b => setBids(p => { const idx = p.findIndex(x => x.rfqId === b.rfqId && x.vendorId === b.vendorId); if (idx>=0) { const n = [...p]; n[idx] = b; return n; } return [...p, b]; })} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      )}
    </Router>
  );
};

const RFQRoute = ({ rfqs, bids, user, onAddBid }: any) => {
  const { id } = useParams();
  const rfq = rfqs.find((r:any) => r.id === id);
  return rfq ? <RFQDetail rfq={rfq} bids={bids} user={user} onAddBid={onAddBid} /> : <div className="p-20 text-center text-gray-400 bg-white rounded-3xl">项目已移除或链接已失效</div>;
};

const NewRFQ = ({ onAdd }: any) => {
  const navigate = useNavigate();
  return (
    <div className="bg-white p-10 rounded-3xl border shadow-lg max-w-lg mx-auto animate-in zoom-in duration-300">
      <h2 className="text-2xl font-black mb-6 text-center">发布询价需求</h2>
      <p className="text-sm text-gray-400 mb-8 text-center px-4 leading-relaxed">发布后，你可以将项目链接发送给供应商，对方即可实时竞价。</p>
      <button onClick={() => { 
        onAdd({ 
          id: 'RFQ-'+Date.now(), 
          title: '示例项目 '+(new Date().toLocaleDateString()), 
          description: '这是一个采购详情描述...', 
          deadline: '2025-12-31', 
          status: RFQStatus.OPEN, 
          createdAt: new Date().toISOString(), 
          creatorId: 'me', 
          items: [{id:'1', name:'关键核心物料', quantity: 100, unit:'PCS'}] 
        }); 
        navigate('/'); 
      }} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 active:scale-95 transition-transform">
        一键创建示例询价单
      </button>
    </div>
  );
};

export default App;
