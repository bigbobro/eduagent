import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PinPad } from './PinPad';

const tick = () => new Promise<void>((r) => queueMicrotask(() => r()));

describe('PinPad', () => {
  it('输完 4 位调 onComplete 传字符串', async () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} />);
    ['1', '2', '3', '4'].forEach((d) => fireEvent.click(screen.getByLabelText(`数字${d}`)));
    await tick();
    expect(onComplete).toHaveBeenCalledWith('1234');
  });
  it('退格删除上一位', async () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} />);
    fireEvent.click(screen.getByLabelText('数字1'));
    fireEvent.click(screen.getByLabelText('退格'));
    fireEvent.click(screen.getByLabelText('数字2'));
    fireEvent.click(screen.getByLabelText('数字3'));
    fireEvent.click(screen.getByLabelText('数字4'));
    fireEvent.click(screen.getByLabelText('数字5'));
    await tick();
    expect(onComplete).toHaveBeenCalledWith('2345');
  });
  it('显示 error', () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} error="不对哦" />);
    expect(screen.getByText('不对哦')).toBeTruthy();
  });
  it('disabled 时点击无效', () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} disabled />);
    fireEvent.click(screen.getByLabelText('数字1'));
    expect(onComplete).not.toHaveBeenCalled();
  });
});
