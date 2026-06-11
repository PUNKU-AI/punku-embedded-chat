jest.mock('./chatWidget', () => () => null);

import './index';

describe('web component registration', () => {
  it('registers the primary and compatibility tag names', () => {
    expect(customElements.get('punku-chat')).toBeDefined();
    expect(customElements.get('punku-chat-widget')).toBeDefined();
  });
});
