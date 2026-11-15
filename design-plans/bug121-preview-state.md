# BUG-121 导入原文与预览一致性审计
范围：拾取导入弹窗；源码证据app.js lootDropImportParse/Confirm，截图显示新原文但仍报链接错误。原文替换不清空旧解析行已由源码确认；不能据此声称已读取用户真实请求。
Design language：复用现有textarea、预览区、disabled按钮和toast；不改布局/样式；DESIGN.md及UI工作方法继续适用。
Findings：No supported findings were found. 主问题是业务状态错误，不冒充视觉问题。
Improve first：No supported recommendation. 以下为运营报错修复范围的功能方案。
修复：文本变更使旧预览失效，提交前再次核对解析快照；非法/空输入先清旧行，重解析前零写入。现有解析按钮继续使用。浏览器验证换文、解析失败、程序赋值绕过input与重新解析后请求内容。
