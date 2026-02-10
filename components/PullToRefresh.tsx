
import React, { useState, useRef, useEffect } from 'react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: React.ReactNode;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
    const [startY, setStartY] = useState(0);
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Thresholds
    const MAX_PULL = 120;
    const TRIGGER_THRESHOLD = 80;

    const handleTouchStart = (e: React.TouchEvent) => {
        // Only enable pull if at the top of the container
        // We check window.scrollY or element.scrollTop depending on where scroll is
        // In Layout.tsx, the scroll is on 'main', but here we are inside it.
        // It's safest to check if the parent scroll container is at top.

        // We can use a simple check: if window.scrollY === 0 (if body scrolls) 
        // OR try to find scrollable parent. 
        // For this app, Layout.main is the scroller. 
        // Let's assume passed children might be scrolled, or we rely on basic "scrollTop" check.

        const scroller = document.querySelector('main');
        if (scroller && scroller.scrollTop > 5) return; // Allow small buffer

        if (refreshing) return;
        setStartY(e.touches[0].clientY);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const scroller = document.querySelector('main');
        if (scroller && scroller.scrollTop > 5) return;

        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        if (diff > 0 && startY > 0) {
            // Pulling down
            if (diff < MAX_PULL) {
                setPullDistance(diff);
                // e.preventDefault(); // Might block scroll? Be careful.
            }
        }
    };

    const handleTouchEnd = async () => {
        if (refreshing) return;
        setStartY(0);

        if (pullDistance > TRIGGER_THRESHOLD) {
            setRefreshing(true);
            setPullDistance(60); // Snap to loading position
            try {
                await onRefresh();
            } finally {
                setTimeout(() => {
                    setRefreshing(false);
                    setPullDistance(0);
                }, 500);
            }
        } else {
            setPullDistance(0);
        }
    };

    return (
        <div
            className="relative flex flex-col h-full"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Loading Indicator */}
            <div
                className="absolute top-0 left-0 w-full flex items-center justify-center pointer-events-none transition-all duration-300 overflow-hidden"
                style={{
                    height: `${pullDistance}px`,
                    opacity: pullDistance > 0 ? 1 : 0
                }}
            >
                <div className="text-gray-400 text-xs font-bold flex flex-col items-center">
                    {refreshing ? (
                        <>
                            <i className="fa-solid fa-circle-notch fa-spin text-xl mb-1 text-[#07c160]"></i>
                            <span>正在刷新...</span>
                        </>
                    ) : (
                        <>
                            <i className={`fa-solid fa-arrow-down text-xl mb-1 transition-transform ${pullDistance > TRIGGER_THRESHOLD ? 'rotate-180' : ''}`}></i>
                            <span>{pullDistance > TRIGGER_THRESHOLD ? '释放立即刷新' : '下拉刷新'}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Content */}
            <div
                className="flex-1 transition-transform duration-300"
                style={{ transform: `translateY(${pullDistance}px)` }}
            >
                {children}
            </div>
        </div>
    );
};

export default PullToRefresh;
