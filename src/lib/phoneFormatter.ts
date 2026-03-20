/**
 * Swiss Phone Number Formatter
 * Formats various phone number formats to standard Swiss format for WhatsApp automation
 * Swiss format: +41XXXXXXXXX (country code + 9 digits without leading 0)
 */

/**
 * Format phone number to Swiss standard format
 * Handles various input formats:
 * - +41 79 395 31 37
 * - +41793953137
 * - 0793953137
 * - 079 395 31 37
 * - +33 (French numbers - converts to Swiss if possible)
 * - International formats
 */
export function formatSwissPhone(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove all non-digit characters except leading +
  let cleaned = phone.trim().replace(/[\s\-\(\)\.\'\u2019\u2018]/g, '');
  
  // Handle empty after cleaning
  if (!cleaned) {
    return null;
  }

  // Remove any remaining non-digit characters except leading +
  if (cleaned.startsWith('+')) {
    const plus = '+';
    cleaned = plus + cleaned.substring(1).replace(/\D/g, '');
  } else {
    cleaned = cleaned.replace(/\D/g, '');
  }

  // Handle different formats
  if (cleaned.startsWith('+41')) {
    // Already has Swiss country code
    const digits = cleaned.substring(3);
    
    // Remove leading 0 if present
    const finalDigits = digits.startsWith('0') ? digits.substring(1) : digits;
    
    // Validate Swiss mobile numbers (should be 9 digits)
    if (finalDigits.length === 9) {
      return `+41${finalDigits}`;
    } else if (finalDigits.length === 10 && finalDigits.startsWith('0')) {
      // Handle case like +410793953137
      return `+41${finalDigits.substring(1)}`;
    } else if (finalDigits.length >= 9) {
      // Take first 9 digits
      return `+41${finalDigits.substring(0, 9)}`;
    }
  } else if (cleaned.startsWith('0041')) {
    // Alternative international format: 0041...
    const digits = cleaned.substring(4);
    const finalDigits = digits.startsWith('0') ? digits.substring(1) : digits;
    if (finalDigits.length >= 9) {
      return `+41${finalDigits.substring(0, 9)}`;
    }
  } else if (cleaned.startsWith('41') && !cleaned.startsWith('+')) {
    // Missing + sign: 41793953137
    const digits = cleaned.substring(2);
    const finalDigits = digits.startsWith('0') ? digits.substring(1) : digits;
    if (finalDigits.length >= 9) {
      return `+41${finalDigits.substring(0, 9)}`;
    }
  } else if (cleaned.startsWith('0') && cleaned.length === 10) {
    // Swiss local format: 0793953137
    const digits = cleaned.substring(1);
    if (digits.length === 9) {
      return `+41${digits}`;
    }
  } else if (cleaned.startsWith('+33')) {
    // French number - convert to Swiss if it looks like a mobile
    // This is a fallback, may need manual verification
    const digits = cleaned.substring(3);
    const finalDigits = digits.startsWith('0') ? digits.substring(1) : digits;
    if (finalDigits.length >= 9) {
      // Assume it should be Swiss and convert
      return `+41${finalDigits.substring(0, 9)}`;
    }
  } else if (!cleaned.startsWith('+') && cleaned.length === 11 && cleaned.startsWith('41')) {
    // 11 digits starting with 41 (missing +)
    return `+${cleaned}`;
  } else if (!cleaned.startsWith('+') && cleaned.length === 9) {
    // Just 9 digits, assume Swiss mobile without prefix
    return `+41${cleaned}`;
  } else if (!cleaned.startsWith('+') && cleaned.length === 10 && cleaned.startsWith('0')) {
    // 10 digits starting with 0
    return `+41${cleaned.substring(1)}`;
  }

  // If nothing matched, return null for manual review
  return null;
}

/**
 * Validate if a phone number is a valid Swiss mobile format
 */
export function isValidSwissPhone(phone: string | null): boolean {
  if (!phone) return false;
  
  // Swiss format: +41 followed by 9 digits
  // Mobile numbers typically start with 7X or 8X
  const swissPhoneRegex = /^\+41[0-9]{9}$/;
  
  return swissPhoneRegex.test(phone);
}

/**
 * Format for display with spaces (for UI)
 * +41793953137 -> +41 79 395 31 37
 */
export function formatSwissPhoneDisplay(phone: string | null): string {
  if (!phone || !isValidSwissPhone(phone)) {
    return phone || '';
  }

  const digits = phone.substring(3); // Remove +41
  return `+41 ${digits.substring(0, 2)} ${digits.substring(2, 5)} ${digits.substring(5, 7)} ${digits.substring(7, 9)}`;
}

/**
 * Extract all possible phone numbers from a lead row
 * Returns array of formatted phone numbers
 */
export function extractLeadPhones(
  primaryPhone: string | null | undefined,
  secondaryPhone: string | null | undefined,
  whatsappNumber: string | null | undefined
): { phone: string; source: 'primary' | 'secondary' | 'whatsapp'; original: string }[] {
  const phones: { phone: string; source: 'primary' | 'secondary' | 'whatsapp'; original: string }[] = [];

  if (primaryPhone) {
    const formatted = formatSwissPhone(primaryPhone);
    if (formatted) {
      phones.push({ phone: formatted, source: 'primary', original: primaryPhone });
    }
  }

  if (secondaryPhone && secondaryPhone !== primaryPhone) {
    const formatted = formatSwissPhone(secondaryPhone);
    if (formatted && !phones.some(p => p.phone === formatted)) {
      phones.push({ phone: formatted, source: 'secondary', original: secondaryPhone });
    }
  }

  if (whatsappNumber && whatsappNumber !== primaryPhone && whatsappNumber !== secondaryPhone) {
    const formatted = formatSwissPhone(whatsappNumber);
    if (formatted && !phones.some(p => p.phone === formatted)) {
      phones.push({ phone: formatted, source: 'whatsapp', original: whatsappNumber });
    }
  }

  return phones;
}

/**
 * Get the best phone number from multiple options
 * Priority: WhatsApp > Primary > Secondary
 */
export function getBestPhone(
  primaryPhone: string | null | undefined,
  secondaryPhone: string | null | undefined,
  whatsappNumber: string | null | undefined
): string | null {
  // Try WhatsApp first
  if (whatsappNumber) {
    const formatted = formatSwissPhone(whatsappNumber);
    if (formatted) return formatted;
  }

  // Try primary
  if (primaryPhone) {
    const formatted = formatSwissPhone(primaryPhone);
    if (formatted) return formatted;
  }

  // Try secondary
  if (secondaryPhone) {
    const formatted = formatSwissPhone(secondaryPhone);
    if (formatted) return formatted;
  }

  return null;
}
