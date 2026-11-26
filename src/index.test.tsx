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

  it('passes only a real public key to the widget', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const element = document.createElement('punku-chat');
    element.setAttribute('flow_id', 'your-flow-id');
    element.setAttribute('api_key', 'sk-' + 'c'.repeat(24));
    element.setAttribute('publishable_key', 'sk-' + 'c'.repeat(24));
    document.body.append(element);
    await waitFor(() => expect(mockRenderedProps[mockRenderedProps.length - 1]?.api_key).toBe('sk-' + 'c'.repeat(24)));
    expect(mockRenderedProps[mockRenderedProps.length - 1]).not.toHaveProperty('publishable_key');

    element.setAttribute('publishable_key', 'pk_' + 'b'.repeat(32));
    await waitFor(() => expect(mockRenderedProps[mockRenderedProps.length - 1]?.publishable_key).toBe('pk_' + 'b'.repeat(32)));
    element.remove();
    warn.mockRestore();
  });

  it('gives the widget its defaults again for the settings that the live look took back', async () => {
    const element = document.createElement('punku-chat');
    element.setAttribute('flow_id', 'your-flow-id');
    element.setAttribute('window_title', 'Page title');
    document.body.append(element);
    await waitFor(() => expect(mockRenderedProps[mockRenderedProps.length - 1]?.window_title).toBe('Page title'));

    // A removed attribute reaches the component as null (a text) or false (a switch such as online).
    element.setAttribute('online', 'false');
    element.removeAttribute('window_title');
    element.removeAttribute('online');
    element.setAttribute('look_unset', JSON.stringify(['online', 'window_title', 'flow_id']));

    await waitFor(() => {
      const props = mockRenderedProps[mockRenderedProps.length - 1];
      expect(props).not.toHaveProperty('window_title');
      expect(props).not.toHaveProperty('online');
      expect(props).not.toHaveProperty('look_unset');
      // Only look settings can be taken back.
      expect(props.flow_id).toBe('your-flow-id');
    });
    element.remove();
  });
});
