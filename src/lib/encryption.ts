import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// Ensure the secret is 32 bytes for AES-256
const ENCRYPTION_SECRET = process.env.USER_KEYS_SECRET || 'DEFAULT_DEV_SECRET_DO_NOT_USE_IN_PROD_32_CHARS';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;

// Derive a 32 byte key from the secret
function getKey(salt: Buffer) {
  return crypto.pbkdf2Sync(ENCRYPTION_SECRET, salt, 100000, 32, 'sha512');
}

export function encryptString(text: string): string {
  if (!text) return text;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = getKey(salt);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: salt:iv:authTag:encryptedText
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptString(text: string): string | null {
  if (!text) return null;
  
  try {
    const textParts = text.split(':');
    if (textParts.length !== 4) return null;
    
    const salt = Buffer.from(textParts[0], 'hex');
    const iv = Buffer.from(textParts[1], 'hex');
    const authTag = Buffer.from(textParts[2], 'hex');
    const encryptedText = textParts[3];
    
    const key = getKey(salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}
