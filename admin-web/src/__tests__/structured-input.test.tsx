import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyInput, PhoneInput, IntegerInput } from '../components/StructuredInput';

function wrap(ui: (v: string, onChange: (v: string) => void) => JSX.Element, initial = '') {
  function Host() {
    const [v, setV] = useState(initial);
    return ui(v, setV);
  }
  render(<Host />);
  return screen.getByLabelText('f') as HTMLInputElement;
}

describe('MoneyInput', () => {
  it('hiển thị dấu chấm hàng nghìn khi gõ', () => {
    const el = wrap((v, on) => <MoneyInput value={v} onChange={on} aria-label="f" />);
    fireEvent.change(el, { target: { value: '1234567' } });
    expect(el.value).toBe('1.234.567');
  });

  it('xoá hết thì rỗng, không thành "0"', () => {
    const el = wrap((v, on) => <MoneyInput value={v} onChange={on} aria-label="f" />, '89.000');
    fireEvent.change(el, { target: { value: '' } });
    expect(el.value).toBe('');
  });

  it('chặn chữ cái', () => {
    const el = wrap((v, on) => <MoneyInput value={v} onChange={on} aria-label="f" />);
    fireEvent.change(el, { target: { value: 'abc12x3' } });
    expect(el.value).toBe('123');
  });
});

describe('PhoneInput', () => {
  it('gõ liền di động → hiện nhóm 3-3-4', () => {
    const el = wrap((v, on) => <PhoneInput value={v} onChange={on} aria-label="f" />);
    fireEvent.change(el, { target: { value: '0912345678' } });
    expect(el.value).toBe('091 234 5678');
  });

  it('gõ liền cố định 11 số → hiện nhóm 3-4-4', () => {
    const el = wrap((v, on) => <PhoneInput value={v} onChange={on} aria-label="f" />);
    fireEvent.change(el, { target: { value: '02837731122' } });
    expect(el.value).toBe('028 3773 1122');
  });

  it('chỉ giữ chữ số khi người dùng gõ chữ', () => {
    const el = wrap((v, on) => <PhoneInput value={v} onChange={on} aria-label="f" />);
    fireEvent.change(el, { target: { value: '09a1b2' } });
    expect(el.value.replace(/\s/g, '')).toBe('0912');
  });

  it('rời ô thì chuẩn hoá dạng lưu', () => {
    let last = '';
    function Host() {
      const [v, setV] = useState('');
      last = v;
      return <PhoneInput value={v} onChange={setV} aria-label="f" />;
    }
    render(<Host />);
    const el = screen.getByLabelText('f') as HTMLInputElement;
    fireEvent.change(el, { target: { value: '091 234 5678' } });
    fireEvent.blur(el);
    expect(last).toBe('0912345678');
  });
});

describe('IntegerInput', () => {
  it('chặn chữ và dấu', () => {
    const el = wrap((v, on) => <IntegerInput value={v} onChange={on} aria-label="f" />);
    fireEvent.change(el, { target: { value: '15a3' } });
    expect(el.value).toBe('153');
  });

  it('cắt theo maxLength', () => {
    const el = wrap((v, on) => <IntegerInput value={v} onChange={on} maxLength={4} aria-label="f" />);
    fireEvent.change(el, { target: { value: '0123456789' } });
    expect(el.value).toBe('0123');
  });
});
