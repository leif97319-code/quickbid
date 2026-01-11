
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { User, UserRole, RFQ, Bid, RFQStatus } from './types';
import { Icons, COLORS } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// --- 初始数据与 Mock ---
const INITIAL_USERS: User[] = [
  { id: 'admin-master', name: '系统管理员', role: UserRole.SYS_ADMIN, company: 'QuickBid 官方', password: 'admin', createdAt: new Date().toISOString() },
  { id: 'buyer-1', name: '采购王工', role: UserRole.ADMIN, company: '顺达电子', password: '123', createdAt: new Date().toISOString() },
  { id: 'vendor-1', name: '供应小李', role: UserRole.VENDOR, company: '博科技术', password: '123', createdAt: new Date().toISOString() },
  { id: 'vendor-2', name: '供应张总', role: UserRole.VENDOR, company: '宏图科技', password: '123', createdAt: new Date().toISOString() }
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

// --- 微信分享指引遮罩 ---
const WeChatShareMask: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="wechat-mask" onClick={onClose}>
    <div className="flex flex-col items-end gap-4">
      <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white animate-bounce">
        <path d="M12 5v14M5 12l7-7 7 7" />
      </svg>
      <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 mr-4">
        <p className="text-xl font-black mb-2">转发给供应商</p>
        <p className="text-sm opacity-80">点击右上角“...”图标<br/>选择“发送给朋友”</p>
      </div>
    </div>
  </div>
);

// --- 页面：系统管理 ---
const SystemAdminPanel: React.FC<{ 
  users: User[], 
  setUsers: React.Dispatch<React.SetStateAction<User[]>>,
  rfqs: RFQ[],
  setRfqs: React.Dispatch<React.SetStateAction<RFQ[]>>,
  bids: Bid[],
  setBids: React.Dispatch<React.SetStateAction<Bid[]>>,
  currentUser: User
}> = ({ users, setUsers, rfqs, setRfqs, bids, setBids, currentUser }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({ id: '', name: '', company: '', role: UserRole.VENDOR, password: '123' });
  
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

  const deleteUser = (userId: string, userName: string) => {
    if (userId === currentUser.id) {
      alert('无法删除当前管理员账号。');
      return;
    }
    if (window.confirm(`确定要永久删除用户 "${userName}" 吗？该操作不可撤销。`)) {
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (users.some(u => u.id === newUser.id)) {
      alert('该账号 ID 已存在，请更换。');
      return;
    }
    const userToAdd: User = {
      ...newUser,
      createdAt: new Date().toISOString()
    };
    setUsers(prev => [...prev, userToAdd]);
    setShowAddForm(false);
    setNewUser({ id: '', name: '', company: '', role: UserRole.VENDOR, password: '123' });
    alert('新用户添加成功！');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-indigo-900 flex items-center gap-2"><Icons.Settings /> 系统后台管理</h2>
        <div className="flex gap-2">
           <button onClick={() => setShowAddForm(!showAddForm)} className="text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white px-4 py-2 rounded-xl flex items-center gap-1">
             <Icons.Plus /> <span>新增成员</span>
           </button>
           <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const r = new FileReader();
              r.onload = (ev) => {
                const json = JSON.parse(ev.target?.result as string);
                if(json.users) setUsers(json.users); 
                if(json.rfqs) setRfqs(json.rfqs); 
                if(json.bids) setBids(json.bids);
                alert('数据导入成功');
              };
              r.readAsText(file);
           }} />
           <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black uppercase tracking-widest bg-white border border-gray-200 px-4 py-2 rounded-xl">导入数据</button>
           <button onClick={() => {
              const data = JSON.stringify({ users, rfqs, bids });
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'quickbid_data_backup.json'; a.click();
           }} className="text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white px-4 py-2 rounded-xl">导出备份</button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-3xl border-2 border-emerald-100 shadow-xl animate-in fade-in slide-in-from-top-4">
          <h3 className="text-sm font-black mb-4 text-emerald-800 uppercase tracking-widest">填写新成员信息</h3>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <input type="text" placeholder="账号 ID (登录用)" required className="p-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={newUser.id} onChange={e => setNewUser({...newUser, id: e.target.value})} />
            <input type="text" placeholder="成员姓名" required className="p-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
            <input type="text" placeholder="公司/部门名称" required className="p-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={newUser.company} onChange={e => setNewUser({...newUser, company: e.target.value})} />
            <select className="p-3 bg-gray-50 rounded-xl text-sm font-bold" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}>
              <option value={UserRole.VENDOR}>乙方 (供应商)</option>
              <option value={UserRole.ADMIN}>甲方 (采购方)</option>
            </select>
            <button className="bg-emerald-600 text-white p-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-colors">确认添加</button>
          </form>
        </div>
      )}
      
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase">用户/公司</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase">身份</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-xs">
                      {u.name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">{u.name} <span className="text-[10px] text-gray-300 font-normal">({u.id})</span></p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{u.company}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4"><Badge status={u.role} /></td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-3">
                    <button onClick={() => resetPassword(u.id)} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">重置密码</button>
                    <button onClick={() => toggleRole(u.id)} className="text-[10px] font-black text-gray-400 uppercase hover:text-indigo-600">切换身份</button>
                    {u.id !== currentUser.id && (
                      <button onClick={() => deleteUser(u.id, u.name)} className="text-gray-300 hover:text-red-500 transition-colors">
                        <Icons.Trash />
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
      if (found) onAuth(found); else alert('账号或密码错误');
    } else {
      const newUser: User = { 
        id: formData.id, 
        name: formData.name, 
        company: formData.company, 
        role: formData.role, 
        password: formData.password,
        createdAt: new Date().toISOString() 
      };
      onRegister(newUser); onAuth(newUser);
    }
  };

  const quickLogin = (id: string) => {
    const found = users.find(u => u.id === id);
    if (found) onAuth(found);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-block p-4 bg-indigo-600 text-white rounded-2xl mb-4 shadow-lg shadow-indigo-200"><Icons.Shield /></div>
          <h1 className="text-2xl font-black text-gray-900">QuickBid 询价平台</h1>
          <p className="text-gray-400 text-xs mt-2 font-medium">极简、安全、透明的竞价管理工具</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="ID 账号" required className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-medium" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} />
          {!isLogin && (
            <>
              <input type="text" placeholder="您的姓名" required className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-medium" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <input type="text" placeholder="公司名称" required className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-medium" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} />
              <select className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-bold" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                <option value={UserRole.VENDOR}>乙方 (供应商身份)</option>
                <option value={UserRole.ADMIN}>甲方 (采购方身份)</option>
              </select>
            </>
          )}
          <input type="password" placeholder="登录密码" required className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-medium" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
          <button className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-indigo-100 active:scale-95 transition-all">
            {isLogin ? '立即登录' : '完成注册并登录'}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-gray-50">
          <p className="text-center text-[10px] font-black text-gray-300 uppercase tracking-widest mb-4">演示账号快速进入</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => quickLogin('buyer-1')} className="text-[10px] font-black px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100">甲方(采购)</button>
            <button onClick={() => quickLogin('vendor-1')} className="text-[10px] font-black px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100">乙方(供应)</button>
            <button onClick={() => quickLogin('admin-master')} className="text-[10px] font-black px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100">总管</button>
          </div>
        </div>

        <button onClick={() => setIsLogin(!isLogin)} className="w-full mt-6 text-indigo-600 text-xs font-bold text-center">
          {isLogin ? '没有账号？点此注册一个' : '已有账号？返回登录界面'}
        </button>
      </div>
    </div>
  );
};

