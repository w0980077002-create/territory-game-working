#!/usr/bin/env bash
set -euo pipefail

image=vvr-arena-container-check
docker build --file Dockerfile.arena --tag "$image" .
volume=$(docker volume create)
container=
cleanup() {
  if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi
  docker volume rm "$volume" >/dev/null
}
trap cleanup EXIT

start() {
  container=$(docker run --detach --network none --mount "type=volume,source=$volume,target=/data" \
    --env ARENA_MODE=staging \
    --env ARENA_BOT_TOKEN=container-test-bot \
    --env ARENA_SESSION_SECRET=container-test-secret-at-least-32-chars \
    --env ARENA_TEST_USERS=1101,1102 "$image")
}
smoke() {
  docker exec -i "$container" node --input-type=module - "$1" <<'NODE'
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';

assert.equal(process.getuid(), 1000);
const url = 'http://127.0.0.1:' + process.env.PORT;
const api = async (path, body, auth) => {
  const headers = body ? {'Content-Type':'application/json'} : {};
  if (auth) Object.assign(headers, {Authorization:'Bearer ' + auth.token, 'X-Arena-Tab':auth.tab});
  const response = await fetch(url + '/arena-api/' + path, {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
  });
  return {status:response.status, data:await response.json()};
};

let health;
for (let attempt = 0; attempt < 30 && !health; attempt++) {
  health = (await api('health').catch(() => null))?.status === 200;
  if (!health) await new Promise(resolve => setTimeout(resolve, 200));
}
assert.ok(health, 'Arena health endpoint is ready');
assert.equal((await fetch(url)).status, 200);
assert.equal((await api('state')).status, 401);
assert.equal((await api('local?user=alice')).status, 401);
const telegram = (id) => {
  const data = new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
    user:JSON.stringify({id, first_name:'Container QA'})});
  const key = createHmac('sha256', 'WebAppData').update(process.env.ARENA_BOT_TOKEN).digest();
  const signed = [...data].map(([name, value]) => name + '=' + value).join('\n');
  data.set('hash', createHmac('sha256', key).update(signed).digest('hex'));
  return api('auth', {initData:data.toString()});
};
assert.equal((await telegram(1103)).status, 403);

const proof = '/data/container-check.json';
if (process.argv[2] === 'before') {
  const response = await telegram(1101);
  assert.equal(response.status, 200);
  writeFileSync(proof, JSON.stringify({token:response.data.token, tab:randomUUID()}), {mode:0o600});
} else {
  const auth = JSON.parse(readFileSync(proof, 'utf8'));
  const {status, data} = await api('state', undefined, auth);
  assert.equal(status, 200, 'The invitee profile still exists in SQLite after container replacement');
  assert.equal(data.level, 1);
}
NODE
}
start
smoke before
docker stop "$container" >/dev/null
docker rm "$container" >/dev/null
container=
start
smoke after
echo 'Arena container: non-root, healthy, Telegram allowlist enforced, SQLite persisted'
