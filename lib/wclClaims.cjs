'use strict';
const crypto = require('node:crypto');
const clean = value => typeof value === 'string' ? value.trim() : '';
// WCL character classID is deliberately not treated as Blizzard's classID.
function matchCharacters(characters, members, userId) {
  const seen = new Set();
  return (Array.isArray(characters) ? characters : []).map(character => {
    const name = clean(character.name);
    const server = clean(character.server && character.server.name);
    const region = clean(character.server && character.server.region && character.server.region.slug).toUpperCase();
    const identity = `${region}\0${server}\0${name}`;
    const base = { characterId: character.id, canonicalId: character.canonicalID, name, server, region };
    if (character.claimed !== true || region !== 'CN') return {...base,status:'unverified',memberId:null};
    if (!name || !server) return {...base,status:'wcl_incomplete',memberId:null};
    if (seen.has(identity)) return {...base,status:'duplicate',memberId:null};
    seen.add(identity);
    const named = members.filter(m => !['离队','inactive','deleted'].includes(m.status) && clean(m.name) === name);
    const matches = named.filter(m => clean(m.server) === server);
    if (matches.length > 1) return {...base,status:'ambiguous',memberId:null};
    if (!matches.length) return {...base,status:named.some(m=>!clean(m.server))?'guild_incomplete':'unmatched',memberId:null};
    const member = matches[0];
    return {...base,memberId:member.id,className:member.class || '',status:member.user_id ? (member.user_id === userId ? 'owned' : 'conflict') : 'available'};
  });
}
function claimAction(mode, role) {
  if (!['owner','editor','viewer'].includes(role)) return 'forbidden';
  if (role === 'owner' || role === 'editor') return 'claim';
  if (mode === 'assign') return 'forbidden';
  if (mode === 'approval') return 'request';
  return mode === 'free' ? 'claim' : 'forbidden';
}
// Bounded single-process evidence store. Never accepts identities from a browser.
function createEvidenceStore({ttl=600000,capacity=500,now=Date.now}={}) {
  const entries = new Map();
  function prune() { for (const [id,row] of entries) if (row.expires <= now()) entries.delete(id); }
  return {
    issue(userId,guildId,characters,wclUserId) {
      prune();
      if (!userId || !guildId || !Number.isSafeInteger(wclUserId) || wclUserId < 1) throw Error('Invalid evidence owner');
      if (entries.size >= capacity) throw Error('Too many pending authorizations');
      const id = crypto.randomBytes(32).toString('hex');
      entries.set(id,{userId,guildId,wclUserId,characters:structuredClone(characters),expires:now()+ttl});
      return id;
    },
    read(id,userId,guildId) {
      prune(); const row=entries.get(id);
      return row && row.userId===userId && row.guildId===guildId ? structuredClone(row) : null;
    },
    revokeUser(userId) { for(const [id,row] of entries) if(row.userId===userId) entries.delete(id); },
    remove(id) { entries.delete(id); }
  };
}
module.exports={matchCharacters,claimAction,createEvidenceStore};
