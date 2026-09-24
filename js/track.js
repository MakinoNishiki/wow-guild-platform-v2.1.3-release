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
    // 任务书 #59 WP3（顾问授权本批唯一埋点修改例外）：index 壳按实际落地 hash 页签推导——
    // 原缺省 'index:dashboard' 是门户化前起始页假设，游客落 #/home 首条 PV 虚报 dashboard（WP1 开核实证）；
    // 空/未知 hash 保留旧缺省（公会成员空 hash 默认 dashboard 口径不变；游客首条 PV 由 boot 改造后的
    // switchPage 包装按路由实测上报，不再经本缺省）
    var h = location.hash || "";
    var m = h.match(/^#\/house\/(decor|plan|community)$/);
    if (m) return "index:" + (m[1] === "plan" ? "decor-plan" : m[1]);
    m = h.match(/^#\/team\/([a-z-]+)$/);
    if (m) return "index:" + m[1];
    if (h === "#/home") return "index:home";
    if (h === "#/team" || h === "#/team/") return "index:team-guide";
    return "index:dashboard"; // index 壳旧缺省（空 hash 兼容口径）
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
    // 任务书 #59 WP3（同上授权勘定）：index 壳不发 boot 缺省 PV——WP1 起落地必经 iaApplyRoute→switchPage，
    // 由包装器按实际落地页签上报（#/home 首条即 index:home，不再虚报 index:dashboard）；
    // decor/data 壳（含 WP3 重定向壳）无 switchPage，维持 boot 自动 PV（旧口径 decor/data 不断）
    var p = derivePage();
    if (p === "decor" || p === "data") reportPageView();
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
