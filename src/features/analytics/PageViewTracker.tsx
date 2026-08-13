import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getVisitorKey } from '@/features/analytics/visitor';

/**
 * 路由埋点：页面切换时上报访问。
 * - HashRouter 下使用 react-router 的 pathname（拿到 /svg、/json 等真实页面路径）；
 * - 动态 import 统计模块，避免把 CloudBase SDK 拉进主包；
 * - 上报失败静默忽略，不影响业务。
 */
export default function PageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const visitorKey = getVisitorKey();
    void import('@/features/analytics/api')
      .then(({ trackVisit }) => {
        if (!cancelled) {
          void trackVisit(location.pathname, visitorKey);
        }
      })
      .catch(() => {
        // 统计失败不影响业务
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  return null;
}
