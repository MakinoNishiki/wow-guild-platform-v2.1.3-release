// 图标与职业色使用全站 IconMap；职责色沿用成员页的职责徽标。
window.GuildRecruitArt = (() => {
  'use strict';
  const icons = window.IconMap;
  const roleColors = new Map([
    ['坦克', 'var(--info)'],
    ['治疗', 'var(--success)'],
    ['输出', 'var(--danger)']
  ]);

  function getClass(name) {
    return {icon: icons.classIcon(name) || '', color: icons.classColor(name) || ''};
  }

  function getSpec(className, specName) {
    const icon = icons.specIcon(className, specName);
    return {icon: icon || '', color: icon ? icons.classColor(className) : ''};
  }

  function getRole(name) {
    return {icon: icons.roleIcon(name) || '', color: roleColors.get(name) || ''};
  }

  return {getClass, getSpec, getRole};
})();
