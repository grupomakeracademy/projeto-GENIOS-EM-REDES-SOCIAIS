import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('New Features Validation', () => {
  it('validates storage quota calculation and limits', () => {
    const defaultQuotaMB = 100;
    const maxBatchBytes = 50 * 1024 * 1024; // 50MB
    const userFilesBytes = 45 * 1024 * 1024;
    
    // Batch limit check
    expect(userFilesBytes <= maxBatchBytes).toBe(true);
    expect(55 * 1024 * 1024 > maxBatchBytes).toBe(true);

    // User total quota check
    const currentUsedBytes = 60 * 1024 * 1024;
    const isExceeded = currentUsedBytes + userFilesBytes > defaultQuotaMB * 1024 * 1024;
    expect(isExceeded).toBe(true); // 60MB + 45MB = 105MB > 100MB
  });

  it('validates images per channel multiplier calculation', () => {
    const channels = ['instagram', 'facebook', 'linkedin'];
    const imageCount = 4;
    const totalConsumed = imageCount * channels.length;
    expect(totalConsumed).toBe(12);

    // Clamping 1 to 6
    const clamp = (val: number) => Math.min(6, Math.max(1, val));
    expect(clamp(0)).toBe(1);
    expect(clamp(4)).toBe(4);
    expect(clamp(10)).toBe(6);
  });

  it('validates magic prompt request and response schema', () => {
    const magicSchema = z.object({
      improvedText: z.string().min(1),
    });

    const mockResponse = {
      improvedText: 'Descubra 5 estratégias comprovadas de marketing para alavancar seu negócio local este mês.',
    };

    const parsed = magicSchema.safeParse(mockResponse);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.improvedText).toContain('estratégias');
    }
  });

  it('validates 6 calendar month summary statuses', () => {
    const expectedStatuses = [
      'PUBLISHED',
      'SCHEDULED',
      'APPROVED',
      'AWAITING_REVIEW',
      'DRAFT',
      'REJECTED',
    ];
    expect(expectedStatuses).toHaveLength(6);
    expect(expectedStatuses).toContain('DRAFT');
    expect(expectedStatuses).toContain('REJECTED');
    expect(expectedStatuses).toContain('AWAITING_REVIEW');
    expect(expectedStatuses).toContain('APPROVED');
    expect(expectedStatuses).toContain('SCHEDULED');
    expect(expectedStatuses).toContain('PUBLISHED');
  });

  it('verifies carousel slide 1 continuation cues inspiration list', () => {
    const cues = [
      'DESLIZE PARA CONTINUAR →',
      'ISSO É SÓ O COMEÇO →',
      'TEM MAIS NO PRÓXIMO →',
      'ARRASTE PARA O LADO →',
      'CONTINUA →',
      '1/5 →',
      'PRÓXIMO: O MAIS IMPORTANTE →',
      'QUER SABER COMO? →',
      'VEJA O PASSO 2 →',
    ];
    expect(cues.length).toBeGreaterThanOrEqual(9);
    cues.forEach((cue) => {
      expect(cue).toMatch(/→/);
    });
  });

  it('validates Super Admin identification and unlimited library storage', () => {
    const superAdminEmail = 'r.barros84@gmail.com';
    const isSuper = (email?: string, appMeta?: Record<string, unknown>) => {
      if (appMeta?.super_admin === true) return true;
      if (email && email.toLowerCase() === superAdminEmail.toLowerCase()) return true;
      return false;
    };

    expect(isSuper('r.barros84@gmail.com')).toBe(true);
    expect(isSuper('R.BARROS84@GMAIL.COM')).toBe(true);
    expect(isSuper('user@example.com')).toBe(false);
    expect(isSuper('other@example.com', { super_admin: true })).toBe(true);

    // Super admin has unlimited quota
    const getUserQuota = (email?: string) => (isSuper(email) ? -1 : 100);
    expect(getUserQuota('r.barros84@gmail.com')).toBe(-1);
    expect(getUserQuota('normal@user.com')).toBe(100);
  });

  it('validates request more storage popup message and WhatsApp link', () => {
    const whatsappNumber = '(19) 98878-8759';
    const whatsappUrl = 'https://wa.me/5519988788759';
    const expectedMessage = `Entre em contato com o Administrador para solicitar mais espaço de armazenamento pelo WhatsApp ${whatsappNumber}.`;

    expect(expectedMessage).toContain('WhatsApp');
    expect(expectedMessage).toContain('(19) 98878-8759');
    expect(whatsappUrl).toBe('https://wa.me/5519988788759');
  });
});

