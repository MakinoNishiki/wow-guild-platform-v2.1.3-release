const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const preview = String.raw`<script>
(() => {
  const fetchRead = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const method = (options?.method || input?.method || 'GET').toUpperCase();
    const target = new URL(input?.url || input, location.href);
    const publicLoot = method === 'POST' && target.protocol === 'https:' &&
      target.pathname === '/rest/v1/rpc/get_public_loot_detail';
    return method === 'GET' || publicLoot ? fetchRead(input, options) : Promise.reject(Error('预览仅开放读取'));
  };
  window.addEventListener('load', () => {
    const button = document.createElement('button');
    button.className = 'btn btn-secondary';
    button.textContent = '验收：成员演示';
    document.querySelector('.ia-top-right').prepend(button);
    const login = document.querySelector('#iaLoginBtn');
    login.disabled = true;
    login.title = '本地验收使用隔离名单';
    let stored;
    let fixtureReady = false;
    button.onclick = () => {
      if (!fixtureReady) {
        fixtureReady = true;
        stored = {id:'fixture-member',name:'暮谷守卫',server:'演示',class:'战士',main_spec:'防护',off_specs:['狂怒'],role:['坦克'],status:'正式',join_date:'2026-11-04'};
        window.CloudSync = {...window.CloudSync,getCachedUser:()=>({id:'fixture-user'}),canEdit:()=>true,getCurrentGuild:()=>null,
          saveCloudData:async(type,operation,payload)=>{
            if(type!=='members'||operation!=='update'||payload.id!==stored.id)throw Error('演示只开放编辑已有成员');
            await new Promise(resolve=>setTimeout(resolve,700));
            if(payload.notes==='模拟失败')throw Error('验收演示：保存失败，修改备注后可重试');
            stored=payload;
          },
          reloadData:async()=>{appData.members=[stored];}
        };
      }
      appData.members=[stored];
      document.querySelectorAll('.page.active').forEach(page=>page.classList.remove('active'));
      document.querySelector('#page-members').classList.add('active');
      document.querySelector('#pageTitle').textContent='成员管理 · 隔离演示';
      iaPaintRoute('members','team');
      renderMembers();
    };
  });
})();
</script>`;
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json'};
let config;
http.createServer(async (req,res)=>{
  try {
    if(req.method!=='GET'){res.writeHead(405);return res.end();}
    const url = new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/api/supabase-config'){
      if(!config){
        const upstream=await fetch('https://wow.ddctl.com/api/supabase-config',{signal:AbortSignal.timeout(10000)});
        if(!upstream.ok)throw Error('公开目录配置暂不可用');
        const json=await upstream.json();
        config={url:json.url||json.supabaseUrl,anonKey:json.anonKey||json.supabaseAnonKey};
      }
      res.writeHead(200,{'Content-Type':mime['.json']});
      return res.end(JSON.stringify(config));
    }
    const relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
    if(!/^(?:index\.html$|(?:css|js|assets)\/[\w./\p{L}-]+$)/u.test(relative)||relative.split('/').some(part=>part.startsWith('.'))){res.writeHead(404);return res.end();}
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end();}
    let data=await fs.readFile(file);
    if(relative==='index.html')data=data.toString('utf8').replace('</head>',preview+'</head>');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:502);res.end();}
}).listen(18777,'127.0.0.1',()=>console.log('http://127.0.0.1:18777/#/home'));

