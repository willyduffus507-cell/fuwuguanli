import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { RoleCode } from '../types';

interface LoginProps {
  onLogin: (user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Added pType to simParams - Initialize from URL directly
  // Robust URL Param Parser (supports both ? and #?)
  const getUrlParam = (name: string) => {
    const reg = new RegExp('(^|&|\\?|#)' + name + '=([^&]*)(&|$)', 'i');
    const r = window.location.href.match(reg);
    if (r != null) return decodeURIComponent(r[2]);
    return null;
  };

  const [simParams, setSimParams] = useState(() => {
    return {
      parentId: getUrlParam('users_id') || '11', // Default to 11 (Super Admin) if missing
      posterId: getUrlParam('templates_id') || '0',
      pType: getUrlParam('p_type') || 'B'
    };
  });

  // Registration Form State
  const [showRegModal, setShowRegModal] = useState(false);
  const [regForm, setRegForm] = useState({ nickname: '', storeName: '', region: '' });
  const [pendingRegisterType, setPendingRegisterType] = useState<number | null>(null);

  // Debug State
  const [debugMsg, setDebugMsg] = useState<string[]>([]);
  const addLog = (msg: string) => setDebugMsg(prev => [...prev.slice(-4), msg]);

  // Parse URL params for QR Code scanning & WeChat Auth
  useEffect(() => {
    try {
      // Use Robust Parser
      let uid = getUrlParam('users_id');
      let tid = getUrlParam('templates_id');
      let pType = getUrlParam('p_type'); // 'B' or 'C'

      const authPhone = getUrlParam('phone');
      const authErr = getUrlParam('authError'); // Check if backend passed error

      // Restore from Session if returning from Auth
      if (authPhone || authErr) {
        const saved = sessionStorage.getItem('wx_auth_state');
        if (saved) {
          const state = JSON.parse(saved);
          if (!uid) uid = state.uid;
          if (!tid) tid = state.tid;
          if (!pType) pType = state.pType;
          addLog(`Restored state: P=${uid}, T=${tid}, PT=${pType}`);
        }
      }

      if (uid) {
        console.log('Scanned QR:', { uid, tid, pType });
        // Pre-fill parameters
        setSimParams(prev => ({
          ...prev,
          parentId: uid as string,
          posterId: tid || prev.posterId,
          pType: pType || prev.pType
        }));
      }

      if (authPhone) {
        addLog(`Got phone: ${authPhone}`);
        setMobile(authPhone);
        // User came back from Auth, try auto-login
        setTimeout(() => {
          handleAuthLogin(authPhone);
        }, 500);
      }
    } catch (e: any) {
      console.error(e);
      setError('初始化异常: ' + e.message);
      addLog('Init Fatal: ' + e.message);
    }
  }, []);

  // Aggressive Debug for White Screen
  if (true) {
    if (window.location.search.includes('phone')) {
      console.warn("Phone detected in URL");
    }
  }

  const handleWeChatAuth = () => {
    addLog('Starting Auth...');
    setIsLoading(true);

    // Save State
    const currentParams = {
      uid: simParams.parentId,
      tid: simParams.posterId,
      pType: simParams.pType
    };
    sessionStorage.setItem('wx_auth_state', JSON.stringify(currentParams));

    // 1. Debug: Check window.wx
    // @ts-ignore
    const wx = window.wx;

    if (!wx) {
      alert('错误：无法加载微信SDK (window.wx undefined)');
      setIsLoading(false);
      return;
    }

    // 3. Construct URL
    const currentUrl = window.location.href.split('?')[0];
    const searchParams = new URLSearchParams(window.location.search);
    const redirectUrl = encodeURIComponent(`${currentUrl}?${searchParams.toString()}`);

    // Correct Path from User
    const jumpUrl = `/pagesB/gateway/auth?redirectUrl=${redirectUrl}`;

    // 4. Exec Jump
    try {
      wx.miniProgram.navigateTo({
        url: jumpUrl,
        success: function () {
          addLog('Jump Success');
          // Don't clear loading on success, let the page unload
        },
        fail: function (err: any) {
          console.error('[WeChatAuth] Navigate failed:', err);
          alert('跳转失败: ' + JSON.stringify(err));
          addLog('Jump Fail: ' + JSON.stringify(err));
          setIsLoading(false);
        },
        complete: function (res: any) {
          console.log('[WeChatAuth] Complete:', res);
        }
      });
    } catch (e: any) {
      console.error('[WeChatAuth] Exception:', e);
      alert('调用异常: ' + e.message);
      setIsLoading(false);
    }
  };

  const handleAuthLogin = async (phone: string) => {
    console.log('Login triggered for:', phone);
    setIsLoading(true);

    // Timeout Promise (10s)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("网络请求超时，请检查网络或重试")), 10000)
    );

    try {
      // Benchmark Start
      const t0 = performance.now();

      // Race DB query against timeout
      // Optimize: Single Query
      const user = await Promise.race([
        dbService.checkUserByMobile(phone),
        timeoutPromise
      ]) as any;

      const t1 = performance.now();
      console.log(`DB Query took ${Math.round(t1 - t0)}ms`);

      if (!user) {
        // User not found -> Proceed to Registration Flow
        console.log('User not found, redirecting to register...', simParams);

        // Determine numeric type
        const numericType = simParams.pType === 'C' ? 2 : 1;
        setPendingRegisterType(numericType);

        // Open Modal
        setShowRegModal(true);
        return;
      }

      // Check Status
      if (user.status === 1 || user.status === 2) {
        // [New Logic] Role Upgrade Check
        // Only if User is Customer (4) AND Scanned a QRCode (users_id exists) AND pType is 'B'
        const urlParams = new URLSearchParams(window.location.search);
        const hasQR = urlParams.get('users_id');

        if (user.role_code === 4 && hasQR && simParams.pType === 'B') {
          const doUpgrade = window.confirm('您当前身份为【终端客户】。\n检测到您正在扫描【合作伙伴邀请码】，是否申请升级为合作伙伴？\n\n(确认后将提交审核申请)');
          if (doUpgrade) {
            try {
              const parentId = parseInt(simParams.parentId);
              const updatedUser = await dbService.upgradeUserByQR(user.id, parentId);
              if (updatedUser) {
                alert('申请已提交！您的账号状态已更新为【待审核】。');
                onLogin(updatedUser);
                return;
              }
            } catch (err: any) {
              alert('升级申请失败: ' + err.message);
            }
          }
        }

        // Pass FULL USER object to avoid re-fetch in App.tsx
        onLogin(user);
        return;
      }

      switch (user.status) {
        case 3: // REJECTED
          alert(`审核未通过：${user.reject_reason || '资料不符'}`);
          break;
        case 0: // DISABLED
          alert('账号已被禁用，请联系管理员');
          break;
        default:
          alert('账号状态异常，请联系管理员');
      }
    } catch (e: any) {
      console.error('Login Exception:', e);
      alert('登录异常: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualTestRegister = async (pTypeOverride?: string) => {
    // Use the manually entered mobile number
    if (!mobile || mobile.length < 11) {
      alert('请先在上方输入完整的手机号');
      return;
    }

    const pType = pTypeOverride || simParams.pType;
    // Convert P_Type string to numeric posterType: 'B' -> 1, 'C' -> 2
    // Actually DB logic might expect 0/1/2.
    // let's assume B=1 (Recruit), C=2 (Promotion) for simplicity or mapping from legacy
    // BUT ResourceCenter uses: pType = poster.type === 2 ? 'C' : 'B';
    // So 'C' is 2, 'B' is everything else (e.g. 1, 3, 4)
    // We will rely on user input or infer. 
    // Let's treat 'B' as 1 (Recruit/Invite) and 'C' as 2 (Terminal)
    const numericType = pType === 'C' ? 2 : 1;

    try {
      const existing = await dbService.checkUserByMobile(mobile);
      if (existing) {
        // 优化：直接登录，只用Toast提示（这里用console代替，减少弹窗）
        console.log(`User existing: ${existing.id}, Auto-login.`);
        if (existing.status === 1 || existing.status === 2) {
          onLogin(existing); // Fix: Pass full user object
        } else {
          alert(`账号状态异常: ${existing.status}`);
        }
        return;
      }

      setPendingRegisterType(numericType);
      setShowRegModal(true);
    } catch (e: any) {
      alert('查询失败: ' + e.message);
    }
  };

  const getRoleName = (code: number) => {
    switch (code) {
      case 0: return '超管';
      case 1: return '经理';
      case 2: return '服务商';
      case 3: return '推广员';
      default: return '客户';
    }
  };

  const handleCompleteRegister = async () => {
    try {
      const parentId = parseInt(simParams.parentId) || 0;

      // Default to "B" (1) if not set, or parse from simParams
      const numericType = simParams.pType === 'C' ? 2 : 1;

      const user = await dbService.registerViaQR({
        mobile,
        parentId: parentId,
        posterId: parseInt(simParams.posterId) || 0,
        posterType: pendingRegisterType ?? numericType,
        nickname: regForm.nickname || `用户${mobile.slice(-4)}`, // Optional: Default
        storeName: regForm.storeName || '', // Optional
        region: regForm.region || '未知区域' // Optional
      });

      if (!user) throw new Error('注册失败');

      setShowRegModal(false);

      // Verify Binding
      alert(`注册成功!\nID: ${user.id}\n角色: ${getRoleName(user.role_code)}\n上级ID: ${user.parent_id}\n关系链: ${user.relation_path}`);

      if (user.status === 1 || user.status === 2) {
        onLogin(user); // Fix: Pass full user object, not ID
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white max-w-md mx-auto items-center justify-center p-8">
      <div className="mb-12 text-center">
        <div className="w-20 h-20 bg-[#07c160] rounded-3xl flex items-center justify-center shadow-xl mx-auto mb-6 text-white text-4xl">
          <i className="fa-solid fa-kitchen-set"></i>
        </div>
        <h1 className="text-2xl font-black text-gray-800 tracking-tight">肴滚智能厨师</h1>
        <p className="text-gray-400 mt-2 italic text-sm">B端全功能管理门户 <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200">v2.12-RoleUpgrade</span></p>
      </div>

      <div className="w-full space-y-4">
        {/* 1. Primary: WeChat Login */}
        <button
          onClick={handleWeChatAuth}
          disabled={isLoading}
          className="w-full bg-[#07c160] text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <i className="fa-solid fa-circle-notch fa-spin text-xl"></i>
              <span>跳转中...</span>
            </>
          ) : (
            <>
              <i className="fa-brands fa-weixin text-xl"></i>
              <span>微信一键登录</span>
            </>
          )}
        </button>

        {error && <p className="text-red-500 text-xs text-center font-bold animate-pulse">{error}</p>}
      </div>

      {/* 2. Manual Test Tools (Collapsed) */}
      <details className="mt-12 w-full p-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
        <summary className="text-[10px] uppercase font-black text-gray-400 cursor-pointer list-none flex justify-between items-center">
          <span>🛠 模拟测试工具 / 手动通道</span>
          <i className="fa-solid fa-chevron-down"></i>
        </summary>

        <div className="mt-4 animate-in fade-in slide-in-from-top-2 space-y-4">

          <div className="text-[9px] break-all text-gray-300 font-mono bg-gray-100 p-2 rounded">
            URL: {window.location.href}
          </div>

          {/* Manual Login Section (Moved here) */}
          <div className="space-y-2">
            <p className="text-[10px] text-gray-300 text-center tracking-widest">开发/测试人员专用通道</p>
            <div className="bg-white p-1 rounded-xl border flex items-center">
              <span className="pl-3 text-gray-400 font-bold text-xs">+86</span>
              <div className="w-px h-4 bg-gray-200 mx-2"></div>
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="测试手机号"
                className="bg-transparent flex-1 py-2 text-sm font-bold text-gray-800 outline-none"
              />
            </div>
            <button
              onClick={() => handleAuthLogin(mobile)}
              disabled={(!mobile || mobile.length < 11) || isLoading}
              className="w-full bg-gray-800 text-white py-3 rounded-xl font-bold shadow active:scale-95 transition-all text-xs flex items-center justify-center disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin mr-2"></i>
                  登录中...
                </>
              ) : (
                '直接手机号登录'
              )}
            </button>
          </div>

          <hr className="border-dashed border-gray-200" />

          <p className="text-[10px] text-gray-300 text-center tracking-widest">模拟扫码参数</p>

          <div className="flex space-x-2 mb-4">
            <div className="space-y-1 flex-1">
              <label className="text-[9px] font-bold text-gray-400 ml-1">上级ID (users_id)</label>
              <input
                type="text"
                value={simParams.parentId}
                onChange={(e) => setSimParams({ ...simParams, parentId: e.target.value })}
                className="w-full p-2 bg-white border rounded-xl text-xs text-center font-mono outline-none focus:ring-1 focus:ring-[#07c160]"
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-[9px] font-bold text-gray-400 ml-1">海报ID (templates_id)</label>
              <input
                type="text"
                value={simParams.posterId}
                onChange={(e) => setSimParams({ ...simParams, posterId: e.target.value })}
                className="w-full p-2 bg-white border rounded-xl text-xs text-center font-mono outline-none focus:ring-1 focus:ring-[#07c160]"
              />
            </div>
          </div>

          <div className="space-y-1 mb-4">
            <label className="text-[9px] font-bold text-gray-400 ml-1">注册类型 (p_type)</label>
            <div className="flex bg-white rounded-xl border p-1">
              <button onClick={() => setSimParams({ ...simParams, pType: 'B' })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${simParams.pType === 'B' ? 'bg-[#07c160] text-white shadow-sm' : 'text-gray-500'}`}>B端 (合伙人/服务商)</button>
              <button onClick={() => setSimParams({ ...simParams, pType: 'C' })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${simParams.pType === 'C' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500'}`}>C端 (终端客户)</button>
            </div>
          </div>

          <button
            onClick={() => handleManualTestRegister()}
            className="w-full bg-white border border-gray-200 text-gray-800 py-3 rounded-xl font-bold hover:bg-gray-50 active:scale-95 transition-all text-xs"
          >
            <i className="fa-solid fa-flask mr-2"></i>
            执行测试注册 (Test Register)
          </button>
        </div>
      </details>

      {/* Registration Info Modal */}
      {showRegModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-gray-800 mb-2 text-center">完善注册信息</h3>
            <p className="text-center text-xs text-gray-400 mb-6">用于测试环境的数据录入</p>

            <div className="bg-gray-50 p-3 rounded-xl mb-4 text-xs font-mono text-gray-500">
              <p>手机: {mobile}</p>
              <p>上级: {simParams.parentId}</p>
              <p>海报: {simParams.posterId}</p>
              <p>类型: {simParams.pType}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 ml-1">姓名 / 称呼 (选填)</label>
                <input
                  type="text"
                  value={regForm.nickname}
                  onChange={e => setRegForm({ ...regForm, nickname: e.target.value })}
                  className="w-full p-4 bg-gray-50 rounded-xl font-bold outline-none focus:ring-2 focus:ring-[#07c160]"
                  placeholder="默认: 用户+手机尾号"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 ml-1">门店名称 (选填)</label>
                <input
                  type="text"
                  value={regForm.storeName}
                  onChange={e => setRegForm({ ...regForm, storeName: e.target.value })}
                  className="w-full p-4 bg-gray-50 rounded-xl font-bold outline-none focus:ring-2 focus:ring-[#07c160]"
                  placeholder="请输入门店名称"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 ml-1">所在区域 (选填)</label>
                <input
                  type="text"
                  value={regForm.region}
                  onChange={e => setRegForm({ ...regForm, region: e.target.value })}
                  className="w-full p-4 bg-gray-50 rounded-xl font-bold outline-none focus:ring-2 focus:ring-[#07c160]"
                  placeholder="如：北京市朝阳区"
                />
              </div>

              <button
                // disabled={!regForm.nickname || !regForm.region} // Disabled validation for test convenience
                onClick={handleCompleteRegister}
                className="w-full py-4 bg-[#07c160] text-white rounded-2xl font-black shadow-lg mt-4"
              >
                确认并授权注册
              </button>

              <button
                onClick={() => setShowRegModal(false)}
                className="w-full py-3 text-gray-400 text-xs font-bold"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
