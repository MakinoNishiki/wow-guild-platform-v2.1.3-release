"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  authorizeProxyRequest,
  authorizeRpcPayload,
  isPublicStaticFile,
} = require("../server");

const ROOT = path.join(__dirname, "..");
const USER = { id: "user-a", app_metadata: {} };

test("静态文件只允许前端公开资源", () => {
  assert.equal(isPublicStaticFile(path.join(ROOT, "index.html")), true);
  assert.equal(isPublicStaticFile(path.join(ROOT, "js", "app.js")), true);
  assert.equal(isPublicStaticFile(path.join(ROOT, "assets", "brand", "favicon-32.png")), true);
  assert.equal(isPublicStaticFile(path.join(ROOT, ".env")), false);
  assert.equal(isPublicStaticFile(path.join(ROOT, "server.js")), false);
  assert.equal(isPublicStaticFile(path.join(ROOT, "sql", "01_tables.sql")), false);
});

test("无过滤条件的修改和删除默认拒绝", async () => {
  const patch = await authorizeProxyRequest(USER, "guilds", "PATCH", "", '{"name":"x"}');
  const remove = await authorizeProxyRequest(USER, "activities", "DELETE", "", "");
  assert.equal(patch.status, 400);
  assert.equal(remove.status, 400);
});

test("公会创建者必须等于当前用户", async () => {
  const denied = await authorizeProxyRequest(
    USER,
    "guilds",
    "POST",
    "",
    '{"name":"x","owner_id":"user-b"}'
  );
  const allowed = await authorizeProxyRequest(
    USER,
    "guilds",
    "POST",
    "",
    '{"name":"x","owner_id":"user-a"}'
  );
  assert.equal(denied.status, 403);
  assert.equal(allowed.ok, true);
});

test("无法确认公会归属的业务写入默认拒绝", async () => {
  const result = await authorizeProxyRequest(USER, "activities", "POST", "", '{"name":"x"}');
  assert.equal(result.status, 400);
});

test("通知 RPC 只能查询当前用户", () => {
  assert.equal(
    authorizeRpcPayload(USER, "get_unread_notification_count", '{"p_user_id":"user-b"}').status,
    403
  );
  assert.equal(
    authorizeRpcPayload(USER, "get_unread_notification_count", '{"p_user_id":"user-a"}').ok,
    true
  );
  assert.equal(authorizeRpcPayload(USER, "get_unread_notification_count", "{").status, 400);
});
