import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ChatInput, {
  DEFAULT_MAX_LINES,
  computeTextareaHeight,
  getLineHeightPx,
  isComposingEvent,
} from './chatInput';

// jsdom does no layout. The autosize reads scrollHeight and clientHeight, so
// the tests provide them: scrollHeight is the simulated text height and
// clientHeight follows the applied style height.
let simulatedScrollHeight = 64;
// Mirrors the widget CSS: 16px / 1.5 text, 20px vertical padding, no border.
const metricsStyle = {
  fontSize: '16px', lineHeight: 1.5, paddingTop: '20px', paddingBottom: '20px',
  borderTopWidth: '0px', borderBottomWidth: '0px',
};
const LINE = 24;
const ONE_LINE = LINE + 40;
const SIX_LINES = LINE * DEFAULT_MAX_LINES + 40;

beforeAll(() => {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => simulatedScrollHeight,
  });
  Object.defineProperty(HTMLTextAreaElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      return parseFloat(this.style.height) || 0;
    },
  });
});

beforeEach(() => {
  simulatedScrollHeight = ONE_LINE;
});

function Harness({
  initialValue = '',
  onSend = () => {},
  onHeightChange,
  disabled,
}: {
  initialValue?: string;
  onSend?: () => void;
  onHeightChange?: (delta: number) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <ChatInput
      value={value}
      onChange={setValue}
      onSend={onSend}
      disabled={disabled}
      placeholder="Type your message..."
      ariaLabel="Your message"
      className="cl-input-element"
      style={metricsStyle}
      onHeightChange={onHeightChange}
    />
  );
}

const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;