// --- 询价详情 ---
const RFQDetail: React.FC<{ rfq: RFQ, bids: Bid[], user: User, onAddBid: (bid: Bid) => void }> = ({ rfq, bids, user, onAddBid }) => {
  const [amount, setAmount] = useState('');
  const [showShareGuide, setShowShareGuide] = useState(false);
  const rfqBids = bids.filter(b => b.rfqId === rfq.id);
  const myBid = rfqBids.find(b => b.vendorId === user.id);
  const currentMinPrice = rfqBids.length > 0 ? Math.min(...rfqBids.map(b => b.amount)) : null;

  const displayBids = user.role === UserRole.ADMIN 
    ? rfqBids.map(b => ({ name: b.vendorName, price: b.amount }))
    : rfqBids.map((b, i) => ({ name: b.vendorId === user.id ? '我的报价' : `供应商 ${i+1}`, price: b.amount }));

  const handleInvite = async () => {
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    const inviteText = `您好，我司正在进行“${rfq.title}”项目的公开询价，诚邀贵司参与竞价。项目链接：${window.location.href}`;
    
    try {
      await navigator.clipboard.writeText(inviteText);
      if (isWeChat) {
        setShowShareGuide(true);
      } else {
        alert('邀请话术及链接已复制到剪贴板！可以直接粘贴发给供应商。');
      }
    } catch (err) {
      alert('邀请链接：' + window.location.href);
    }
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
      notes: '',
      timestamp: new Date().toISOString(),
      itemQuotes: []
    });
    alert('报价已成功提交并实时同步！');
  };

  const chartData = [...displayBids].sort((a,b) => a.price - b.price);

  return (
    <div className="flex flex-col gap-6 pb-24">
      {showShareGuide && <WeChatShareMask onClose={() => setShowShareGuide(false)} />}
      
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5"><Icons.Layout /></div>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-black text-gray-900">{rfq.title}</h2>
            <p className="text-[10px] text-gray-400 font-bold mt-1">项目编号: {rfq.id}</p>
          </div>
          <Badge status={rfq.status} />
        </div>
        <div className="bg-gray-50 p-6 rounded-2xl mb-6">
          <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{rfq.description}</p>
        </div>
        <div className="space-y-3">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">采购明细</h4>
          {rfq.items.map(i => (
            <div key={i.id} className="flex justify-between p-4 bg-white border border-gray-50 rounded-2xl text-sm font-bold shadow-sm">
              <span className="text-gray-700">{i.name}</span>
              <span className="text-indigo-600 px-3 py-1 bg-indigo-50 rounded-lg">{i.quantity} {i.unit}</span>
            </div>
          ))}
        </div>

        {user.role === UserRole.ADMIN && (
          <div className="mt-8 pt-8 border-t border-gray-100">
            <button onClick={handleInvite} className="w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-100 transition-all">
              <Icons.Download /> 邀请外部供应商参与
            </button>
            <p className="text-center text-[10px] text-gray-400 mt-3 font-bold">点击按钮将自动复制邀请链接，并在微信内提供分享指引</p>
          </div>
        )}
      </div>

      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
        <h3 className="font-black text-gray-900 mb-8 flex items-center justify-between">
          <span>{user.role === UserRole.ADMIN ? '竞价全览看板' : '市场竞争热度'}</span>
          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full font-black uppercase tracking-widest">{rfqBids.length} 家供应商在线竞价</span>
        </h3>
        {rfqBids.length > 0 ? (
          <>
            <div className="h-64 mb-8">
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} fontWeight="bold" />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} fontWeight="bold" />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}} 
                    contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', padding: '15px'}}
                  />
                  <Bar dataKey="price" fill="#4F46E5" radius={[10,10,0,0]} barSize={40}>
                    {chartData.map((entry, index) => (
                      <Cell key={`c-${index}`} fill={index === 0 ? '#10B981' : (entry.name === '我的报价' ? '#F59E0B' : '#4F46E5')} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            {user.role === UserRole.ADMIN && (
              <div className="grid gap-2">
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-2">详细出价单</p>
                {rfqBids.sort((a,b) => a.amount - b.amount).map(b => (
                  <div key={b.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-indigo-100 transition-all">
                    <div>
                      <p className="font-bold text-sm text-gray-900">{b.vendorName}</p>
                      <p className="text-[10px] text-gray-400 font-bold">{b.timestamp.split('T')[0]}</p>
                    </div>
                    <span className="text-lg font-black text-indigo-600">¥{b.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : <div className="text-center py-20 text-gray-300 font-bold text-sm italic">等待供应商接入报价...</div>}
      </div>

      {user.role === UserRole.VENDOR && (
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-2xl border-t border-gray-100 z-50 md:relative md:bg-white md:border md:rounded-3xl md:p-8">
          <div className="max-w-4xl mx-auto space-y-4">
             {currentMinPrice && (
                <div className="flex justify-between items-center px-5 py-3 bg-amber-50 rounded-2xl border border-amber-100 text-xs font-black text-amber-700">
                  <span className="flex items-center gap-2">✨ 实时情报: 市场当前最优价格为 ¥{currentMinPrice.toLocaleString()}</span>
                  {myBid && myBid.amount <= currentMinPrice && <span className="bg-amber-500 text-white px-2 py-0.5 rounded text-[10px]">您目前领先</span>}
                </div>
             )}
             <form onSubmit={handleBid} className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-gray-400 text-lg">¥</span>
                  <input type="number" required placeholder="输入您的含税总报价" className="w-full pl-10 pr-5 py-5 bg-gray-50 rounded-2xl border-none outline-none font-black text-lg focus:ring-2 focus:ring-indigo-600 transition-all" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <button className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 active:scale-95 hover:bg-indigo-700 transition-all">
                  {myBid ? '更新报价' : '立即抢标'}
                </button>
             </form>
             <p className="text-center text-[10px] text-gray-400 font-bold">报价提交后将实时更新至采购方看板，信息受端到端加密保护</p>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 主应用入口 ---
const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('qb_u');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });
  const [rfqs, setRfqs] = useState<RFQ[]>(() => {
    const saved = localStorage.getItem('qb_r');
    return saved ? JSON.parse(saved) : INITIAL_RFQS;
  });
  const [bids, setBids] = useState<Bid[]>(() => {
    const saved = localStorage.getItem('qb_b');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('qb_u', JSON.stringify(users));
    localStorage.setItem('qb_r', JSON.stringify(rfqs));
    localStorage.setItem('qb_b', JSON.stringify(bids));
  }, [users, rfqs, bids]);

  return (
    <Router>
      {!user ? (
        <AuthPage users={users} onAuth={setUser} onRegister={u => setUsers(p => [...p, u])} />
      ) : (
        <div className="min-h-screen bg-gray-50 text-gray-900 pb-10">
          <nav className="bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 h-20 flex items-center justify-between sticky top-0 z-40">
            <Link to="/" className="text-2xl font-black text-indigo-600 flex items-center gap-2 tracking-tighter">
              <div className="bg-indigo-600 text-white p-1.5 rounded-lg"><Icons.Shield /></div>
              <span>QuickBid</span>
            </Link>
            <div className="flex items-center gap-6">
              {(user.role === UserRole.SYS_ADMIN || user.role === UserRole.ADMIN) && (
                <Link to="/admin" className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                  <Icons.Settings />
                </Link>
              )}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] text-gray-300 font-black uppercase tracking-widest leading-none mb-1">{user.role}</p>
                  <p className="text-sm font-black text-gray-900 leading-none">{user.name}</p>
                </div>
                <button onClick={() => setUser(null)} className="h-10 w-10 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </nav>

          <main className="p-6 max-w-5xl mx-auto">
            <Routes>
              <Route path="/" element={
                <div className="space-y-8">
                  <div className="flex justify-between items-end">
                    <div>
                      <h2 className="text-3xl font-black tracking-tight text-gray-900">
                        {user.role === UserRole.ADMIN ? '项目管理工作台' : '可参与竞价项目'}
                      </h2>
                      <p className="text-gray-400 font-medium mt-1">当前共有 {rfqs.length} 个活跃询价单</p>
                    </div>
                    {user.role === UserRole.ADMIN && (
                      <button onClick={() => {
                        const newId = 'RFQ-'+Date.now();
                        setRfqs(p => [...p, { 
                          id: newId, 
                          title: '未命名采购项目', 
                          description: '请输入详细需求说明...', 
                          deadline: '2025-12-31', 
                          status: RFQStatus.OPEN, 
                          createdAt: new Date().toISOString(), 
                          creatorId: user.id, 
                          items: [{id:'1', name:'点击修改物料名', quantity:1, unit:'批'}] 
                        }]);
                      }} className="bg-indigo-600 text-white p-5 rounded-3xl shadow-2xl shadow-indigo-200 hover:scale-105 active:scale-95 transition-all">
                        <Icons.Plus />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {rfqs.map(r => (
                      <Link key={r.id} to={`/rfq/${r.id}`} className="group bg-white p-8 rounded-[40px] border border-transparent hover:border-indigo-100 shadow-sm hover:shadow-xl transition-all flex flex-col justify-between h-64 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-10 transition-opacity"><Icons.Layout /></div>
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Badge status={r.status} />
                            <span className="text-[10px] font-black text-gray-300 uppercase">截止: {r.deadline}</span>
                          </div>
                          <h3 className="font-black text-xl text-gray-800 group-hover:text-indigo-600 transition-colors line-clamp-2">{r.title}</h3>
                        </div>
                        <div className="flex justify-between items-end">
                           <div className="text-[10px] font-bold text-gray-400">
                             发布于 {r.createdAt.split('T')[0]}
                           </div>
                           <div className="bg-gray-50 group-hover:bg-indigo-600 group-hover:text-white p-3 rounded-2xl transition-all">
                             <Icons.Layout />
                           </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              } />
              <Route path="/admin" element={<SystemAdminPanel users={users} setUsers={setUsers} rfqs={rfqs} setRfqs={setRfqs} bids={bids} setBids={setBids} currentUser={user} />} />
              <Route path="/rfq/:id" element={<RFQRoute rfqs={rfqs} bids={bids} user={user} onAddBid={b => setBids(p => { 
                const idx = p.findIndex(x => x.rfqId === b.rfqId && x.vendorId === b.vendorId); 
                if (idx>=0) { const n = [...p]; n[idx] = b; return n; } 
                return [...p, b]; 
              })} />} />
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
  return rfq ? <RFQDetail rfq={rfq} bids={bids} user={user} onAddBid={onAddBid} /> : <div className="text-center py-40 font-black text-gray-300">项目不存在或已下架</div>;
};

export default App;
