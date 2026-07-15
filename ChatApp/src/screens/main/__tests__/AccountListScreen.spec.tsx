/**
 * Contract verification for business account creation request assembly.
 * Validates that:
 * 1. The old fabricated timestamp key pattern is completely removed
 * 2. The confirmed mediaKey from uploadMedia becomes licenseImageKey in the payload
 * 3. The code statically uses licenseUpload.state.confirmedKey (not any fabricated value)
 * 4. Submit is blocked when no confirmed key exists or upload is active
 */
import * as fs from 'fs';
import * as path from 'path';

describe('AccountListScreen - Business Creation Contract', () => {
  const sourcePath = path.resolve(__dirname, '../AccountListScreen.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');

  it('does NOT contain the old fake-key fabrication pattern', () => {
    // The old defect: setLicenseImageKey(`license/${Date.now()}.jpg`)
    expect(source).not.toMatch(/license\/\$\{Date\.now\(\)\}/);
    expect(source).not.toMatch(/setLicenseImageKey\(`license/);
    expect(source).not.toMatch(/setLicenseImageKey\(/);
  });

  it('uses the confirmed key from the upload hook in payload', () => {
    // The payload must use: licenseImageKey: licenseUpload.state.confirmedKey
    expect(source).toMatch(/licenseImageKey:\s*licenseUpload\.state\.confirmedKey/);
  });

  it('includes logoKey from upload hook when available', () => {
    // logoKey: logoUpload.state.confirmedKey
    expect(source).toMatch(/logoKey:\s*logoUpload\.state\.confirmedKey/);
  });

  it('blocks submission when no confirmed license key', () => {
    // canSubmit includes check for confirmedKey
    expect(source).toMatch(/!!licenseUpload\.state\.confirmedKey/);
  });

  it('blocks submission while any upload is active', () => {
    // isUploadActive checks uploading/replacing/selecting states
    expect(source).toMatch(/isUploadActive/);
    expect(source).toMatch(/licenseUpload\.state\.status\s*===\s*'uploading'/);
    expect(source).toMatch(/!canSubmit/);
  });

  it('uses the real pickImage + uploadMedia flow via useDocumentUpload hook', () => {
    expect(source).toMatch(/useDocumentUpload/);
    // The hook file uses pickImage and uploadMedia from the media service
    const hookPath = path.resolve(__dirname, '../hooks/useDocumentUpload.ts');
    const hookSource = fs.readFileSync(hookPath, 'utf8');
    expect(hookSource).toContain('pickImage');
    expect(hookSource).toContain('uploadMedia');
    expect(hookSource).toContain('mediaUploadService');
    // The hook stores result.mediaKey as confirmedKey
    expect(hookSource).toMatch(/confirmedKey:\s*result\.mediaKey/);
  });

  it('never fabricates a key from Date.now(), local URI, or timestamp', () => {
    // Comprehensive check for any fabrication pattern
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/`license\//);
    expect(source).not.toMatch(/`logo\//);
  });
});
