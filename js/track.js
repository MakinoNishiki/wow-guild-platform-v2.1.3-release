/* ============================================================
 * REQ-141 全站埋点采集层（任务书 #54 WP1）——零依赖 IIFE，全局 WBTrack
 * 三壳共用（index/decor/data）：PV 自动上报 + vid 访客牌 + 静默兜底。
 * 红线：任何异常不得影响页面业务行为；服务端白名单外事件自动吞。
 * ============================================================ */
(function () {
  "use strict";

  var VID_KEY = "wb_vid";
  var currentPage = null; // 当前页（index 壳随 switchPage 包装更新，自定义事件跟随所在页签）

  // ---- vid：localStorage 临时访客牌 ----
  function getVid() {
    try {
      var vid = localStorage.getItem(VID_KEY);
      if (!vid) {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
          vid = window.crypto.randomUUID();
        } else {
          // 降级：时间戳+随机数拼接（老浏览器无 randomUUID）
          vid = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        }
        localStorage.setItem(VID_KEY, vid);
      }
      return vid;
    } catch (e) {
      return null; // localStorage 不可用（隐私模式等）→ 本轮不带 vid
    }
  }

  // ---- page 推导：按外壳 pathname ----
  function derivePage() {
    var p = location.pathname || "";
    if (p.indexOf("decor.html") !== -1) return "decor";
    if (p.indexOf("data.html") !== -1) return "data";
    return "index:dashboard"; // index 壳起始页签
  }

  // ---- ref_dom：referrer 只取域（hostname），空 = 直接访问 → null ----
  function getRefDom() {
    try {
      if (!document.referrer) return null;
      return new URL(document.referrer).hostname || null;
    } catch (e) {
      return null;
    }
  }

  // ---- 发送：sendBeacon 优先，fetch keepalive 兜底，全程静默 ----
  function send(payload) {
    var body;
    try {
      body = JSON.stringify(payload);
    } catch (e) {
      return;
    }
    try {
      if (navigator.sendBeacon) {
        var ok = navigator.sendBeacon(
          "/api/track",
          new Blob([body], { type: "application/json" })
        );
        if (ok) return;
      }
    } catch (e) { /* 落入 fetch 兜底 */ }
    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
      }).catch(function () { /* 静默 */ });
    } catch (e) { /* 静默 */ }
  }

  function reportPageView(pageKey, props) {
    try {
      currentPage = pageKey || currentPage || derivePage();
      send({
        event: "page_view",
        page: currentPage,
        uid: window.__wbUid || null, // 登录用户 id（app.js 授权两行写入）
        vid: getVid(),
        ref_dom: getRefDom(),
        props: props || {},
      });
    } catch (e) { /* 静默兜底：埋点永不得影响业务 */ }
  }

  // ---- index 壳页签 PV：包装 window.switchPage，原函数执行后上报 index:<key> ----
  function wrapSwitchPage() {
    try {
      if (typeof window.switchPage !== "function") return; // 非 index 壳 / 函数不存在不炸
      if (window.switchPage.__wbTrackWrapped) return; // 幂等防重复包装
      var orig = window.switchPage;
      var wrapped = function (pageName) {
        var ret = orig.apply(this, arguments);
        try {
          if (typeof pageName === "string" && pageName) {
            reportPageView("index:" + pageName);
          }
        } catch (e) { /* 静默 */ }
        return ret;
      };
      wrapped.__wbTrackWrapped = true;
      window.switchPage = wrapped;
    } catch (e) { /* 静默 */ }
  }

  function boot() {
    wrapSwitchPage();
    reportPageView(); // 页面加载完成即自动上报一次 page_view
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // ---- 对外 API：自定义事件（WP3 挂点时调用；服务端白名单外自动吞） ----
  window.WBTrack = {
    event: function (name, props) {
      try {
        send({
          event: name,
          page: currentPage || derivePage(),
          uid: window.__wbUid || null,
          vid: getVid(),
          ref_dom: getRefDom(),
          props: props || {},
        });
      } catch (e) { /* 静默 */ }
    },
    // 供页签切换等内部调用（WP1 由 switchPage 包装自动触发）
    pageView: reportPageView,
  };
})();
