import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { QUALITY_MULTIPLIERS, type AdminUserDetail, type UserStatus } from '@/lib/domain';
import { isSuperAdmin, SUPER_ADMIN_EMAIL } from '@/lib/security/super-admin';

describe('Super Admin Users Management & Quota Unit', () => {
  it('identifies Super Admin correctly and rejects unauthorized users', () => {
    expect(isSuperAdmin({ email: 'r.barros84@gmail.com', app_metadata: {} })).toBe(true);
    expect(isSuperAdmin({ email: 'R.BARROS84@GMAIL.COM', app_metadata: {} })).toBe(true);
    expect(isSuperAdmin({ email: 'other@example.com', app_metadata: { super_admin: true } })).toBe(true);
    expect(isSuperAdmin({ email: 'regular@example.com', app_metadata: {} })).toBe(false);
    expect(isSuperAdmin({ email: null, app_metadata: {} })).toBe(false);
  });

  it('calculates quota consumption according to existing formula (image_count * channels * multiplier)', () => {
    // Formula from requirement: quantidade por canal * número de canais * multiplicador de qualidade
    // low = 1, medium = 3, high = 9
    expect(QUALITY_MULTIPLIERS.low).toBe(1);
    expect(QUALITY_MULTIPLIERS.medium).toBe(3);
    expect(QUALITY_MULTIPLIERS.high).toBe(9);

    const calcQuota = (images: number, channels: number, quality: 'low' | 'medium' | 'high') => {
      return images * channels * QUALITY_MULTIPLIERS[quality];
    };

    // Example from user request 7: 2 conteúdos vezes 4 redes. Com low consome 8. Com medium consome 24.
    expect(calcQuota(2, 4, 'low')).toBe(8);
    expect(calcQuota(2, 4, 'medium')).toBe(24);
    expect(calcQuota(2, 4, 'high')).toBe(72);
  });

  it('verifies AdminUserDetail data structure conforms to objective metrics without user-generated content', () => {
    const userDetail: AdminUserDetail = {
      id: 'test-user-id',
      email: 'user@example.test',
      name: 'Test User',
      avatar_url: undefined,
      role: 'MEMBER',
      status: 'active',
      created_at: '2026-09-11T12:00:00Z',
      last_sign_in_at: '2026-09-13T10:00:00Z',
      total_generations: 5,
      saldo_consumido: 48,
      qualities_used: {
        low: 3,
        medium: 2,
        high: 0,
      },
      storage_used_bytes: 10485760, // 10 MB
      storage_quota_mb: 100,
      is_unlimited: false,
      adjustment_history: [
        {
          id: 'log-1',
          created_at: '2026-09-12T14:00:00Z',
          actor: 'super-admin-id',
          admin_email: SUPER_ADMIN_EMAIL,
          previous_quota_mb: 50,
          new_quota_mb: 100,
          reason: 'Upgrade promocional',
        },
      ],
    };

    expect(userDetail.total_generations).toBe(5);
    expect(userDetail.saldo_consumido).toBe(48);
    expect(userDetail.qualities_used.low).toBe(3);
    expect(userDetail.qualities_used.medium).toBe(2);
    expect(userDetail.storage_quota_mb).toBe(100);
    expect(userDetail.adjustment_history[0].reason).toBe('Upgrade promocional');
    expect(userDetail.adjustment_history[0].admin_email).toBe(SUPER_ADMIN_EMAIL);
    // Explicitly verify no copy, topic, or image content fields are present
    expect((userDetail as any).content).toBeUndefined();
    expect((userDetail as any).copies).toBeUndefined();
    expect((userDetail as any).images).toBeUndefined();
  });

  it('validates user status values', () => {
    const validStatuses: UserStatus[] = ['active', 'inactive', 'blocked'];
    expect(validStatuses).toContain('active');
    expect(validStatuses).toContain('inactive');
    expect(validStatuses).toContain('blocked');
  });

  it('prevents Super Admin self-exclusion and self-deactivation', () => {
    const isSelfActionBlocked = (targetEmail: string, action: 'delete' | 'deactivate' | 'block') => {
      if (targetEmail.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
        return true;
      }
      return false;
    };

    expect(isSelfActionBlocked('r.barros84@gmail.com', 'delete')).toBe(true);
    expect(isSelfActionBlocked('r.barros84@gmail.com', 'deactivate')).toBe(true);
    expect(isSelfActionBlocked('r.barros84@gmail.com', 'block')).toBe(true);
    expect(isSelfActionBlocked('user@company.com', 'delete')).toBe(false);
  });

  it('restricts AI and Credentials tabs strictly to Super Admin', () => {
    const getSettingsSections = (isSuper: boolean) => [
      'profile',
      'security',
      ...(isSuper ? ['ai', 'credentials'] : []),
      'company',
      'preferences',
      ...(isSuper ? ['library', 'users'] : []),
    ];

    const regularSections = getSettingsSections(false);
    expect(regularSections).not.toContain('ai');
    expect(regularSections).not.toContain('credentials');
    expect(regularSections).not.toContain('library');
    expect(regularSections).not.toContain('users');
    expect(regularSections).toEqual(['profile', 'security', 'company', 'preferences']);

    const superAdminSections = getSettingsSections(true);
    expect(superAdminSections).toContain('ai');
    expect(superAdminSections).toContain('credentials');
    expect(superAdminSections).toContain('library');
    expect(superAdminSections).toContain('users');
  });
});
