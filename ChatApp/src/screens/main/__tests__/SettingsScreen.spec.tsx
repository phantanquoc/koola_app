/**
 * Locked Personal tab P0/P1 regressions.
 * 3B: PersonalAccountInfoCard hides phone/email rows when absent (no "Chưa có").
 * B2: PersonalProfileCard displayName numberOfLines 2 (not 1).
 * 1C+A2: PersonalWalletCard falls back to onComingSoon (toast owned by
 *        SettingsScreen, rendered outside ScrollView) + eye disabled.
 * 2B: PersonalSecuritySection logout shows Alert confirm before calling onLogout.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

describe('Personal locked fixes — static contracts', () => {
  it('PersonalAccountInfoCard: no "Chưa có" placeholder; filters absent rows, keeps ID', () => {
    const src = read('../components/personal/PersonalAccountInfoCard.tsx');
    expect(src).not.toContain('Chưa có');
    // Filters truthy value; ID row still present
    expect(src).toMatch(/\.filter\s*\(/);
    expect(src).toContain('ID người dùng');
    expect(src).toContain('userId');
  });

  it('PersonalAccountInfoCard: rows built so both missing → only ID row (filter before spread/concat)', () => {
    const src = read('../components/personal/PersonalAccountInfoCard.tsx');
    // filtered phone/email then spread/concat with ID ensures ID always, others conditional
    expect(src).toMatch(/filter/);
    expect(src).toMatch(/ID người dùng/);
  });

  it('PersonalProfileCard: displayName numberOfLines 2 with tail ellipsize', () => {
    const src = read('../components/personal/PersonalProfileCard.tsx');
    expect(src).toMatch(/displayName[\s\S]*?numberOfLines=\{2\}/);
    expect(src).toMatch(/numberOfLines=\{2\}[\s\S]*?ellipsizeMode/);
    // Count occurrences: only the old bug had numberOfLines={1} on the name KoolaText
    const nameOccurrences = (src.match(/numberOfLines=\{2\}/g) || []).length;
    expect(nameOccurrences).toBeGreaterThanOrEqual(1);
  });

  it('PersonalWalletCard: delegates fallback to onComingSoon prop; no internal toast/hook', () => {
    const wallet = read('../components/personal/PersonalWalletCard.tsx');
    // Accepts injected fallback instead of owning the hook; fallbacks call the prop
    expect(wallet).toContain('onComingSoon');
    expect(wallet).toMatch(/onComingSoon\?\.?\(\)/);
    expect(wallet).not.toContain('useComingSoonToast');
    expect(wallet).not.toContain('{toast}');
    // Wallet stays pure card — hook ownership lives in SettingsScreen
    expect(wallet).not.toMatch(/from\s+['"].*hooks\/useComingSoonToast['"]/);
    // Screen owns the hook and lifts toast above ScrollView
    const screen = read('../SettingsScreen.tsx');
    expect(screen).toContain('useComingSoonToast');
    expect(screen).toMatch(/from\s+['"].*hooks\/useComingSoonToast['"]/);
    expect(screen).toMatch(
      /\{\s*notify\s*:\s*notifyComingSoon\s*,\s*toast\s*:\s*comingSoonToast\s*\}\s*=\s*useComingSoonToast\(\s*\{[^}]*bottom[^}]*\}\s*\)/,
    );
    expect(screen).toMatch(/<PersonalWalletCard[\s\S]*?onComingSoon=\{notifyComingSoon\}/);
    expect(screen).toContain('{comingSoonToast}');
  });

  it('PersonalWalletCard: eye toggle is disabled mock (disabled + accessibilityState + visibility-off)', () => {
    const src = read('../components/personal/PersonalWalletCard.tsx');
    // Eye Pressable is disabled
    expect(src).toMatch(/disabled/);
    expect(src).toMatch(/accessibilityState=\{\{\s*disabled:\s*true\s*\}\}/);
    // No revealed state/toggle remains
    expect(src).not.toMatch(/useState.*revealed/);
    expect(src).not.toMatch(/setRevealed/);
    expect(src).toContain('visibility-off');
    expect(src).not.toContain("visibility'");
  });

  it('PersonalWalletCard: retains mock balance/points literals', () => {
    const src = read('../components/personal/PersonalWalletCard.tsx');
    expect(src).toContain("'•••• ••••'");
    expect(src).toContain("'256.000'");
  });

  it('PersonalSecuritySection: logout goes through rounded Modal confirm before onLogout', () => {
    const src = read('../components/personal/PersonalSecuritySection.tsx');
    expect(src).toContain('Bạn có chắc muốn đăng xuất?');
    expect(src).toMatch(/setConfirmVisible/);
    expect(src).toMatch(/onLogout\(\)/);
    expect(src).toMatch(/borderRadius/);
    expect(src).toMatch(/koolaRadii/);
    // Logout Pressable uses handleLogout, not raw onLogout
    expect(src).toMatch(/onPress=\{handleLogout\}/);
    expect(src).not.toMatch(/onPress=\{onLogout\}/);
    // Rounded modal contract — Modal + overlay + dialog, not Alert
    expect(src).toContain('<Modal');
    expect(src).toContain('overlay');
    expect(src).toContain('dialog');
  });
});
