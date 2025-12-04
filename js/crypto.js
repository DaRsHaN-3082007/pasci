// js/crypto.js
/* exported b64Encode, b64Decode, rndBytes, deriveKey, encryptJson, decryptJson,
            randomPassword, uuid */
function b64Encode(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function b64Decode(s){ const bin = atob(s); const arr = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr.buffer; }
function rndBytes(len){ const b = new Uint8Array(len); crypto.getRandomValues(b); return b; }
function nowIso(){ return new Date().toISOString(); }
function uuid(){ return 'id-'+Math.random().toString(36).slice(2,11); }

async function deriveKey(password, salt, iterations=250000){
  const enc = new TextEncoder();
  const pwKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
    pwKey,
    { name:'AES-GCM', length: 256 },
    true,
    ['encrypt','decrypt']
  );
  return key;
}

async function encryptJson(key, obj){
  const iv = rndBytes(12);
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, data);
  return { cipher: b64Encode(cipher), iv: b64Encode(iv) };
}

async function decryptJson(key, cipherB64, ivB64){
  const cipher = b64Decode(cipherB64);
  const iv = b64Decode(ivB64);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, cipher);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plain));
}

function randomPassword(len=16){
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}<>?';
  let out = '';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for(let i=0;i<len;i++){ out += chars[arr[i] % chars.length]; }
  return out;
}

export { b64Encode, b64Decode, rndBytes, deriveKey, encryptJson, decryptJson, randomPassword, uuid, nowIso };
