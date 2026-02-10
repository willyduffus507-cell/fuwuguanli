
import React, { useState, useRef, useEffect } from 'react';
import { User, LeadStatus, ChatLog } from '../types';
import { dbService } from '../services/dbService';

interface LeadDetailProps {
  lead: User;
  currentUser: User;
  onClose: () => void;
  onUpdate: () => void;
}

const LeadDetail: React.FC<LeadDetailProps> = ({ lead, currentUser, onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'follow' | 'invalid' | 'deposit' | 'deal'>('follow');
  const [note, setNote] = useState('');
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    dbService.getChatHistory(lead.id).then(setChatLogs);
  }, [lead.id]);

  // Robust parsing: Handle string, null, or already object (if Supabase returns JSONB)
  const safeParseHistory = (history: any) => {
    try {
      if (!history) return [];
      if (typeof history === 'string') {
        const parsed = JSON.parse(history);
        return Array.isArray(parsed) ? parsed.reverse() : [];
      }
      if (Array.isArray(history)) return [...history].reverse();
      return [];
    } catch (e) {
      console.error("Failed to parse follow_up_history:", e);
      return [];
    }
  };

  // Local state for seamless/optimistic updates
  const [historyList, setHistoryList] = useState<any[]>(() => safeParseHistory(lead.follow_up_history));
  const followListRef = useRef<HTMLDivElement>(null);

  // Sync with prop updates
  useEffect(() => {
    setHistoryList(safeParseHistory(lead.follow_up_history));
  }, [lead.follow_up_history]);

  const getStatusLabel = (status: LeadStatus) => {
    switch (status) {
      case LeadStatus.NEW: return '待跟进';
      case LeadStatus.FOLLOWING: return '跟进中';
      case LeadStatus.DEPOSIT: return '已付定金';
      case LeadStatus.DEAL: return '已成交';
      case LeadStatus.INVALID: return '无效线索';
      default: return '未知';
    }
  };

  const handleAction = async (type: LeadStatus) => {
    let confirmMsg = "";
    if (type === LeadStatus.DEPOSIT) confirmMsg = "确定该客户已支付定金吗？状态变更后不可撤销。";
    if (type === LeadStatus.DEAL) confirmMsg = "确定该客户已正式成交吗？";
    if (type === LeadStatus.INVALID) confirmMsg = "确定标记该线索为无效吗？";

    if (confirmMsg && !window.confirm(confirmMsg)) return;

    const newNote = note || (type === LeadStatus.INVALID ? "标记线索为无效" : getStatusLabel(type));

    // Optimistic Update
    const newItem = {
      operator: currentUser.nickname || currentUser.username || '我',
      time: new Date().toISOString(),
      note: newNote
    };
    setHistoryList(prev => [newItem, ...prev]);
    setNote('');

    if (followListRef.current) followListRef.current.scrollTop = 0;

    setIsSubmitting(true);
    try {
      await dbService.addFollowUp(
        lead.id,
        currentUser.nickname,
        newNote,
        type
      );
      onUpdate();
    } catch (error) {
      alert('操作失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualFollowUp = async () => {
    if (!note.trim()) return;

    // 核心逻辑：如果是“待处理”状态，提交跟进后自动流转到“跟进中”
    const nextStatus = lead.lead_status === LeadStatus.NEW ? LeadStatus.FOLLOWING : undefined;

    // Optimistic Update
    const newItem = {
      operator: currentUser.nickname || currentUser.username || '我',
      time: new Date().toISOString(),
      note: note
    };
    setHistoryList(prev => [newItem, ...prev]);
    setNote('');

    if (followListRef.current) followListRef.current.scrollTop = 0;

    setIsSubmitting(true);
    try {
      await dbService.addFollowUp(
        lead.id,
        currentUser.nickname,
        newItem.note,
        nextStatus
      );

      onUpdate();
      // Remove alert for seamless flow
      /* if (lead.lead_status === LeadStatus.NEW) {
        alert('跟进成功，线索已自动标记为“进行中”');
      } */
    } catch (error) {
      alert('提交失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0">
      <div className="bg-white w-full max-w-md h-[92vh] rounded-t-3xl flex flex-col overflow-hidden shadow-2xl">
        {/* 头部 */}
        <div className="px-6 py-4 border-b flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h3 className="font-black text-xl text-gray-800">线索详情</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${lead.lead_status === LeadStatus.NEW ? 'bg-orange-500 text-white shadow-lg animate-pulse' : 'bg-green-100 text-green-600'}`}>
                当前状态: {getStatusLabel(lead.lead_status)}
              </span>
              {(lead.lead_status === LeadStatus.NEW) && (
                <span className="text-[10px] text-gray-400">注册时间: {new Date(lead.created_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 active:scale-90 transition-all">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* 主体滚动区 */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {/* 状态提醒 */}
          {lead.lead_status === LeadStatus.NEW && (
            <div className="mx-4 mt-4 p-3 bg-orange-50 border border-orange-100 rounded-xl flex items-center space-x-3">
              <i className="fa-solid fa-circle-exclamation text-orange-500 text-lg"></i>
              <p className="text-[10px] text-orange-700 font-bold leading-relaxed">该线索尚未被处理。请尽快在下方添加跟进备注。填写完成后，系统将自动将其标记为“跟进中”。</p>
            </div>
          )}

          {/* 客户概览 */}
          <div className="p-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex justify-between">
                <h4 className="font-bold text-gray-800 text-lg">{lead.store_name || '未填写店名'}</h4>
                <a href={`tel:${lead.mobile}`} className="text-[#07c160] w-10 h-10 bg-green-50 rounded-full flex items-center justify-center active:scale-90 transition-transform">
                  <i className="fa-solid fa-phone-volume text-lg"></i>
                </a>
              </div>
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs text-gray-400">
                <div className="flex flex-col">
                  <span className="mb-0.5">客户姓名</span>
                  <span className="text-gray-800 font-bold text-sm">{lead.nickname}</span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5">归属区域</span>
                  <span className="text-gray-800 font-bold text-sm">{lead.city_name || '未知'}</span>
                </div>
                <div className="flex flex-col col-span-2">
                  <span className="mb-0.5">成交意向度</span>
                  <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
                    <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-orange-400 to-red-500" style={{ width: `${lead.intent_score}%` }}></div>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-orange-500 font-black">{lead.intent_score}分</span>
                    <span className="text-[10px] text-gray-300">AI 自动评估</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 跟进记录 (时间倒叙) */}
          <div className="px-4 pb-4">
            <div className="flex justify-between items-center mb-2">
              <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest">跟进日志 (倒序)</h5>
              <span className="text-[10px] text-gray-300">共 {historyList.length} 条记录</span>
            </div>
            <div
              ref={followListRef}
              className="bg-white rounded-2xl p-4 border shadow-sm max-h-[220px] overflow-y-auto space-y-5"
            >
              {historyList.length > 0 ? historyList.map((item: any, idx: number) => (
                <div key={idx} className="relative pl-6">
                  <div className="absolute left-0 top-1.5 w-2.5 h-2.5 bg-[#07c160] rounded-full border-2 border-white shadow-sm z-10"></div>
                  {idx < historyList.length - 1 && <div className="absolute left-[4px] top-4 w-0.5 h-[calc(100%+20px)] bg-gray-100"></div>}

                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-xs font-bold text-gray-700">{item.operator || '未知操作人'}</span>
                    <span className="text-[10px] text-gray-400 font-mono tracking-tighter">
                      {item.time ? new Date(item.time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-2.5 rounded-lg rounded-tl-none text-xs text-gray-600 leading-relaxed break-words">
                    {item.note}
                  </div>
                </div>
              )) : (
                <div className="py-8 flex flex-col items-center justify-center text-gray-300 opacity-60">
                  <i className="fa-solid fa-clipboard-list text-3xl mb-2"></i>
                  <span className="text-xs italic">暂无任何跟进记录</span>
                </div>
              )}
            </div>
          </div>

          {/* 聊天咨询记录 */}
          <div className="px-4 pb-24">
            <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">在线咨询历史</h5>
            <div className="space-y-3">
              {chatLogs.map(chat => (
                <div key={chat.id} className="flex flex-col items-start max-w-[85%]">
                  <div className={`px-3 py-2 rounded-2xl rounded-tl-none border shadow-sm text-sm ${chat.sender_role === 'USER' ? 'bg-orange-50 border-orange-100 text-gray-800' : 'bg-white text-gray-600'}`}>
                    {chat.content}
                  </div>
                  <span className="text-[9px] text-gray-300 mt-1 ml-1 transform scale-90 origin-left">
                    {chat.sender_role === 'AI' && <i className="fa-solid fa-robot mr-1"></i>}
                    {new Date(chat.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              {chatLogs.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-gray-300 text-[10px]">暂无咨询记录</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部交互面板 */}
        <div className="bg-white border-t p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] space-y-4 sticky bottom-0">
          <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
            {(['follow', 'invalid', 'deposit', 'deal'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`flex-shrink-0 flex-1 py-3 px-2 text-xs font-bold rounded-lg transition-all ${activeTab === t ? 'bg-white text-[#07c160] shadow-sm scale-100' : 'text-gray-400 scale-95'}`}
              >
                {t === 'follow' ? '添加跟进' : t === 'invalid' ? '无效线索' : t === 'deposit' ? '收定金' : '确认成交'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div className="relative">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isSubmitting}
                placeholder={
                  lead.lead_status === LeadStatus.NEW && activeTab === 'follow'
                    ? "此处填写首条跟进备注，提交后线索将标记为进行中..."
                    : activeTab === 'follow' ? "请输入跟进详情..." :
                      activeTab === 'invalid' ? "请备注该线索无效的原因（必填）..." :
                        `确认${activeTab === 'deposit' ? '收到定金' : '客户成交'}的备注信息...`
                }
                className={`w-full bg-gray-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-[#07c160] outline-none h-24 resize-none transition-all ${lead.lead_status === LeadStatus.NEW ? 'ring-2 ring-orange-100' : ''}`}
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  if (activeTab === 'follow') handleManualFollowUp();
                  else if (activeTab === 'invalid') handleAction(LeadStatus.INVALID);
                  else if (activeTab === 'deposit') handleAction(LeadStatus.DEPOSIT);
                  else handleAction(LeadStatus.DEAL);
                }}
                disabled={isSubmitting || (!note.trim() && (activeTab === 'follow' || activeTab === 'invalid'))}
                className={`flex-1 text-white py-4 rounded-2xl font-black shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 ${activeTab === 'invalid' ? 'bg-red-500 shadow-red-100' : 'bg-[#07c160] shadow-green-100'}`}
              >
                {isSubmitting ? (
                  <>
                    <i className="fa-solid fa-circle-notch animate-spin"></i>
                    正在提交...
                  </>
                ) : (
                  <>
                    {lead.lead_status === LeadStatus.NEW && activeTab === 'follow' ? '提交并开始跟进' :
                      activeTab === 'invalid' ? '确定设为无效线索' :
                        `提交${activeTab === 'follow' ? '跟进' : activeTab === 'deposit' ? '定金' : '成交'}记录`}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDetail;
