/**
 * End-to-end encryption: X25519 key agreement + HKDF-SHA256 + AES-256-GCM.
 *
 * Each account has one X25519 identity key pair. The private key never leaves the phone
 * (it lives in expo-secure-store, backed by the Android Keystore); the public key is uploaded
 * to the server and also shared in mesh "hello" packets.
 *
 * Sender and recipient derive the same key from their static key pairs, so a message only
 * decrypts with the real sender's public key: relays, gateways and the server cannot read it
 * or forge a sender.
 */

import * as SecureStore from 'expo-secure-store';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';
import { fromBase64, randomBytes, toBase64, toHex, utf8Decode, utf8Encode } from '../lib/bytes';

interface Identity {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyB64: string;
}

interface EncryptedEnvelope {
  v: 1;
  s: string; // HKDF salt
  n: string; // AES-GCM nonce
  c: string; // ciphertext + tag
}

let identity: Identity | null = null;

const storageKey = (userId: string) => `bartasetu.identity.${userId.replace(/[^A-Za-z0-9._-]/g, '')}`;

function deriveKey(theirPublicKeyB64: string, salt: Uint8Array, messageId: string): Uint8Array {
  if (!identity) throw new Error('Encryption keys are not loaded');
  const shared = x25519.getSharedSecret(identity.privateKey, fromBase64(theirPublicKeyB64));
  return hkdf(sha256, shared, salt, utf8Encode(`bartasetu-v1|${messageId}`), 32);
}

export const crypto = {
  /** Load this account's key pair from secure storage, creating it on first use. */
  async loadIdentity(userId: string): Promise<string> {
    const key = storageKey(userId);
    let privateKeyB64 = await SecureStore.getItemAsync(key);
    if (!privateKeyB64) {
      privateKeyB64 = toBase64(randomBytes(32));
      await SecureStore.setItemAsync(key, privateKeyB64);
    }
    const privateKey = fromBase64(privateKeyB64);
    const publicKey = x25519.getPublicKey(privateKey);
    identity = { privateKey, publicKey, publicKeyB64: toBase64(publicKey) };
    return identity.publicKeyB64;
  },

  clearIdentity(): void {
    identity = null;
  },

  publicKey(): string | null {
    return identity?.publicKeyB64 ?? null;
  },

  /** Short human-checkable fingerprint, e.g. "3F9A 0C21 7B44 E1D8". */
  fingerprint(publicKeyB64: string | null = identity?.publicKeyB64 ?? null): string {
    if (!publicKeyB64) return '-';
    const hex = toHex(sha256(fromBase64(publicKeyB64)).slice(0, 8)).toUpperCase();
    return hex.match(/.{4}/g)!.join(' ');
  },

  encrypt(plaintext: string, recipientPublicKeyB64: string, messageId: string): string {
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const key = deriveKey(recipientPublicKeyB64, salt, messageId);
    const ciphertext = gcm(key, nonce, utf8Encode(messageId)).encrypt(utf8Encode(plaintext));
    const envelope: EncryptedEnvelope = { v: 1, s: toBase64(salt), n: toBase64(nonce), c: toBase64(ciphertext) };
    return JSON.stringify(envelope);
  },

  /** Returns null when the payload cannot be decrypted (wrong key, tampered, or not for us). */
  decrypt(payload: string, senderPublicKeyB64: string, messageId: string): string | null {
    try {
      const envelope = JSON.parse(payload) as EncryptedEnvelope;
      if (envelope.v !== 1) return null;
      const key = deriveKey(senderPublicKeyB64, fromBase64(envelope.s), messageId);
      const plaintext = gcm(key, fromBase64(envelope.n), utf8Encode(messageId)).decrypt(fromBase64(envelope.c));
      return utf8Decode(plaintext);
    } catch {
      return null;
    }
  },
};
