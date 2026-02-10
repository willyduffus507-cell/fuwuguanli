
import React, { useState, useEffect, useRef } from 'react';
import { User, PosterTemplate, RoleCode } from '../types';
import { dbService } from '../services/dbService';
import QRCode from 'qrcode';

interface ResourceCenterProps {
  user: User;
}

const ResourceCenter: React.FC<ResourceCenterProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState(1);
  const [resources, setResources] = useState<PosterTemplate[]>([]);
  const [selectedPoster, setSelectedPoster] = useState<PosterTemplate | null>(null);

  // States for rendering the final composite image
  const [compositeImageUrl, setCompositeImageUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [showShareGuide, setShowShareGuide] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [editingPoster, setEditingPoster] = useState<PosterTemplate | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newTemplateType, setNewTemplateType] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [qrPos, setQrPos] = useState({ x: 70, y: 70 });
  const [qrSize, setQrSize] = useState(20);
  const [interactionMode, setInteractionMode] = useState<'none' | 'drag' | 'resize'>('none');
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshResources = async () => {
    const list = await dbService.getPosterResources(user, activeTab);
    setResources(list);
  };

  useEffect(() => {
    refreshResources();
  }, [user, activeTab, isCreating]);

  // When a poster is selected, composite it into a single image for native saving/sharing
  useEffect(() => {
    if (selectedPoster) {
      generateCompositeImage(selectedPoster);
    } else {
      setCompositeImageUrl(null);
    }
  }, [selectedPoster]);

  const generateCompositeImage = async (poster: PosterTemplate) => {
    setIsRendering(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      // Add timestamp to bypass browser cache to ensure we get a fresh response with CORS headers
      // otherwise browser might reuse the cached thumbnail image which lacks CORS headers
      const separator = poster.image_url.includes('?') ? '&' : '?';
      img.src = `${poster.image_url}${separator}t=${new Date().getTime()}`;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Draw Background
      ctx.drawImage(img, 0, 0);

      // 2. Calculate QR position in pixels
      const qrx = (poster.qr_config?.x ?? 70) / 100 * canvas.width;
      const qry = (poster.qr_config?.y ?? 70) / 100 * canvas.height;
      const qrSizePx = (poster.qr_config?.size ?? 20) / 100 * canvas.width;

      // 3. Draw QR Background (white box)
      ctx.fillStyle = 'white';
      ctx.fillRect(qrx, qry, qrSizePx, qrSizePx);

      // 4. Generate QR Code Data (New Logic)
      // User Format: https://api.shop.ygzhdc.com/test/11/users_id=...，templates_id=...
      // Implemented: https://api.shop.ygzhdc.com/test/11?users_id=...&templates_id=...

      // Special Logic for Manager Invite (Poster ID 99999 => User ID 11)
      const targetUserId = poster.id === 99999 ? 11 : user.id;
      const targetTemplateId = poster.id === 99999 ? 0 : poster.id;

      // 4. Generate QR Code Data (New Logic)
      // p_type: B for Recruitment (Manager/Provider), C for Promotion (Terminal/Customer)
      const pType = poster.type === 2 ? 'C' : 'B';

      // Use current origin to ensure params work on any deployment (dev/prod)
      const qrData = `https://api.shop.ygzhdc.com/test/?users_id=${targetUserId}&templates_id=${targetTemplateId}&p_type=${pType}`;
      console.log('Generating QR for:', qrData);

      // 4.1. Generate Real QR Code
      try {
        const qrDataUrl = await QRCode.toDataURL(qrData, {
          errorCorrectionLevel: 'H',
          margin: 0,
          width: qrSizePx,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });

        const qrImg = new Image();
        qrImg.src = qrDataUrl;
        await new Promise(r => qrImg.onload = r);

        ctx.drawImage(qrImg, qrx, qry, qrSizePx, qrSizePx);
      } catch (err) {
        console.error("QR Code Error", err);
      }

      // 4.2 Draw Simulated QR (Legacy removed)

      const dataUrl = canvas.toDataURL('image/png');
      setCompositeImageUrl(dataUrl);
    } catch (error: any) {
      console.error("Failed to render poster:", error);
      const msg = error.message || (error.type === 'error' ? '图片跨域加载失败' : '未知错误');
      alert(`海报渲染失败: ${msg}\n\n可能是图片链接不支持跨域访问 (CORS)。请尝试使用允许跨域的图片链接 (如 Unsplash 或 Supabase Storage)。`);
    } finally {
      setIsRendering(false);
    }
  };



  // Checking if running in WeChat
  const isWeChat = () => /MicroMessenger/i.test(navigator.userAgent);

  const handleDownload = () => {
    if (!compositeImageUrl || !selectedPoster) return;

    // WeChat blocks automatic downloads and blob saving
    // We should just guide the user to long press locally
    if (isWeChat()) {
      const toast = document.createElement('div');
      toast.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-6 py-3 rounded-xl z-[999] text-xs font-bold animate-in fade-in zoom-in duration-200';
      toast.innerText = '请长按图片保存到相册';
      document.body.appendChild(toast);
      setTimeout(() => document.body.removeChild(toast), 2000);
      return;
    }

    const link = document.createElement('a');
    link.download = `${selectedPoster.title}_推广海报.png`;
    link.href = compositeImageUrl;
    link.click();
  };

  const handleShare = () => {
    if (isWeChat()) {
      const toast = document.createElement('div');
      toast.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-6 py-3 rounded-xl z-[999] text-xs font-bold animate-in fade-in zoom-in duration-200';
      toast.innerText = '由于微信限制，请长按图片发送给朋友';
      document.body.appendChild(toast);
      setTimeout(() => document.body.removeChild(toast), 2500);
      return;
    }
    setShowShareGuide(true);
    setTimeout(() => setShowShareGuide(false), 3000);
  };

  const handleImageUrlPreview = () => {
    if (newImageUrl) {
      setPreviewUrl(newImageUrl);
      setQrPos({ x: 65, y: 75 });
      setQrSize(22);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Local Preview via FileReader (Immediate Feedback)
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        setPreviewUrl(evt.target.result as string);
        setQrPos({ x: 65, y: 75 });
        setQrSize(22);
      }
    };
    reader.readAsDataURL(file);

    // 2. Upload to Server to get Real URL
    try {
      const publicUrl = await dbService.uploadPosterImage(file);
      if (publicUrl) {
        setNewImageUrl(publicUrl); // Save the real URL for submission
        console.log('Upload Success:', publicUrl);
      }
    } catch (error) {
      console.error('Upload failed', error);
      // alert('Warning: Upload failed, saving might not work properly');
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (interactionMode === 'none' || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const qrWidthPx = (qrSize / 100) * rect.width;
    const qrHeightPercent = (qrWidthPx / rect.height) * 100;

    if (interactionMode === 'drag') {
      let x = ((clientX - rect.left) / rect.width) * 100 - qrSize / 2;
      let y = ((clientY - rect.top) / rect.height) * 100 - qrHeightPercent / 2;
      x = Math.max(0, Math.min(x, 100 - qrSize));
      y = Math.max(0, Math.min(y, 100 - qrHeightPercent));
      setQrPos({ x, y });
    } else if (interactionMode === 'resize') {
      const startXPx = rect.left + (qrPos.x / 100) * rect.width;
      const currentWidthPx = clientX - startXPx;
      let newSize = (currentWidthPx / rect.width) * 100;
      newSize = Math.max(12, Math.min(newSize, 45));
      if (qrPos.x + newSize > 100) newSize = 100 - qrPos.x;
      const nextHPercent = ((newSize / 100) * rect.width / rect.height) * 100;
      if (qrPos.y + nextHPercent > 100) {
        newSize = ((100 - qrPos.y) / 100 * rect.height) / rect.width * 100;
      }
      setQrSize(newSize);
    }
  };

  const handleSaveTemplate = async () => {
    if (!newTitle || !previewUrl || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await dbService.createPosterTemplate({
        title: newTitle,
        image_url: previewUrl,
        type: newTemplateType,
        qr_config: { x: qrPos.x, y: qrPos.y, size: qrSize }
      });

      if (res) {
        alert('海报模板发布成功');
        setIsCreating(false);
        resetForm();
      } else {
        alert('发布失败：请检查网络或联系管理员检查数据库权限');
      }
    } catch (e) {
      console.error(e);
      alert('发布出错，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPoster || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await dbService.updatePoster(editingPoster.id, {
        title: editingPoster.title,
        status: editingPoster.status
      });
      setEditingPoster(null);
      refreshResources();
      alert('保存成功');
    } catch (e) {
      console.error(e);
      alert('更新出错，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePoster = async (id: number) => {
    if (window.confirm('确认彻底删除该海报吗？')) {
      await dbService.deletePoster(id);
      setEditingPoster(null);
      refreshResources();
    }
  };

  const resetForm = () => {
    setPreviewUrl(null);
    setNewTitle('');
    setNewImageUrl('');
    setQrPos({ x: 70, y: 70 });
    setQrPos({ x: 70, y: 70 });
    setQrSize(20);
  };

  const QRContent = () => (
    <div className="w-full h-full bg-white p-[10%] flex flex-col justify-between">
      <div className="flex justify-between h-[28%]">
        <div className="w-[28%] h-full bg-black rounded-sm"></div>
        <div className="w-[28%] h-full bg-black rounded-sm"></div>
      </div>
      <div className="flex justify-between h-[28%]">
        <div className="w-[28%] h-full bg-black rounded-sm"></div>
        <div className="w-[28%] h-full bg-gray-100 rounded-sm"></div>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4 relative min-h-[80vh]">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-black text-gray-800">营销素材中心</h3>
        <div className="flex items-center space-x-2">
          {/* market manager exclusive: invite service provider shortcut */}
          {user.role_code === RoleCode.MANAGER && (
            <button
              onClick={async () => {
                // Fetch latest "Invite Provider" poster (Type 4) dynamically
                const providers = await dbService.getPosterResources(user, 4);
                if (providers && providers.length > 0) {
                  // Use the first available template
                  setSelectedPoster(providers[0]);
                } else {
                  alert('暂未配置服务商邀请海报，请联系管理员');
                }
              }}
              className="bg-orange-100 text-orange-600 text-xs px-3 py-2 rounded-full font-bold flex items-center shadow-sm active:scale-95 transition-all"
            >
              <i className="fa-solid fa-user-plus mr-1.5"></i>邀请服务商
            </button>
          )}

          {/* admin exclusive: invite market manager (switches to tab 3) */}
          {user.role_code === RoleCode.ADMIN && (
            <button onClick={() => setActiveTab(3)} className="bg-purple-100 text-purple-600 text-xs px-3 py-2 rounded-full font-bold shadow-sm active:scale-95 transition-all">
              <i className="fa-solid fa-user-tie mr-1.5"></i>邀请市场经理
            </button>
          )}

          {/* 超管权限：新建海报模板 */}
          {user.role_code === RoleCode.ADMIN && (
            <button onClick={() => { setIsCreating(true); setNewTemplateType(activeTab); }} className="bg-[#07c160] text-white text-xs px-4 py-2 rounded-full font-bold shadow-lg active:scale-95 transition-all">
              <i className="fa-solid fa-paintbrush mr-1"></i> 新建排版
            </button>
          )}
        </div>
      </div>

      <div className="flex p-1 bg-gray-200 rounded-xl overflow-x-auto no-scrollbar gap-1">
        <button onClick={() => setActiveTab(1)} className={`flex-1 py-2 text-sm font-bold rounded-lg min-w-[80px] ${activeTab === 1 ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>招募合伙人</button>
        <button onClick={() => setActiveTab(2)} className={`flex-1 py-2 text-sm font-bold rounded-lg min-w-[80px] ${activeTab === 2 ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>终端推广</button>
        {user.role_code === RoleCode.ADMIN && (
          <>
            <button onClick={() => setActiveTab(3)} className={`flex-1 py-2 text-sm font-bold rounded-lg min-w-[80px] ${activeTab === 3 ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}>邀市场经理</button>
            <button onClick={() => setActiveTab(4)} className={`flex-1 py-2 text-sm font-bold rounded-lg min-w-[80px] ${activeTab === 4 ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500'}`}>邀服务商</button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 pb-24">
        {resources.map(res => (
          <div
            key={res.id}
            onClick={() => setSelectedPoster(res)}
            className={`bg-white rounded-2xl border p-4 flex items-center space-x-4 shadow-sm active:bg-gray-50 transition-all relative group ${res.status === 0 ? 'opacity-60 grayscale' : ''}`}
          >
            <div className="w-16 h-24 overflow-hidden rounded-xl bg-gray-50 border flex items-center justify-center shadow-inner">
              <img src={res.image_url} className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className="font-bold text-gray-800 text-sm truncate">{res.title}</h4>
                {res.status === 0 && <span className="text-[8px] px-1 bg-gray-200 text-gray-500 rounded uppercase font-black">已停用</span>}
              </div>
              <div className="flex items-center space-x-3 mt-1.5">
                <div className="bg-[#07c160]/5 px-2 py-0.5 rounded text-[10px] text-[#07c160] font-black">
                  <i className="fa-solid fa-link mr-1"></i> 注册量 {res.my_recruit_count}
                </div>
                <p className="text-[9px] text-gray-300 font-mono tracking-tighter uppercase">ID:{res.id}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {user.role_code === RoleCode.ADMIN && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingPoster(res); }}
                  className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-[#07c160]/10 hover:text-[#07c160] transition-all"
                >
                  <i className="fa-solid fa-sliders text-xs"></i>
                </button>
              )}
              <i className="fa-solid fa-chevron-right text-gray-200 text-xs"></i>
            </div>
          </div>
        ))}
        {resources.length === 0 && (
          <div className="py-20 text-center">
            <i className="fa-solid fa-palette text-4xl text-gray-100 mb-3"></i>
            <p className="text-gray-300 text-xs italic">暂未上传相关海报模板</p>
          </div>
        )}
      </div>

      {/* 超管编辑模板弹窗 */}
      {editingPoster && (
        <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-black text-gray-800">编辑排版参数</h3>
              <button onClick={() => setEditingPoster(null)} className="text-gray-400 active:scale-75 transition-all"><i className="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <form onSubmit={handleUpdateTemplate} className="p-6 space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">排版名称</label>
                <input
                  type="text"
                  value={editingPoster.title}
                  onChange={e => setEditingPoster({ ...editingPoster, title: e.target.value })}
                  className="w-full bg-gray-50 border-none p-3.5 rounded-2xl outline-none focus:ring-2 focus:ring-[#07c160] font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">投放状态</label>
                <div className="flex p-1 bg-gray-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setEditingPoster({ ...editingPoster, status: 1 })}
                    className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${editingPoster.status === 1 ? 'bg-white text-[#07c160] shadow-sm' : 'text-gray-400'}`}
                  >
                    启用中
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingPoster({ ...editingPoster, status: 0 })}
                    className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${editingPoster.status === 0 ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400'}`}
                  >
                    已停用
                  </button>
                </div>
              </div>

              <div className="pt-4 flex flex-col space-y-3">
                <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-[#07c160] text-white rounded-2xl font-black shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100">{isSubmitting ? '保存中...' : '保存修改'}</button>
                <button
                  type="button"
                  onClick={() => handleDeletePoster(editingPoster.id)}
                  className="w-full py-3 text-red-400 text-xs font-bold"
                >
                  删除排版模板
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新建模板弹窗 (超管专用) */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/95 z-[400] flex flex-col items-center justify-center overflow-hidden">
          <div className="w-full max-w-md bg-white rounded-t-3xl h-full max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center bg-white shrink-0 z-10 rounded-t-3xl">
              <h3 className="font-black text-gray-800">自定义排版编辑器</h3>
              <button onClick={() => setIsCreating(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 text-2xl active:scale-75"><i className="fa-solid fa-xmark"></i></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto bg-gray-100 p-4 space-y-4">
              <div className="bg-white p-4 rounded-3xl shadow-sm space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">模板类型</label>
                  <div className="flex p-1 bg-gray-100 rounded-xl flex-wrap gap-1">
                    <button onClick={() => setNewTemplateType(1)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all min-w-[80px] ${newTemplateType === 1 ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>招募合伙人</button>
                    <button onClick={() => setNewTemplateType(2)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all min-w-[80px] ${newTemplateType === 2 ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}>终端推广</button>
                    <button onClick={() => setNewTemplateType(3)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all min-w-[80px] ${newTemplateType === 3 ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400'}`}>邀市场经理</button>
                    <button onClick={() => setNewTemplateType(4)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all min-w-[80px] ${newTemplateType === 4 ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400'}`}>邀服务商</button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">模板标题</label>
                  <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="如：北京招募合伙人海报..." className="w-full bg-gray-50 border-none rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-[#07c160]" />
                </div>
              </div>

              {!previewUrl ? (
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-3xl shadow-sm">
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">图片链接 (URL)</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newImageUrl}
                        onChange={(e) => setNewImageUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 bg-gray-50 border-none rounded-2xl p-4 font-mono text-xs outline-none focus:ring-2 focus:ring-[#07c160]"
                      />
                      <button
                        onClick={handleImageUrlPreview}
                        disabled={!newImageUrl}
                        className="bg-black text-white px-4 rounded-2xl font-bold text-xs disabled:opacity-20 whitespace-nowrap"
                      >
                        加载链接
                      </button>
                      {/* File Upload Hidden as per request */}
                      {/* <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-[#07c160] text-white px-4 rounded-2xl font-bold text-xs whitespace-nowrap active:scale-95 transition-all"
                      >
                        <i className="fa-solid fa-image mr-1"></i>相册
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        accept="image/*" 
                      /> */}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3 pb-20">
                  <div className="text-center px-4">
                    <p className="text-[10px] text-orange-500 font-bold mb-3"><i className="fa-solid fa-hand-pointer mr-1"></i> 按住二维码拖动，点击右下角圆点缩放</p>
                  </div>
                  <div ref={containerRef} onMouseMove={handleMove} onMouseUp={() => setInteractionMode('none')} onTouchMove={handleMove} onTouchEnd={() => setInteractionMode('none')} className="relative w-full min-h-[300px] h-auto bg-gray-100 shadow-2xl rounded-xl overflow-hidden touch-none border-4 border-white flex items-center justify-center">
                    <img src={previewUrl} className="w-full h-auto block pointer-events-none object-contain" onError={() => alert('图片加载失败，请重试')} />
                    <div style={{ left: `${qrPos.x}%`, top: `${qrPos.y}%`, width: `${qrSize}%` }} className={`absolute aspect-square bg-white border-2 border-[#07c160] rounded shadow-2xl z-20`}>
                      <QRContent />
                      <div onMouseDown={(e) => { e.stopPropagation(); setInteractionMode('resize'); }} onTouchStart={(e) => { e.stopPropagation(); setInteractionMode('resize'); }} className="absolute -bottom-3 -right-3 w-8 h-8 bg-[#07c160] rounded-full border-4 border-white shadow-xl flex items-center justify-center cursor-nwse-resize z-30" />
                      <div onMouseDown={(e) => { e.stopPropagation(); setInteractionMode('drag'); }} onTouchStart={(e) => { e.stopPropagation(); setInteractionMode('drag'); }} className="absolute inset-0 cursor-move" />
                    </div>
                  </div>
                  <button onClick={() => setPreviewUrl(null)} className="text-xs font-bold text-gray-400 underline underline-offset-4">重选图片</button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-white border-t flex space-x-3 pb-8 shrink-0 z-10">
              <button onClick={() => setIsCreating(false)} className="flex-1 py-4 text-gray-400 font-bold">取消</button>
              <button onClick={handleSaveTemplate} disabled={!newTitle || !previewUrl || isSubmitting} className="flex-[2] bg-[#07c160] text-white py-4 rounded-2xl font-black shadow-lg shadow-green-100 disabled:opacity-20 active:scale-95 transition-all disabled:active:scale-100">{isSubmitting ? '发布中...' : '保存并发布'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 海报详情展示 (带合成逻辑) */}
      {
        selectedPoster && (
          <div className="fixed inset-0 bg-black z-[500] flex flex-col animate-in fade-in duration-300">
            <button
              onClick={() => setSelectedPoster(null)}
              className="fixed top-6 right-6 w-12 h-12 bg-white/10 text-white rounded-full flex items-center justify-center text-2xl border border-white/20 backdrop-blur-md z-[520] shadow-2xl active:scale-90 transition-transform"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>

            {/* Title Bar - Optional, but keeps the top spacing consistent */}
            <div className="shrink-0 h-16"></div>

            <div className="flex-1 overflow-hidden flex flex-col items-center justify-center p-6 w-full">
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-sm h-full flex items-center justify-center"
              >
                {isRendering ? (
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-12 h-12 border-4 border-[#07c160]/30 border-t-[#07c160] rounded-full animate-spin"></div>
                    <p className="text-gray-400 text-xs font-black tracking-widest animate-pulse uppercase">Rendering...</p>
                  </div>
                ) : compositeImageUrl ? (
                  <img
                    src={compositeImageUrl}
                    alt="Final Merged Poster"
                    className="max-w-full max-h-full object-contain shadow-2xl rounded-2xl animate-in zoom-in-95 duration-500"
                  />
                ) : (
                  <div className="text-gray-400 font-bold">数据包解压中...</div>
                )}
              </div>
            </div>

            <div
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 w-full px-8 pb-12 pt-4 bg-black z-[510]"
            >
              <div className="flex justify-around items-center max-w-sm mx-auto">
                <button
                  onClick={() => handleDownload()}
                  className="flex flex-col items-center text-white/60 space-y-2 active:text-[#07c160] transition-all group"
                >
                  <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center text-2xl border border-white/10 shadow-xl group-active:scale-90 group-active:bg-[#07c160]/10 transition-transform">
                    <i className="fa-solid fa-cloud-arrow-down"></i>
                  </div>
                  <span className="text-[10px] font-black tracking-[0.2em] uppercase">保存海报</span>
                </button>

                <div className="h-10 w-px bg-white/10"></div>

                <button
                  onClick={() => handleShare()}
                  className="flex flex-col items-center text-white/60 space-y-2 active:text-[#07c160] transition-all group"
                >
                  <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center text-2xl border border-white/10 text-[#07c160] shadow-xl group-active:scale-90 group-active:bg-[#07c160]/20 transition-transform">
                    <i className="fa-brands fa-weixin"></i>
                  </div>
                  <span className="text-[10px] font-black tracking-[0.2em] uppercase">分享好友</span>
                </button>
              </div>

              <div className="mt-8 flex flex-col items-center space-y-1">
                <p className="text-white/20 text-[9px] uppercase font-black tracking-[0.4em]">长按上方海报直接保存到相册</p>
                <div className="w-12 h-1 bg-white/10 rounded-full mt-2"></div>
              </div>
            </div>

            {showShareGuide && (
              <div className="fixed top-6 right-6 bg-[#07c160] text-white p-4 rounded-2xl z-[600] animate-in slide-in-from-top-10 duration-500 flex items-center space-x-3 shadow-[0_10px_40px_rgba(7,193,96,0.4)]">
                <div className="text-2xl animate-bounce"><i className="fa-solid fa-arrow-up-right-from-square"></i></div>
                <div className="pr-2">
                  <p className="text-xs font-black">点击右上角更多</p>
                  <p className="text-[10px] opacity-80 font-bold">发送给朋友或分享朋友圈</p>
                </div>
              </div>
            )}
          </div>
        )
      }
    </div >
  );
};

export default ResourceCenter;
