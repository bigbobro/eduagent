import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { GlassPanel } from './GlassPanel';
import { Tag } from './Tag';
import { ProgressBar } from './ProgressBar';
import { Banner } from './Banner';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { PushToTalkPill, type PushToTalkState } from './PushToTalkPill';
describe('foundation', () => {
  it('keeps action labels, disabled behavior, status and progress accessible', () => {
    const click = vi.fn();
    render(<GlassPanel><Button onClick={click}>开始</Button><Button disabled onClick={click}>保存</Button><Tag tone="mint">已完成</Tag><ProgressBar label="课程进度" value={130} /><Banner action={<Button size="sm">重试</Button>}>连接失败</Banner><Skeleton /><EmptyState title="还没有记录" action={<Button>去上课</Button>}>上课后会出现在这里</EmptyState></GlassPanel>);
    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('progressbar', { name: '课程进度' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('alert')).toHaveTextContent('连接失败');
    expect(screen.getByRole('status', { name: '正在加载' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '还没有记录' })).toBeInTheDocument();
  });
  it.each<[PushToTalkState, string, boolean]>([['preparing', '麻吉准备中…', true], ['speaking', '麻吉在说话', true], ['awaiting', '按住空格说话', false], ['listening', '正在听…', false], ['thinking', '麻吉在想…', true], ['ending', '下课啦', true]])('%s has the expected label and availability', (state, label, disabled) => {
    const onPress = vi.fn();
    render(<PushToTalkPill state={state} onPress={onPress} onRelease={vi.fn()} />);
    const button = screen.getByRole('button', { name: '按住空格说话' });
    expect(button).toHaveTextContent(label);
    expect((button as HTMLButtonElement).disabled).toBe(disabled);
    fireEvent.keyDown(document, { code: 'Space' });
    fireEvent.keyUp(document, { code: 'Space' });
    expect(onPress).toHaveBeenCalledTimes(state === 'awaiting' ? 1 : 0);
  });
  it('holds Space across the awaiting→listening render and releases once', () => {
    const onPress = vi.fn(), onRelease = vi.fn();
    const { rerender } = render(<PushToTalkPill state="awaiting" onPress={onPress} onRelease={onRelease} />);
    fireEvent.keyDown(document, { code: 'Space' });
    fireEvent.keyDown(document, { code: 'Space', repeat: true });
    rerender(<PushToTalkPill state="listening" onPress={onPress} onRelease={onRelease} />);
    expect(onRelease).not.toHaveBeenCalled();
    fireEvent.keyUp(document, { code: 'Space' });
    fireEvent.keyUp(document, { code: 'Space' });
    expect(onPress).toHaveBeenCalledTimes(1); expect(onRelease).toHaveBeenCalledTimes(1);
  });
  it('ignores Space in inputs and releases a held press when focus leaves the app', () => {
    const onPress = vi.fn(), onRelease = vi.fn();
    render(<><input aria-label="名字" /><PushToTalkPill state="awaiting" onPress={onPress} onRelease={onRelease} /></>);
    screen.getByRole('textbox').focus(); fireEvent.keyDown(document, { code: 'Space' });
    expect(onPress).not.toHaveBeenCalled();
    screen.getByRole('textbox').blur(); fireEvent.keyDown(document, { code: 'Space' }); fireEvent.blur(window);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });
  it('keeps pointer capture active on leave and releases on cancellation', () => {
    const onPress = vi.fn(), onRelease = vi.fn();
    render(<PushToTalkPill state="awaiting" onPress={onPress} onRelease={onRelease} />);
    const button = screen.getByRole('button');
    const event = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 7 });
    fireEvent(button, event); fireEvent.pointerLeave(button);
    expect(onPress).toHaveBeenCalledTimes(1); expect(onRelease).not.toHaveBeenCalled();
    fireEvent.pointerCancel(button); fireEvent.lostPointerCapture(button);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

});
