import { getRandomValues, subtle } from 'crypto'; // Polyfill expected in RN or Node
// In React Native, usually you'd use a library like react-native-quick-crypto or similar polyfill

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  salt: string;
  ephemeralPublicKey: string;
  authTag?: string; // Appended to ciphertext in AES-GCM
}

const ALGORITHM_NAME = 'ECDH';
const CURVE_NAME = 'P-256'; // fallback standard since X25519 support varies in WebCrypto polyfills
const SYMMETRIC_ALGORITHM = 'AES-GCM';
const HKDF_ALGORITHM = 'HKDF';
const HASH_ALGORITHM = 'SHA-256';

export class CryptoService {
  private static identityKey: KeyPair | null = null;

  // Base64 Helpers
  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }

  static async generateKeyPair(): Promise<KeyPair> {
    const keyPair = await subtle.generateKey(
      { name: ALGORITHM_NAME, namedCurve: CURVE_NAME },
      true,
      ['deriveKey', 'deriveBits']
    );

    const publicKeyRaw = await subtle.exportKey('raw', keyPair.publicKey);
    const privateKeyPkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
      publicKey: this.arrayBufferToBase64(publicKeyRaw),
      privateKey: this.arrayBufferToBase64(privateKeyPkcs8)
    };
  }

  static async saveIdentityKey(keyPair: KeyPair): Promise<void> {
    this.identityKey = keyPair;
    // In a real app, save to Secure Store / Keychain
  }

  static async getIdentityKey(): Promise<KeyPair | null> {
    return this.identityKey;
  }

  static async deriveSharedKey(
    privateKeyBase64: string,
    peerPublicKeyBase64: string,
    saltBase64: string
  ): Promise<string> {
    const privateKeyBuffer = this.base64ToArrayBuffer(privateKeyBase64);
    const publicKeyBuffer = this.base64ToArrayBuffer(peerPublicKeyBase64);

    const importedPrivateKey = await subtle.importKey(
      'pkcs8',
      privateKeyBuffer,
      { name: ALGORITHM_NAME, namedCurve: CURVE_NAME },
      false,
      ['deriveKey']
    );

    const importedPublicKey = await subtle.importKey(
      'raw',
      publicKeyBuffer,
      { name: ALGORITHM_NAME, namedCurve: CURVE_NAME },
      false,
      []
    );

    const saltBuffer = this.base64ToArrayBuffer(saltBase64);

    const derivedKey = await subtle.deriveKey(
      {
        name: ALGORITHM_NAME,
        public: importedPublicKey
      },
      importedPrivateKey,
      {
        name: HKDF_ALGORITHM,
        hash: HASH_ALGORITHM,
        salt: saltBuffer,
        info: new Uint8Array() // Empty info for generic use
      } as any,
      true,
      ['encrypt', 'decrypt']
    );

    const rawKey = await subtle.exportKey('raw', derivedKey);
    return this.arrayBufferToBase64(rawKey);
  }

  static async encryptMessage(
    plaintext: string,
    recipientPublicKeyBase64: string
  ): Promise<EncryptedPayload> {
    // 1. Generate ephemeral key pair
    const ephemeralKeyPair = await this.generateKeyPair();
    const salt = new Uint8Array(16);
    getRandomValues(salt);
    const saltBase64 = this.arrayBufferToBase64(salt.buffer);

    // 2. Derive symmetric key
    const sharedKeyBase64 = await this.deriveSharedKey(
      ephemeralKeyPair.privateKey,
      recipientPublicKeyBase64,
      saltBase64
    );
    const sharedKeyBuffer = this.base64ToArrayBuffer(sharedKeyBase64);

    const aesKey = await subtle.importKey(
      'raw',
      sharedKeyBuffer,
      { name: SYMMETRIC_ALGORITHM },
      false,
      ['encrypt']
    );

    // 3. Encrypt
    const iv = new Uint8Array(12); // 96-bit IV for GCM
    getRandomValues(iv);

    const encodedPlaintext = new TextEncoder().encode(plaintext);

    const encryptedContent = await subtle.encrypt(
      { name: SYMMETRIC_ALGORITHM, iv },
      aesKey,
      encodedPlaintext
    );

    return {
      ciphertext: this.arrayBufferToBase64(encryptedContent),
      iv: this.arrayBufferToBase64(iv.buffer),
      salt: saltBase64,
      ephemeralPublicKey: ephemeralKeyPair.publicKey
    };
  }

  static async decryptMessage(
    payload: EncryptedPayload,
    recipientPrivateKeyBase64: string
  ): Promise<string> {
    const sharedKeyBase64 = await this.deriveSharedKey(
      recipientPrivateKeyBase64,
      payload.ephemeralPublicKey,
      payload.salt
    );
    const sharedKeyBuffer = this.base64ToArrayBuffer(sharedKeyBase64);

    const aesKey = await subtle.importKey(
      'raw',
      sharedKeyBuffer,
      { name: SYMMETRIC_ALGORITHM },
      false,
      ['decrypt']
    );

    const ivBuffer = this.base64ToArrayBuffer(payload.iv);
    const ciphertextBuffer = this.base64ToArrayBuffer(payload.ciphertext);

    const decryptedContent = await subtle.decrypt(
      { name: SYMMETRIC_ALGORITHM, iv: new Uint8Array(ivBuffer) },
      aesKey,
      ciphertextBuffer
    );

    return new TextDecoder().decode(decryptedContent);
  }

  static async publishPublicKey(publicKeyBase64: string): Promise<boolean> {
    // Stub: Upload to server API
    return true;
  }

  static async fetchUserPublicKey(userId: string): Promise<string | null> {
    // Stub: Fetch from server API
    return null;
  }
}
