import React, { useState, useEffect } from 'react';
import { User } from './types';
import { dbService } from './services/dbService';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import LeadPool from './components/LeadPool';
import LeadDetail from './components/LeadDetail';
import ResourceCenter from './components/ResourceCenter';
import Login from './components/Login';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    // 验证数据库连接
    dbService.checkConnection();
  }, []);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedLead, setSelectedLead] = useState<User | null>(null);

  // Add Admin State
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [newAdminForm, setNewAdminForm] = useState({ mobile: '', nickname: '' });

  useEffect(() => {
    const checkUser = async () => {
      const savedId = localStorage.getItem('yaogun_user_id');
      if (savedId) {
        const user = await dbService.getUserById(parseInt(savedId));
        if (user) setCurrentUser(user);
      }
    };
    checkUser();
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('yaogun_user_id', user.id.toString());
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('yaogun_user_id');

    // Only clear Auth-related URL params to prevent auto-relogin loop
    // BUT PRESERVE Invite params (users_id, templates_id, p_type) so re-registration works
    const params = new URLSearchParams(window.location.search);
    params.delete('phone');
    params.delete('authError');
    params.delete('code');
    params.delete('state');

    // Replace URL without reloading
    const newPath = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, document.title, newPath);
  };

  const handleRefresh = async () => {
    if (currentUser) {
      const updated = await dbService.getUserById(currentUser.id);
      if (updated) setCurrentUser({ ...updated });
    }
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard': return '管理工作台';
      case 'leads': return '线索池';
      case 'resources': return '素材中心';
      case 'profile': return '个人中心';
      default: return '工作台';
    }
  };

  // Role Names Map
  const roleNames: Record<number, string> = {
    0: '系统管理员',
    1: '市场经理',
    2: '区域服务商',
    3: '合作伙伴推广员',
    4: '注册客户'
  };

  // 拦截审核状态
  if (currentUser.status === 2) { // PENDING
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center text-3xl mb-6">
          <i className="fa-solid fa-hourglass-half"></i>
        </div>
        <h2 className="text-xl font-black text-gray-800 mb-2">注册成功【{roleNames[currentUser.role_code] || '新用户'}】</h2>
        <p className="text-gray-500 text-sm mb-8">您的账号正在审核中，请耐心等待上级通过。</p>
        <button onClick={handleLogout} className="text-gray-400 text-sm underline">退出登录</button>
      </div>
    );
  }

  if (currentUser.status === 3) { // REJECTED
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-3xl mb-6">
          <i className="fa-solid fa-circle-xmark"></i>
        </div>
        <h2 className="text-xl font-black text-gray-800 mb-2">审核未通过</h2>
        <p className="text-gray-500 text-sm mb-4">很抱歉，您的申请已被拒绝。</p>
        <div className="bg-gray-50 p-4 rounded-xl mb-8 w-full max-w-xs">
          <p className="text-xs text-gray-400 mb-1">拒绝原因</p>
          <p className="text-gray-800 font-bold">{currentUser.reject_reason || '资料不符合要求'}</p>
        </div>
        <button onClick={handleLogout} className="w-full max-w-xs py-3 bg-[#07c160] text-white font-bold rounded-xl shadow-lg shadow-[#07c160]/20">
          知道了 / 退出
        </button>
      </div>
    );
  }



  const handleAddAdmin = async () => {
    if (!newAdminForm.mobile || !newAdminForm.nickname) {
      alert('请填写完整信息');
      return;
    }
    if (!window.confirm('确认添加该账号为超级管理员？该账号将拥有最高权限。')) return;

    try {
      await dbService.createSuperAdmin(newAdminForm.mobile, newAdminForm.nickname);
      alert('添加成功！');
      setShowAdminModal(false);
      setNewAdminForm({ mobile: '', nickname: '' });
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <Layout
      title={getPageTitle()}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      user={currentUser}
    >
      {activeTab === 'dashboard' && (
        <Dashboard user={currentUser} onNavigate={setActiveTab} />
      )}

      {activeTab === 'leads' && (
        <LeadPool
          user={currentUser}
          onSelectLead={setSelectedLead}
        />
      )}

      {activeTab === 'resources' && (
        <ResourceCenter user={currentUser} />
      )}

      {activeTab === 'profile' && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl border p-5 flex items-center space-x-4 shadow-sm">
            <div className="w-16 h-16 bg-[#07c160]/10 text-[#07c160] rounded-full flex items-center justify-center text-2xl font-black border-2 border-[#07c160]/20">
              {(currentUser.nickname || currentUser.mobile || 'U').charAt(0)}
            </div>
            <div>
              <h3 className="font-black text-xl text-gray-800">{currentUser.nickname || currentUser.mobile || '未命名用户'}</h3>
              <p className="text-gray-400 text-sm mt-1">账号角色: {roleNames[currentUser.role_code] || '未知角色'}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border divide-y overflow-hidden shadow-sm">
            <div className="p-4 flex justify-between items-center active:bg-gray-50">
              <span className="text-gray-700 font-bold">账号安全</span>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-sm font-mono">{currentUser.mobile}</span>
                <i className="fa-solid fa-chevron-right text-gray-200"></i>
              </div>
            </div>
            <div className="p-4 flex justify-between items-center active:bg-gray-50">
              <span className="text-gray-700 font-bold">关于肴滚智能厨师</span>
              <i className="fa-solid fa-chevron-right text-gray-200"></i>
            </div>
          </div>

          {/* Super Admin Add Feature */}
          {currentUser.role_code === 0 && (
            <div className="bg-white rounded-2xl border overflow-hidden shadow-sm mt-4">
              <button
                onClick={() => setShowAdminModal(true)}
                className="w-full p-4 flex justify-between items-center active:bg-gray-50"
              >
                <span className="text-gray-800 font-black flex items-center">
                  <i className="fa-solid fa-screwdriver-wrench text-blue-500 mr-2"></i>
                  添加超管账号
                </span>
                <i className="fa-solid fa-plus text-blue-500 font-bold"></i>
              </button>
            </div>
          )}

          {/* Add Admin Modal */}
          {showAdminModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6">
              <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                <h3 className="text-xl font-black text-gray-800 mb-6 text-center">添加超级管理员</h3>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 ml-1">手机号</label>
                    <input
                      type="tel"
                      value={newAdminForm.mobile}
                      onChange={e => setNewAdminForm({ ...newAdminForm, mobile: e.target.value })}
                      className="w-full p-4 bg-gray-50 rounded-xl font-bold outline-none focus:ring-2 focus:ring-[#07c160]"
                      placeholder="请输入手机号"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 ml-1">姓名 / 称呼</label>
                    <input
                      type="text"
                      value={newAdminForm.nickname}
                      onChange={e => setNewAdminForm({ ...newAdminForm, nickname: e.target.value })}
                      className="w-full p-4 bg-gray-50 rounded-xl font-bold outline-none focus:ring-2 focus:ring-[#07c160]"
                      placeholder="请输入姓名"
                    />
                  </div>

                  <button
                    onClick={handleAddAdmin}
                    className="w-full py-4 bg-blue-500 text-white rounded-2xl font-black shadow-lg shadow-blue-200 mt-4 active:scale-95 transition-all"
                  >
                    确认添加
                  </button>

                  <button
                    onClick={() => setShowAdminModal(false)}
                    className="w-full py-3 text-gray-400 text-xs font-bold"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full py-5 bg-white text-red-500 font-black rounded-2xl border-2 border-red-50 shadow-sm active:bg-red-50 transition-all mt-6"
          >
            切换账号 / 退出登录
          </button>
        </div>
      )}

      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          currentUser={currentUser}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleRefresh}
        />
      )}
    </Layout>
  );
};

export default App;