// 仅列访客可直接使用的公开入口。服务端和前端共用正式地址与页面说明。
const PublicSearchPages = {
  home: {
    path: '/', route: '#/home', title: '魔兽管家 WoW Butler｜魔兽世界国服玩家工具',
    description: '魔兽管家为魔兽世界国服玩家提供家宅家具图鉴、国服大秘境与 PvP 排行榜、副本掉落查询，以及公会考勤和装备分配工具。'
  },
  decor: {
    path: '/housing-decor', route: '#/house/decor', title: '魔兽世界家宅家具图鉴｜获取方式与价格｜魔兽管家',
    description: '查询魔兽世界家宅家具的获取方式、商人和参考价格，按来源、风格或摆放环境筛选装饰，把想收集的家具加入方案单。'
  },
  rankings: {
    path: '/rankings', route: '#/rankings', title: '魔兽世界国服排行榜｜大秘境与 PvP 排名｜魔兽管家',
    description: '查看魔兽世界国服正式服史诗钥石地下城队伍和 PvP 玩家排名，按服务器、地下城或竞技赛制切换榜单，成绩来自魔兽世界国服官网。'
  },
  fonts: {
    path: '/font-manager/', title: '魔兽世界国服字体管理器｜字体预览与替换｜魔兽管家',
    description: '切换魔兽世界国服正式服、无限服和怀旧服，预览任务、聊天、姓名板和战斗数字字体，检查角色名缺字，按游戏版本应用或恢复字体。'
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = PublicSearchPages;