describe('ChatInput', () => {
  describe('rendering', () => {
    it('renders a one-row textarea with placeholder, label, send hint and styles', () => {
      render(<Harness />);
      const textarea = field();
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea.rows).toBe(1);
      expect(textarea.placeholder).toBe('Type your message...');
      expect(textarea).toHaveAttribute('aria-label', 'Your message');
      expect(textarea).toHaveAttribute('enterkeyhint', 'send');
      expect(textarea).toHaveStyle({ fontSize: '16px', lineHeight: '1.5' });
      expect(textarea).not.toBeDisabled();
    });

    it('forwards the ref to the textarea element', () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      render(<ChatInput ref={ref} value="" onChange={() => {}} onSend={() => {}} className="cl-input-element" />);
      expect(ref.current).toBe(field());
    });

    it('disables the field while a message is sending', () => {
      render(<Harness disabled />);
      expect(field()).toBeDisabled();
    });

    it('reports typed text through onChange', () => {
      render(<Harness />);
      fireEvent.change(field(), { target: { value: 'Hello' } });
      expect(field().value).toBe('Hello');
    });
  });

  describe('keyboard', () => {
    it('sends on Enter and blocks the line break', () => {
      const onSend = jest.fn();
      render(<Harness initialValue="Hello" onSend={onSend} />);
      const notPrevented = fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter' });
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(notPrevented).toBe(false);
    });

    it('inserts a line break on Shift+Enter without sending', () => {
      const onSend = jest.fn();
      render(<Harness initialValue="Hello" onSend={onSend} />);
      const notPrevented = fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter', shiftKey: true });
      expect(onSend).not.toHaveBeenCalled();
      expect(notPrevented).toBe(true);
    });

    it('does not send while an IME composition is active', () => {
      const onSend = jest.fn();
      render(<Harness initialValue="こんにちは" onSend={onSend} />);
      const composing = fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter', isComposing: true });
      expect(onSend).not.toHaveBeenCalled();
      expect(composing).toBe(true);
      const legacyComposing = fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter', keyCode: 229 });
      expect(onSend).not.toHaveBeenCalled();
      expect(legacyComposing).toBe(true);
    });

    it('ignores other keys', () => {
      const onSend = jest.fn();
      render(<Harness initialValue="Hello" onSend={onSend} />);
      fireEvent.keyDown(field(), { key: 'a' });
      fireEvent.keyDown(field(), { key: 'Tab' });
      expect(onSend).not.toHaveBeenCalled();
    });

    it('does not send while disabled', () => {
      const onSend = jest.fn();
      render(<Harness initialValue="Hello" onSend={onSend} disabled />);
      fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter' });
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe('auto-grow', () => {
    it('starts one line high and hides the scrollbar', () => {
      render(<Harness />);
      expect(field().style.height).toBe(`${ONE_LINE}px`);
      expect(field().style.overflowY).toBe('hidden');
    });

    it('grows with the text, caps at six lines, then scrolls inside', () => {
      const onHeightChange = jest.fn();
      render(<Harness onHeightChange={onHeightChange} />);

      simulatedScrollHeight = LINE * 3 + 40;
      fireEvent.change(field(), { target: { value: 'one\ntwo\nthree' } });
      expect(field().style.height).toBe(`${LINE * 3 + 40}px`);
      expect(field().style.overflowY).toBe('hidden');
      expect(onHeightChange).toHaveBeenLastCalledWith(LINE * 2);

      simulatedScrollHeight = LINE * 10 + 40;
      fireEvent.change(field(), { target: { value: Array(10).fill('line').join('\n') } });
      expect(field().style.height).toBe(`${SIX_LINES}px`);
      expect(field().style.overflowY).toBe('auto');
      expect(onHeightChange).toHaveBeenLastCalledWith(LINE * 3);
    });

    it('shrinks back to one line after the text is cleared', () => {
      const onHeightChange = jest.fn();
      render(<Harness initialValue={Array(10).fill('line').join('\n')} onHeightChange={onHeightChange} />);
      simulatedScrollHeight = LINE * 10 + 40;
      fireEvent.change(field(), { target: { value: Array(10).fill('line').join('\n') + '!' } });
      expect(field().style.height).toBe(`${SIX_LINES}px`);

      simulatedScrollHeight = ONE_LINE;
      fireEvent.change(field(), { target: { value: '' } });
      expect(field().style.height).toBe(`${ONE_LINE}px`);
      expect(field().style.overflowY).toBe('hidden');
      expect(onHeightChange).toHaveBeenLastCalledWith(ONE_LINE - SIX_LINES);
    });

    it('does not report a height change when the height is unchanged', () => {
      const onHeightChange = jest.fn();
      render(<Harness onHeightChange={onHeightChange} />);
      fireEvent.change(field(), { target: { value: 'still one line' } });
      expect(onHeightChange).not.toHaveBeenCalled();
    });
  });

  describe('scroll containment', () => {
    it('keeps wheel and touch scrolling inside the field', () => {
      render(<Harness />);
      const wheel = jest.fn();
      const touch = jest.fn();
      window.addEventListener('wheel', wheel);
      window.addEventListener('touchmove', touch);
      fireEvent.wheel(field(), { deltaY: 10 });
      fireEvent.touchMove(field());
      expect(wheel).not.toHaveBeenCalled();
      expect(touch).not.toHaveBeenCalled();
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('touchmove', touch);
    });
  });
});

describe('computeTextareaHeight', () => {
  const base = { lineHeight: 24, paddingTop: 20, paddingBottom: 20, borderTop: 0, borderBottom: 0, maxLines: 6 };

  it('never goes below one line', () => {
    expect(computeTextareaHeight({ ...base, scrollHeight: 0 })).toEqual({ height: 64, overflow: false });
    expect(computeTextareaHeight({ ...base, scrollHeight: 50 })).toEqual({ height: 64, overflow: false });
  });

  it('follows the text between one and six lines', () => {
    expect(computeTextareaHeight({ ...base, scrollHeight: 88 })).toEqual({ height: 88, overflow: false });
    expect(computeTextareaHeight({ ...base, scrollHeight: 184 })).toEqual({ height: 184, overflow: false });
  });

  it('caps at six lines and reports the overflow', () => {
    expect(computeTextareaHeight({ ...base, scrollHeight: 208 })).toEqual({ height: 184, overflow: true });
  });

  it('adds the border to the border-box height', () => {
    expect(computeTextareaHeight({ ...base, borderTop: 1, borderBottom: 1, scrollHeight: 88 }))
      .toEqual({ height: 90, overflow: false });
  });

  it('treats a max of zero lines as one line', () => {
    expect(computeTextareaHeight({ ...base, maxLines: 0, scrollHeight: 300 })).toEqual({ height: 64, overflow: true });
  });
});

describe('getLineHeightPx', () => {
  const style = (lineHeight: string, fontSize = '16px') => ({ lineHeight, fontSize }) as CSSStyleDeclaration;

  it('reads a resolved px value', () => {
    expect(getLineHeightPx(style('24px'))).toBe(24);
  });

  it('multiplies a unitless value by the font size', () => {
    expect(getLineHeightPx(style('1.5'))).toBe(24);
    expect(getLineHeightPx(style('1.5', '20px'))).toBe(30);
  });

  it('falls back to 1.2em for "normal" or missing values', () => {
    expect(getLineHeightPx(style('normal'))).toBeCloseTo(19.2);
    expect(getLineHeightPx(style(''))).toBeCloseTo(19.2);
    expect(getLineHeightPx(style('', ''))).toBeCloseTo(19.2);
  });
});

describe('isComposingEvent', () => {
  it('detects the isComposing flag and the legacy 229 key code', () => {
    expect(isComposingEvent({ nativeEvent: { isComposing: true }, keyCode: 13 })).toBe(true);
    expect(isComposingEvent({ nativeEvent: { isComposing: false }, keyCode: 229 })).toBe(true);
    expect(isComposingEvent({ nativeEvent: { isComposing: false }, keyCode: 13 })).toBe(false);
    expect(isComposingEvent({})).toBe(false);
  });
});
