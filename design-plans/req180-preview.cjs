// 仅本地验收服务器与回归测试使用，隔离内存数据，无生产写入。
module.exports = () => {
      modalStack.slice().forEach(closeModal);
      wclReportCache = [];
      wclReportChecks.clear();
      window.fixture = {
        guild: { id: 'fixture-guild', wcl_guild_id: 1 }, canEdit: true,
        writes: [], failSave: false, failSummary: false, failAttendance: false,
        reports: [{ code: 'NewReport123', startTime: new Date('2026-11-04T20:00:00+08:00').getTime(), endTime: new Date('2026-11-04T23:00:00+08:00').getTime(), zoneName: '烈毒之渊', title: '隔离验收报告' }],
        summary: { title: '隔离验收报告', bossFightTotal: 2, players: [
          { name: '甲', server: '服务器一', subType: 'Warrior', bossFights: 2 },
          { name: '乙', server: '服务器二', subType: 'Mage', bossFights: 1 },
          { name: '丙', server: '服务器一', subType: 'Priest', bossFights: 2 },
          { name: '<陌生人>', server: '服务器三', subType: 'Mage', bossFights: 2 }
        ] }
      };
      appData.members = [
        { id: 'm1', name: '甲', server: '服务器一', class: '战士', main_spec: '防护', status: '正式' },
        { id: 'm2', name: '乙', server: '服务器一', class: '法师', main_spec: '冰霜', status: '正式' },
        { id: 'm3', name: '丙', server: '服务器一', class: '牧师', main_spec: '神圣', status: '正式' }
      ];
      fixture.activities = [{ id: 'a1', date: '2026-11-04', raid_name: '烈毒之渊', start_time: '20:00', end_time: '23:00', team_label: '1', status: 'normal', notes: '', boss: '', wcl_url: '', wcl_report_code: '', attendees: [{ member_id: 'm1', status: '迟到' }, { member_id: 'm2', status: '缺席' }] }];
      appData.activities = structuredClone(fixture.activities);
      window.CloudSync = { ...window.CloudSync,
        canEdit: () => fixture.canEdit, getCurrentGuild: () => fixture.guild,
        getCachedUser: () => ({ id: 'fixture-user' }), getAccessToken: async () => 'fixture-only',
        saveCloudData: async (type, operation, payload) => {
          if (fixture.failSave) throw Error('模拟保存失败');
          if (type !== 'activities' || operation !== 'update') throw Error('禁止非验收写入');
          fixture.writes.push({ type, payload: structuredClone(payload) });
          Object.assign(fixture.activities.find(a => a.id === payload.id), structuredClone(payload));
        },
        reloadData: async () => { appData.activities = structuredClone(fixture.activities); }
      };
      const originalFetch = window.fetch;
      window.fetch = async (url, options = {}) => {
        const path = new URL(url, location.href).pathname;
        if (path === '/api/wcl/report-summary') {
          await new Promise(r => setTimeout(r, 80));
          return new Response(JSON.stringify(fixture.failSummary ? { message: '模拟日志读取失败' } : fixture.summary), { status: fixture.failSummary ? 502 : 200 });
        }
        if (path === '/api/wcl/reports') return new Response(JSON.stringify({ reports: fixture.reports }));
        if (path === '/api/wcl/report-fights') return new Response(JSON.stringify({ fights: [], title: '隔离看板' }));
        if (path === '/api/db/rest/v1/activity_attendance') {
          if (fixture.failAttendance) return new Response(JSON.stringify({ message: '模拟考勤失败' }), { status: 500 });
          const body = JSON.parse(options.body), query = new URL(url, location.href).searchParams;
          const activity = fixture.activities.find(a => a.id === (body.activity_id || query.get('activity_id').slice(3)));
          const memberId = body.member_id || query.get('member_id').slice(3);
          const statuses = { present: '出席', absent: '缺席', backup: '替补', leave: '请假', late: '迟到' };
          let row = activity.attendees.find(a => a.member_id === memberId);
          if (!row) { row = { member_id: memberId }; activity.attendees.push(row); }
          row.status = statuses[body.status];
          fixture.writes.push({ type: 'attendance', memberId });
          return new Response(JSON.stringify([row]));
        }
        if (options.method && options.method !== 'GET') throw Error('禁止其他写入');
        return originalFetch(url, options);
      };
      document.querySelectorAll('.page.active').forEach(p => p.classList.remove('active'));
      document.getElementById('page-attendance').classList.add('active');
      history.replaceState(null, '', '#/team/attendance');
      iaLastHash = '#/team/attendance';
      iaPaintRoute('attendance', 'team');
      document.getElementById('pageTitle').textContent = '考勤记录 · 隔离演示';
      document.body.classList.remove('viewer-mode');
      renderAttendance();
    };
