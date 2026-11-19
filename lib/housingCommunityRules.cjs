'use strict';
// Small, reviewable starter list. This is not exhaustive moderation or an image classifier.
const blockedPhrases = Object.freeze(['出售冰毒', '出售海洛因', '买卖毒品', '代开赌博', '裸聊服务', '儿童色情']);
function checkComment(text) {
  const normalized = text.normalize('NFKC').replace(/[\s\u200b-\u200f\ufeff]/g, '').toLowerCase();
  if (blockedPhrases.some(word => normalized.includes(word))) return '留言包含不允许发布的内容，请修改后提交';
  if (/(?:javascript|data|file):/i.test(normalized)) return '留言不能包含可执行或本机文件链接';
  return '';
}
module.exports = { checkComment, blockedPhrases };
