import { waitFor } from '@testing-library/react';

const mockRenderedProps: Record<string, unknown>[] = [];
jest.mock('./chatWidget', () => (props: Record<string, unknown>) => {
  mockRenderedProps.push(props);
  return null;
});

import './index';

describe('web component registration', () => {
  it('registers the primary and compatibility tag names', () => {
    expect(customElements.get('punku-chat')).toBeDefined();
    expect(customElements.get('punku-chat-widget')).toBeDefined();
  });

  it('reads mobile_chat_window_style as JSON', async () => {
    const element = document.createElement('punku-chat');
    element.setAttribute('mobile_chat_window_style', '{"bottom":"65px","height":"calc(98vh - 120px)"}');
    document.body.append(element);

    await waitFor(() => expect(mockRenderedProps[mockRenderedProps.length - 1]?.mobile_chat_window_style)
      .toEqual({ bottom: '65px', height: 'calc(98vh - 120px)' }));
    element.remove();
  });
});
