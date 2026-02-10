
import React, { useState, useEffect } from 'react';
import { User, RoleCode, UserStatus, LeadStatus } from '../types';
import { dbService } from '../services/dbService';
import PullToRefresh from './PullToRefresh';

interface DashboardProps {
  user: User;
  onNavigate: (tab: string) => void;
}

type AuditAction = 'approve' | 'reject' | 'delete' | 'none';

const Dashboard: React.FC<DashboardProps> = ({ user, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<RoleCode | 'valid_customers'>(RoleCode.MANAGER);
  const [stats, setStats] = useState<any>({
    status_counts: { total: 0, new: 0, following: 0, deposit: 0, deal: 0, invalid: 0 },
    team_counts: { managers: 0, agents: 0, promoters: 0, valid_customers: 0 },
    trend_data: []
  });
  const [members, setMembers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [auditAction, setAuditAction] = useState<AuditAction>('none');
  const [auditReason, setAuditReason] = useState('');

  useEffect(() => {
    if (user.role_code === RoleCode.ADMIN) setActiveTab(RoleCode.MANAGER);
    else if (user.role_code === RoleCode.MANAGER) setActiveTab(RoleCode.AGENT);
    else setActiveTab(RoleCode.PROMOTER);
  }, [user.role_code]);

  const refreshData = async () => {
    const list = await dbService.getTeamMembersByTab(user, activeTab);
    setMembers(list);
    const s = await dbService.getDashboardStats(user);
    setStats(s);
  };

  useEffect(() => {
    refreshData();
  }, [user, activeTab]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    // 如果处于审核模式，先执行审核逻辑
    if (editingUser.status === UserStatus.PENDING || editingUser.status === UserStatus.REJECTED) {
      if (auditAction === 'approve') {
        await dbService.approveUser(editingUser.id);
      } else if (auditAction === 'reject') {
        if (!auditReason.trim()) {
          alert('拒绝操作必须填写原因');
          return;
        }
        await dbService.rejectUser(editingUser.id, auditReason);
      } else if (auditAction === 'delete') {
        if (!window.confirm('确认删除该用户吗？操作不可恢复。')) return;
        await dbService.deleteUser(editingUser.id);
        setEditingUser(null);
        refreshData();
        return;
      } else if (auditAction === 'none' && editingUser.status === UserStatus.PENDING) {
        alert('请选择审核操作');
        return;
      }
    }

    // 更新基础信息
    await dbService.updateUser(editingUser.id, editingUser);
    setEditingUser(null);
    setAuditAction('none');
    refreshData();
    alert('操作成功');
  };

  const openAudit = (member: User) => {
    setEditingUser(member);
    if (member.status === UserStatus.PENDING) {
      setAuditAction('approve'); // 默认选中通过
    } else {
      setAuditAction('none');
    }
    setAuditReason('');
  };

  const getStatusLabel = (status: LeadStatus) => {
    switch (status) {
      case LeadStatus.NEW: return { text: '待跟进', color: 'bg-blue-100 text-blue-600' };
      case LeadStatus.FOLLOWING: return { text: '跟进中', color: 'bg-orange-100 text-orange-600' };
      case LeadStatus.DEPOSIT: return { text: '定金', color: 'bg-yellow-100 text-yellow-700' };
      case LeadStatus.DEAL: return { text: '成交', color: 'bg-green-100 text-green-600' };
      case LeadStatus.INVALID: return { text: '无效', color: 'bg-gray-100 text-gray-500' };
      default: return { text: '未知', color: 'bg-gray-100' };
    }
  };

  const getUserStatusBadge = (status: UserStatus) => {
    switch (status) {
      case UserStatus.NORMAL: return <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-600 font-bold">正常</span>;
      case UserStatus.PENDING: return <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500 text-white font-bold animate-pulse">待审核</span>;
      case UserStatus.REJECTED: return <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-bold">已拒绝</span>;
      case UserStatus.DISABLED: return <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-bold">禁用</span>;
      default: return null;
    }
  };

  const renderChart = () => {
    const data = stats.trend_data;
    if (data.length === 0) return null;

    const width = 340;
    const height = 150;
    const paddingLeft = 30;
    const paddingBottom = 30;
    const paddingTop = 20;
    const paddingRight = 10;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const maxVal = Math.max(...data.map(d => Math.max(d.new_leads, d.deals)), 5);
    const stepX = chartWidth / (data.length - 1);

    const getX = (i: number) => paddingLeft + i * stepX;
    const getY = (val: number) => paddingTop + chartHeight - (val / maxVal) * chartHeight;

    const points_leads = data.map((d, i) => `${getX(i)},${getY(d.new_leads)}`).join(' ');
    const hasDeals = data.some(d => d.deals > 0);
    const points_deals = data.map((d, i) => `${getX(i)},${getY(d.deals)}`).join(' ');

    const area_leads = `M ${getX(0)},${paddingTop + chartHeight} ` + points_leads + ` L ${getX(data.length - 1)},${paddingTop + chartHeight} Z`;
    const area_deals = `M ${getX(0)},${paddingTop + chartHeight} ` + points_deals + ` L ${getX(data.length - 1)},${paddingTop + chartHeight} Z`;

    return (
      <div className="relative mt-4">
        <svg className="w-full h-[180px]" viewBox={`0 0 ${width} ${height}`}>
          {[0, 0.5, 1].map((ratio) => {
            const y = paddingTop + chartHeight * (1 - ratio);
            const val = Math.round(maxVal * ratio);
            return (
              <g key={ratio}>
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                <text x={paddingLeft - 5} y={y + 4} textAnchor="end" className="fill-gray-300 text-[10px] font-bold">{val}</text>
              </g>
            );
          })}

          {data.map((d, i) => {
            if (i % 3 !== 0 && i !== data.length - 1) return null;
            const x = getX(i);
            return (
              <text key={i} x={x} y={height - 10} textAnchor="middle" className="fill-gray-300 text-[9px] font-black">{d.date}日</text>
            );
          })}

          <path d={area_leads} fill="url(#grad_leads)" opacity="0.1" />
          <polyline fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points_leads} className="drop-shadow-sm" />

          {hasDeals && (
            <>
              <path d={area_deals} fill="url(#grad_deals)" opacity="0.1" />
              <polyline fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points_deals} className="drop-shadow-sm" />
            </>
          )}

          {data.map((d, i) => (
            <g key={i}>
              <circle cx={getX(i)} cy={getY(d.new_leads)} r="2.5" fill="white" stroke="#3b82f6" strokeWidth="1.5" />
              {hasDeals && d.deals > 0 && (
                <circle cx={getX(i)} cy={getY(d.deals)} r="2.5" fill="white" stroke="#10b981" strokeWidth="1.5" />
              )}
            </g>
          ))}

          <defs>
            <linearGradient id="grad_leads" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
            <linearGradient id="grad_deals" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute top-0 left-0 text-[9px] text-gray-300 font-bold">(单位: 个)</div>
      </div>
    );
  };

  return (
    <PullToRefresh onRefresh={refreshData}>
      <div className="p-4 space-y-5 bg-gray-50 min-h-screen pb-24">
        {/* 核心红绿灯统计网格 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '线索总数', val: stats.status_counts.total, color: 'text-gray-800' },
            { label: '待跟进', val: stats.status_counts.new, color: 'text-blue-500' },
            { label: '进行中', val: stats.status_counts.following, color: 'text-orange-500' },
            { label: '定金', val: stats.status_counts.deposit, color: 'text-yellow-600' },
            { label: '成交', val: stats.status_counts.deal, color: 'text-green-600' },
            { label: '无效', val: stats.status_counts.invalid, color: 'text-gray-400' }
          ].map((item, idx) => (
            <div key={idx} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center">
              <span className={`text-xl font-black ${item.color}`}>{item.val}</span>
              <span className="text-[10px] text-gray-400 mt-1">{item.label}</span>
            </div>
          ))}
        </div>

        {/* 15日趋势折线图 */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-gray-800 italic">近15日业绩波动</h3>
            <div className="flex space-x-3 text-[9px] font-bold">
              <div className="flex items-center"><span className="w-2 h-2 bg-blue-500 rounded-full mr-1"></span>线索</div>
              <div className="flex items-center"><span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>成交</div>
            </div>
          </div>
          {renderChart()}
        </div>

        {/* 团队/客户 列表区 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex bg-gray-50 border-b overflow-x-auto whitespace-nowrap no-scrollbar">
            {[
              { code: RoleCode.MANAGER, label: `市场经理(${stats.team_counts.managers})`, minViewRole: 0 }, // Only Admin sees Managers
              { code: RoleCode.AGENT, label: `服务商(${stats.team_counts.agents})`, minViewRole: 1 },    // Admin(0) & Manager(1) see Agents
              { code: RoleCode.PROMOTER, label: `推广员(${stats.team_counts.promoters})`, minViewRole: 2 }, // Admin, Manager, Agent see Promoters
              { code: 'valid_customers', label: `有效客户(${stats.team_counts.valid_customers})`, minViewRole: 99 } // Everyone sees Customers
            ]
              .filter(tab => {
                // Special case for Customers: always visible
                if (tab.code === 'valid_customers') return true;
                // Standard hierarchy: User can only manage roles "below" them (Current Role Code < Target Role Code)
                // E.g. Manager(1) can view Agent(2). 1 < 2.
                // But my config above uses minViewRole which is "Max Role Level allowed to view this".
                // Let's stick to the simple logic: 
                // Display if: user.role_code <= tab.minViewRole
                // Admin(0) <= 0 (View Manager) -> OK
                // Manager(1) <= 0 (View Manager) -> False.
                // Manager(1) <= 1 (View Agent) -> OK.
                return user.role_code <= tab.minViewRole;
              })
              .map(tab => (
                <button
                  key={tab.code}
                  onClick={() => setActiveTab(tab.code as any)}
                  className={`px-4 py-4 text-[11px] font-black transition-all ${activeTab === tab.code ? 'text-[#07c160] border-b-2 border-[#07c160] bg-white' : 'text-gray-400'}`}
                >
                  {tab.label}
                </button>
              ))}
          </div>

          <div className="divide-y max-h-[500px] overflow-y-auto">
            {members.length > 0 ? members.map(m => {
              const statusStyle = getStatusLabel(m.lead_status);
              return (
                <div key={m.id} className="p-4 space-y-3 active:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        {m.store_name ? (
                          <span className="font-black text-gray-800 text-sm">{m.store_name}</span>
                        ) : null}
                        {getUserStatusBadge(m.status)}
                        {m.role_code !== RoleCode.CUSTOMER && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusStyle.color}`}>{statusStyle.text}</span>
                        )}
                        {/* Poster ID */}
                        {m.source_poster_id > 0 && (
                          <span className="text-[9px] text-gray-300 border border-gray-100 px-1 rounded">
                            ID:{m.source_poster_id}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center">
                        {m.nickname} <span className="text-gray-300 mx-1">|</span> {m.mobile}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="text-[#07c160] font-black text-sm">{m.subordinate_leads_count}</div>
                      <div className="text-[9px] text-gray-300">线索数</div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="text-[9px] text-gray-300 leading-relaxed max-w-[60%] truncate">
                      <i className="fa-solid fa-link mr-1 opacity-50"></i>
                      {/* Hierarchy Path Display */}
                      {(() => {
                        const parts = [];
                        // Fallback logic: Name -> ID -> Empty
                        const mgr = m.manager_name || (m.manager_id ? `ID:${m.manager_id}` : '');
                        const agt = m.agent_name || (m.owner_agent_id ? `ID:${m.owner_agent_id}` : '');
                        const pmt = m.promoter_name || (m.source_promoter_id ? `ID:${m.source_promoter_id}` : '');
                        const self = m.nickname || `ID:${m.id}`;

                        if (m.role_code === RoleCode.MANAGER) {
                          parts.push(self);
                        } else if (m.role_code === RoleCode.AGENT) {
                          if (mgr) parts.push(mgr);
                          parts.push(self);
                        } else if (m.role_code === RoleCode.PROMOTER) {
                          if (mgr) parts.push(mgr);
                          if (agt) parts.push(agt);
                          parts.push(self);
                        } else {
                          // Customer or other
                          if (mgr) parts.push(mgr);
                          if (agt) parts.push(agt);
                          if (pmt) parts.push(pmt);
                          // parts.push(self); // Usually customers are leaf, maybe don't show self in path if already in nickname? 
                          // User prompt: "Promoter tab: Manager/Agent/Promoter". 
                          // For Customer, maybe "Manager/Agent/Promoter" is enough context?
                          // Let's include self for consistency if list is mixed? 
                          // Actually user said: "Promoter ... -> Manager/Agent/Promoter".
                          // Meaning the LAST element is the item itself.
                          // So for Customer, it should likely be "Manager/Agent/Promoter/Customer"
                          parts.push(self);
                        }
                        return parts.filter(Boolean).join(' / ');
                      })()}
                    </div>
                    {m.status === UserStatus.PENDING ? (
                      <button
                        onClick={() => openAudit(m)}
                        className="px-4 py-1.5 bg-orange-500 text-white text-[10px] rounded-full font-black shadow-lg shadow-orange-100 animate-bounce"
                      >
                        去审核
                      </button>
                    ) : (
                      <button
                        onClick={() => openAudit(m)}
                        className="px-4 py-1.5 bg-gray-100 text-gray-500 text-[10px] rounded-full font-bold"
                      >
                        <i className="fa-solid fa-pen-to-square mr-1"></i>编辑资料
                      </button>
                    )}
                  </div>
                </div>
              );
            }) : (
              <div className="py-16 text-center">
                <i className="fa-solid fa-folder-open text-gray-100 text-4xl mb-3"></i>
                <p className="text-gray-300 text-xs italic">该分类下暂无成员</p>
              </div>
            )}
          </div>
        </section>

        {/* 审核/编辑对话框 */}
        {editingUser && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-black text-gray-800">{editingUser.status === UserStatus.PENDING ? '待办：账号审核' : '编辑成员资料'}</h3>
                <button onClick={() => setEditingUser(null)} className="text-gray-400 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <form onSubmit={handleUpdate} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* 审核操作单选组 */}
                {(editingUser.status === UserStatus.PENDING || editingUser.status === UserStatus.REJECTED) && (
                  <div className="space-y-3 pb-4 border-b">
                    <p className="text-[11px] font-black text-orange-500 flex items-center">
                      <i className="fa-solid fa-shield-halved mr-2"></i> 请选择审核操作
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <label className={`flex flex-col items-center p-3 rounded-2xl border-2 transition-all cursor-pointer ${auditAction === 'approve' ? 'bg-green-50 border-green-500' : 'bg-white border-gray-100'}`}>
                        <input type="radio" name="audit" value="approve" checked={auditAction === 'approve'} onChange={() => setAuditAction('approve')} className="hidden" />
                        <i className={`fa-solid fa-circle-check text-lg ${auditAction === 'approve' ? 'text-green-500' : 'text-gray-200'}`}></i>
                        <span className={`text-[10px] mt-2 font-black ${auditAction === 'approve' ? 'text-green-600' : 'text-gray-400'}`}>通过</span>
                      </label>
                      <label className={`flex flex-col items-center p-3 rounded-2xl border-2 transition-all cursor-pointer ${auditAction === 'reject' ? 'bg-orange-50 border-orange-500' : 'bg-white border-gray-100'}`}>
                        <input type="radio" name="audit" value="reject" checked={auditAction === 'reject'} onChange={() => setAuditAction('reject')} className="hidden" />
                        <i className={`fa-solid fa-circle-xmark text-lg ${auditAction === 'reject' ? 'text-orange-500' : 'text-gray-200'}`}></i>
                        <span className={`text-[10px] mt-2 font-black ${auditAction === 'reject' ? 'text-orange-600' : 'text-gray-400'}`}>拒绝</span>
                      </label>
                      <label className={`flex flex-col items-center p-3 rounded-2xl border-2 transition-all cursor-pointer ${auditAction === 'delete' ? 'bg-red-50 border-red-500' : 'bg-white border-gray-100'}`}>
                        <input type="radio" name="audit" value="delete" checked={auditAction === 'delete'} onChange={() => setAuditAction('delete')} className="hidden" />
                        <i className={`fa-solid fa-trash-can text-lg ${auditAction === 'delete' ? 'text-red-500' : 'text-gray-200'}`}></i>
                        <span className={`text-[10px] mt-2 font-black ${auditAction === 'delete' ? 'text-red-600' : 'text-gray-400'}`}>删除</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">昵称/姓名</label>
                  <input
                    type="text"
                    value={editingUser.nickname}
                    onChange={e => setEditingUser({ ...editingUser, nickname: e.target.value })}
                    className="w-full bg-gray-50 border-none p-3.5 rounded-2xl outline-none focus:ring-2 focus:ring-[#07c160]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">手机号</label>
                  <input
                    type="tel"
                    value={editingUser.mobile}
                    onChange={e => setEditingUser({ ...editingUser, mobile: e.target.value })}
                    className="w-full bg-gray-50 border-none p-3.5 rounded-2xl outline-none focus:ring-2 focus:ring-[#07c160]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">审核理由/备注</label>
                  <input
                    type="text"
                    value={auditReason}
                    onChange={e => setAuditReason(e.target.value)}
                    placeholder={auditAction === 'reject' ? "拒绝时必填..." : "通过时选填..."}
                    className={`w-full bg-gray-50 border-none p-3.5 rounded-2xl outline-none focus:ring-2 ${auditAction === 'reject' && !auditReason ? 'ring-2 ring-orange-200 bg-orange-50' : 'focus:ring-[#07c160]'}`}
                  />
                </div>
                <div className="pt-6">
                  <button
                    type="submit"
                    className={`w-full py-4 rounded-2xl font-black shadow-xl active:scale-95 transition-all text-white ${auditAction === 'delete' ? 'bg-red-500' : auditAction === 'reject' ? 'bg-orange-500' : 'bg-[#07c160]'}`}
                  >
                    {editingUser.status === UserStatus.PENDING ? '确认审核结果' : '确认并保存修改'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 快捷操作区 */}
        {/* 快捷操作区 (Removed per user request) */}
        {/* <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onNavigate('leads')} ... />
        <button onClick={() => onNavigate('resources')} ... />
      </div> */}
      </div>
    </PullToRefresh>
  );
};

export default Dashboard;
